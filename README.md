# DoorDash plugin for Claude

Build a personal [Claude plugin](https://claude.com/docs/plugins/overview) that lets Claude order from DoorDash on your behalf, using the official [DoorDash CLI](https://github.com/doordash-oss/doordash-cli) (`dd-cli`).

Downloads a tested `dd-cli` release, signs you in, and assembles a plugin with your DoorDash access token built in.

You then upload the plugin to your own claude.ai account.

> [!WARNING]
> The plugin you build contains **your** DoorDash access token. Anyone who has it can act on your DoorDash account, including placing orders with your saved payment methods, until the token expires. Never share, publish, or commit the built plugin.

## Prerequisites

1. **DoorDash CLI access.** The CLI is waitlist-only. Your DoorDash account must be approved and off the waitlist.
2. **`dd-cli` installed locally** and on your `PATH`, on a machine with a web browser (macOS Apple Silicon or Linux x86_64). Follow the [DoorDash CLI install instructions](https://github.com/doordash-oss/doordash-cli#download), then check that `dd-cli --help` works.
3. **Node.js 18 or later**, plus `curl` and `sha256sum` or `shasum` (preinstalled on macOS and most Linux distributions).

## Build the plugin

```bash
git clone https://github.com/tallpants/doordash-cli-claude-plugin.git
cd doordash-cli-claude-plugin
npm install
npm run build
```

`npm run build`:

1. Runs `dd-cli export-token`, which opens a browser for you to sign in to DoorDash. The token it prints is captured, not shown.
2. Downloads the pinned `dd-cli` Linux x86_64 release from DoorDash's GitHub releases and verifies it against the SHA-256 checksum recorded in `build-plugin.js`.
3. Packages the plugin as `doordash.zip`, ready to upload.

Every build signs you in again and gets a fresh token.

## Install the plugin on claude.ai

> [!IMPORTANT]
> Claude's sandbox can't reach DoorDash until you allow it. Without this step, the plugin installs but `dd-cli` can't connect to DoorDash.

1. In [claude.ai](https://claude.ai), go to **Settings > Capabilities > Domain allowlist** and add `*.doordash.com`.
2. Go to **Customize > Plugins > Add > Upload plugin** and choose `doordash.zip`.

Upload it to **your own account only**. Don't add it through organization settings (**Organization settings > Plugins & skills**), which would hand your token to everyone in your organization.

A plugin installed on your claude.ai account also syncs to your Claude Code sessions.

Then ask Claude something like "Find sushi near me" or "Reorder my last meal".

## When the token expires

Tokens last about 72 hours. With `dd-cli` 0.2.6 or later installed locally, the build prints when yours expires and tells Claude in the skill, so Claude can explain an authentication error after that time.

When Claude reports an authentication error, your token has expired or been revoked. Run `npm run build` again and upload the new zip in place of the old plugin.

## What's in the plugin

```
doordash/                           (inside doordash.zip)
├── .claude-plugin/plugin.json      plugin manifest (version matches the dd-cli release)
├── skills/doordash/
│   ├── SKILL.md                    DoorDash's agent skill, adapted for this plugin
│   ├── scripts/dd-cli              wrapper that supplies your token to the real binary
│   ├── scripts/dd-cli-token        your DoorDash access token
│   └── scripts/libexec/            the dd-cli Linux x86_64 binary and its _internal/ libraries
├── LICENSE.txt                     DoorDash CLI Access Terms of Service
└── THIRD_PARTY_NOTICES.txt
```

- **The token stays out of Claude's context.** It's kept in its own file and loaded by the wrapper, never written into the skill text. The skill also tells Claude never to sign in to DoorDash itself or ask you for sign-in codes, and never to reveal the token.

## Licensing

This repository's build scripts are MIT-licensed (see [LICENSE](LICENSE)). `dd-cli` itself is DoorDash's software, licensed for personal, non-commercial use under the [DoorDash CLI Access Terms of Service](https://github.com/doordash-oss/doordash-cli) included in each release. That's why each person builds their own plugin from DoorDash's release rather than sharing a prebuilt one.
