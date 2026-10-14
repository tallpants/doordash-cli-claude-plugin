#!/usr/bin/env node
// Build a personal DoorDash Claude plugin from a pinned dd-cli Linux AMD64 release,
// with the builder's DoorDash access token baked in.
// Usage: npm run build   →   doordash.zip
//
// The token comes from running the locally installed `dd-cli export-token` (browser
// sign-in). The output contains that token: treat doordash.zip like a password.

import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { ZipArchive } from "archiver";
import { $, echo, fs, glob, path, tmpdir, which } from "zx";
import * as tar from "tar";

const REPO = "doordash-oss/doordash-cli";
const PLATFORM = "linux-amd64";

// Pinned because the build depends on release internals (binary name, _internal/ layout,
// SKILL.md wording). To upgrade, update both values, then rebuild and test the plugin.
// The checksum is DoorDash's published SHA-256 for dd-cli-v<version>-linux-amd64.tar.gz.
const DD_CLI_VERSION = "0.2.5";
const DD_CLI_SHA256 = "caef8f3450b11c6e8c0ffca16e335b7fa74a6d0bc673e34ddd2239528c96629d";

const PLUGIN_NAME = "doordash";
const UPSTREAM_SKILL_NAME = "dd-cli-usage";
const SKILL_NAME = "doordash";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ZIP_PATH = path.join(ROOT, `${PLUGIN_NAME}.zip`);
const TOKEN_FILE = "dd-cli-token";

// Static plugin files, copied into the plugin as-is. claude.ai and Cowork refuse plugins with
// a top-level bin/, and claude.ai chat copies only the skill's own folder into its sandbox, so
// dd-cli goes in the skill's scripts/ and the skill's SKILL.md says how to run it.
const TEMPLATE_DIR = path.join(ROOT, "plugin");
// The line in the template SKILL.md that the release's own skill instructions replace.
const UPSTREAM_MARKER = "<!-- build-plugin.js inserts the dd-cli release's own skill instructions here -->";

// The release's skill says dd-cli is on PATH, which isn't true in the plugin.
const PATH_SENTENCE = "`dd-cli` is available on PATH.";
const PATH_REPLACEMENT =
  "`dd-cli` is bundled with this skill and is NOT on PATH: wherever this skill shows " +
  "`dd-cli <args>`, run the bundled executable instead, as described in " +
  '"Running dd-cli in this plugin" below.';

// Loads the token from the bundled file (unless the environment already provides one) and
// runs the real binary.
const WRAPPER = `#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -z "$DD_CLI_ACCESS_TOKEN" ]; then
  DD_CLI_ACCESS_TOKEN="$(cat "$DIR/${TOKEN_FILE}")"
fi
export DD_CLI_ACCESS_TOKEN
exec "$DIR/libexec/dd-cli" "$@"
`;

async function getAccessToken() {
  if (!(await which("dd-cli", { nothrow: true }))) {
    throw new Error("dd-cli not found on PATH: install it locally so the build can run `dd-cli export-token`.");
  }
  echo`Running \`dd-cli export-token\` (sign in with the browser window it opens)...`;
  // The token is the only thing on stdout; sign-in prompts go to stderr, so show those.
  const out = await $({ stdio: ["inherit", "pipe", "inherit"] })`dd-cli export-token`;
  const token = out.stdout.trim().split("\n").pop()?.trim();
  if (!token) throw new Error("`dd-cli export-token` did not print a token.");
  return token;
}

/**
 * Downloads, verifies and extracts the pinned release into `dest`.
 * Returns the release tag and the path of the extracted release directory.
 */
async function downloadRelease(dest) {
  const tag = `v${DD_CLI_VERSION}`;
  const asset = `dd-cli-${tag}-${PLATFORM}.tar.gz`;
  const $$ = $({ cwd: dest });

  echo`Downloading ${asset}...`;
  await $$`curl -fsSLO https://github.com/${REPO}/releases/download/${tag}/${asset}`;

  // Verify against the checksum pinned here, not one fetched from the same release.
  // Linux ships sha256sum; macOS ships shasum.
  await fs.writeFile(path.join(dest, `${asset}.sha256`), `${DD_CLI_SHA256}  ${asset}\n`);
  const sha256Check = (await which("sha256sum", { nothrow: true }))
    ? ["sha256sum", "-c"]
    : ["shasum", "-a", "256", "-c"];
  echo((await $$`${sha256Check} ${asset}.sha256`).stdout.trim());

  await tar.x({ file: path.join(dest, asset), cwd: dest });
  return { tag, releaseDir: path.join(dest, `dd-cli-${tag}-${PLATFORM}`) };
}

const token = await getAccessToken();

const workDir = tmpdir();
try {
  const { tag, releaseDir } = await downloadRelease(workDir);

  // Assemble the plugin in the work dir; only the zip lands in the repo.
  const pluginDir = path.join(workDir, PLUGIN_NAME);
  await fs.copy(TEMPLATE_DIR, pluginDir);
  await fs.ensureDir(path.join(pluginDir, ".claude-plugin"));

  await fs.writeJson(
    path.join(pluginDir, ".claude-plugin", "plugin.json"),
    {
      name: PLUGIN_NAME,
      displayName: "DoorDash",
      version: tag.replace(/^v/, ""),
      description:
        "Lets Claude use your DoorDash account: order history, reorders, receipts, store and menu search, carts, and checkout, through a bundled, signed-in DoorDash CLI (dd-cli).",
      author: { name: "Adithya Reddy" },
      keywords: ["doordash", "food", "delivery", "groceries"],
    },
    { spaces: 2 },
  );

  // The binary is a PyInstaller onedir build: it loads _internal/ from its own directory,
  // so both must sit side by side. Renaming the binary itself is fine (install.sh does too).
  const skillDir = path.join(pluginDir, "skills", SKILL_NAME);
  const scriptsDir = path.join(skillDir, "scripts");
  const libexecDir = path.join(scriptsDir, "libexec");
  await fs.copy(path.join(releaseDir, `dd-cli-${tag}-${PLATFORM}`), path.join(libexecDir, "dd-cli"));
  await fs.copy(path.join(releaseDir, "_internal"), path.join(libexecDir, "_internal"));
  await fs.chmod(path.join(libexecDir, "dd-cli"), 0o755);

  // claude.ai rejects uploads that contain nested zips. base_library.zip holds part of
  // Python's stdlib; _internal/ is also on the binary's import path, so unpacking it there
  // loads the same modules.
  const baseLibrary = path.join(libexecDir, "_internal", "base_library.zip");
  new AdmZip(baseLibrary).extractAllTo(path.dirname(baseLibrary), false);
  await fs.remove(baseLibrary);

  await fs.outputFile(path.join(scriptsDir, "dd-cli"), WRAPPER, { mode: 0o755 });
  await fs.outputFile(path.join(scriptsDir, TOKEN_FILE), `${token}\n`, { mode: 0o600 });

  const skillPath = path.join(skillDir, "SKILL.md");
  const template = await fs.readFile(skillPath, "utf8");
  if (!template.includes(UPSTREAM_MARKER)) {
    throw new Error(`plugin/skills/${SKILL_NAME}/SKILL.md is missing the line: ${UPSTREAM_MARKER}`);
  }
  const upstream = await fs.readFile(
    path.join(releaseDir, "skills", UPSTREAM_SKILL_NAME, "SKILL.md"),
    "utf8",
  );
  if (!upstream.includes(PATH_SENTENCE)) {
    throw new Error(
      `Upstream SKILL.md no longer contains "${PATH_SENTENCE}"; update PATH_SENTENCE in build-plugin.js.`,
    );
  }
  // Drop the release's frontmatter; the template has the plugin's own name and description.
  const instructions = upstream
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(PATH_SENTENCE, PATH_REPLACEMENT)
    .trim();
  await fs.writeFile(skillPath, template.replace(UPSTREAM_MARKER, () => instructions));

  // dd-cli is DoorDash's proprietary software; keep its terms and attributions with it.
  for (const file of ["LICENSE.txt", "THIRD_PARTY_NOTICES.txt"]) {
    await fs.copy(path.join(releaseDir, file), path.join(pluginDir, file));
  }

  const nestedZips = (await glob("**/*.zip", { cwd: pluginDir, dot: true })).sort();
  if (nestedZips.length) {
    throw new Error(`claude.ai rejects nested zip files, but the plugin contains: ${nestedZips.join(", ")}`);
  }

  // Zip entries keep their Unix permissions, so the wrapper and binary stay executable.
  // Remove any old zip first so the new one is created owner-only.
  await fs.remove(ZIP_PATH);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const written = pipeline(archive, fs.createWriteStream(ZIP_PATH, { mode: 0o600 }));
  archive.directory(pluginDir, PLUGIN_NAME);
  await archive.finalize();
  await written;

  echo`Built ${PLUGIN_NAME} plugin (dd-cli ${tag}) at ${path.relative(process.cwd(), ZIP_PATH)}`;
  echo`It contains your DoorDash access token: don't share or commit it.`;
} finally {
  await fs.remove(workDir);
}
