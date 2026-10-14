# AGENTS.md

Notes for anyone (human or agent) changing this repo. User-facing docs are in [README.md](README.md).

## What this is

`npm run build` (`build-plugin.js`) turns DoorDash's `dd-cli` release into a personal Claude plugin, `doordash.zip` at the repo root, that the user uploads to their own claude.ai account. The build:

1. Runs the user's locally installed `dd-cli export-token` (browser sign-in) and captures the token from stdout.
2. Downloads the pinned `dd-cli` Linux x86_64 release and checks it against the SHA-256 pinned in the script.
3. Copies `plugin/` (static plugin files) into a temporary folder and adds the manifest, binary, wrapper, and token.
4. Zips it to `doordash.zip` (owner-only permissions) and deletes the temporary folder.

## Layout

- `build-plugin.js`: the whole build. ESM, uses `zx` for shell steps, `tar` to unpack the release, `adm-zip` to unpack `base_library.zip`, `archiver` to write the zip.
- `plugin/`: copied into the plugin as-is. `plugin/skills/doordash/SKILL.md` is the skill text; the build replaces its marker line with the release's own skill instructions.
- `doordash.zip`: build output. Contains the user's token. Git-ignored; never commit it.

## Constraints learned from testing on claude.ai

Don't undo these without re-testing an upload:

- **No top-level `bin/`.** claude.ai and Cowork refuse to install a plugin that has one.
- **Everything the skill runs must be inside the skill folder.** claude.ai chat copies only `skills/<name>/` into its sandbox, so `dd-cli` lives in `skills/doordash/scripts/`.
- **Placeholders aren't filled in on claude.ai chat.** Claude Code and Cowork replace `${CLAUDE_SKILL_DIR}` in SKILL.md; chat leaves it literal, and `${CLAUDE_PLUGIN_ROOT}` isn't available to commands either. SKILL.md gives a `find` fallback. In chat, the skill has shown up under `/root/.claude/plugins/synced/<id>/doordash/skills/doordash/`.
- **No nested zips.** Upload fails with "Zip cannot contain nested zip files". The binary's `_internal/base_library.zip` is unpacked into `_internal/` instead (Python finds the same modules there), and the build fails if any other `.zip` appears.
- **Network access must be allowed by the user.** `*.doordash.com` has to be in claude.ai's **Settings > Capabilities > Domain allowlist**, or `dd-cli` can't reach DoorDash from the sandbox. The README's install steps cover this.
- **Limits:** 5,000 files and 200 MB per plugin. The current build is about 293 files and 16 MB zipped.
- **Skill discovery depends on the description.** The skill is named `doordash` and its description lists what it can do and says it runs in the sandbox. Before that, Claude went looking for dd-cli on the user's computer or in their email instead.

## The dd-cli binary

- It's a PyInstaller "onedir" build: the executable loads `_internal/` from its own directory, so the two must stay side by side. Renaming the executable is fine.
- `scripts/dd-cli` is a small `sh` wrapper that reads `scripts/dd-cli-token` into `DD_CLI_ACCESS_TOKEN` and runs `scripts/libexec/dd-cli`. Keep the token out of SKILL.md so it never enters Claude's context.
- The executable bits must survive zipping (`archiver` keeps them); SKILL.md tells Claude to `chmod +x` if they don't.
- Tokens from `export-token` expire after a few days, so users rebuild and re-upload.

## Upgrading dd-cli

The version is pinned (`DD_CLI_VERSION`, `DD_CLI_SHA256` in `build-plugin.js`) because the build depends on release internals: the binary's file name, the `_internal/` layout, and the exact sentence in the release's SKILL.md that says `dd-cli` is on PATH (`PATH_SENTENCE`). To upgrade:

1. Update both constants (the checksum is the `.sha256` file published next to the release's `linux-amd64` asset).
2. Build and check that it doesn't fail on `PATH_SENTENCE`, the marker line, or nested zips.
3. Upload to claude.ai and confirm Claude can find the skill, run `--help`, and read the account (for example order history) before relying on it.

## Testing without a real sign-in

Put a stand-in `dd-cli` first on `PATH` so the build doesn't open a browser or capture a real token:

```bash
mkdir -p /tmp/stub-bin
printf '#!/bin/sh\necho "STUB-TOKEN"\n' > /tmp/stub-bin/dd-cli && chmod +x /tmp/stub-bin/dd-cli
PATH="/tmp/stub-bin:$PATH" npm run build
```

This overwrites `doordash.zip`, so move a real build aside first. Then:

- `claude plugin validate` doesn't accept zips; unzip and validate the folder: `unzip -q doordash.zip -d /tmp/out && claude plugin validate /tmp/out/doordash --strict`.
- `zipinfo doordash.zip` shows permissions; both `dd-cli` files should be `-rwxr-xr-x` and the token `-rw-------`.
- The Linux binary won't run on macOS. To test changes to how the binary is laid out, try them on DoorDash's `darwin-arm64` release, which is the same PyInstaller layout.
- The real end-to-end test is uploading to claude.ai and asking something like "What was my last order from Wendy's on DoorDash?" without naming the skill.

## Handling the token

- Never print, log, or commit the token or `doordash.zip`. When inspecting a real build, list the zip (`zipinfo`) rather than extracting the token file.
- The user should upload to their own account only, not through organization settings, which would share the token with the whole org.
- DoorDash's CLI license is personal and non-transferable, which is why each user builds their own plugin rather than sharing a prebuilt zip.
