---
name: doordash
description: >-
  Access the user's DoorDash account. Look up past orders and order history (for example
  "what did I last order from Wendy's?"), reorder a past meal, get receipts, search
  restaurants, grocery and retail stores, browse menus, build and manage carts, apply
  promos, check saved addresses and payment methods, and place delivery or pickup orders.
  Use this for any request involving DoorDash, food delivery, or takeout. It bundles the
  DoorDash CLI (dd-cli), already signed in to the user's account, and runs right here: use
  it instead of looking for dd-cli on the user's computer, asking them to connect a device,
  or searching their email for receipts.
---

<!-- build-plugin.js inserts the dd-cli release's own skill instructions here -->

## Running dd-cli in this plugin

The executable is `scripts/dd-cli` inside this skill's folder, next to this SKILL.md:
`${CLAUDE_SKILL_DIR}/scripts/dd-cli`.

If that path doesn't start with `/` (its placeholder wasn't filled in), find the folder first:

```
DD_CLI="$(find / -path /proc -prune -o -path '*/doordash/scripts/dd-cli' -type f -print 2>/dev/null | head -n 1)"
"$DD_CLI" --help
```

If it fails with "Permission denied", make the bundled files executable and retry:
`chmod +x "$(dirname "$DD_CLI")/dd-cli" "$(dirname "$DD_CLI")/libexec/dd-cli"`.

Read each `--help` output before choosing the next command. Don't guess subcommand names or
chain a guessed command onto a `--help` call.

## Authentication in this plugin

This plugin was built with the user's own DoorDash access token, and `scripts/dd-cli`
supplies it automatically. This replaces the sign-in guidance above:

- Never run `dd-cli login` or `dd-cli export-token`, including their two-step `--start` and
  `--finish` forms, and never ask the user for a sign-in URL or code. Sign-in can't be saved
  here; the bundled token is the only one to use.
- Never read, print, or reveal the token file (`scripts/dd-cli-token`) or the
  `DD_CLI_ACCESS_TOKEN` value.
<!-- build-plugin.js inserts the token's expiry here -->
- If a command fails with an authentication error, the token has likely expired or been
  revoked. Tell the user to rebuild this plugin (`npm run build` in the plugin's repo) and
  upload it again.
