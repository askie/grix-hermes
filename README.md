---
name: grix-hermes
description: Hermes skill bundle installer. Installs the grix-hermes bundle, configures Hermes skills directory, enables 8 skill directories, sets up a daily update cron job, and provides post-install verification.
---

# Grix Hermes

`grix-hermes` is a Hermes skill bundle published to npm. After installation, Hermes can load 8 Grix skills and their shared runtime.

## Capabilities

- Installs `@dhf-hermes/grix` to `~/.hermes/skills/grix-hermes`
- Provides the Hermes `skills.external_dirs` path
- Provides 8 Grix skill directories
- Creates a daily update cron job
- Outputs skill list and manifest for post-install verification

## Quick Install

```bash
npx @dhf-hermes/grix install
```

Install actions:

1. Fetches the latest `@dhf-hermes/grix` via npm
2. Installs the full bundle to `~/.hermes/skills/grix-hermes`
3. Creates a daily update cron job: `grix-hermes-daily-update`, runs at 06:00

Post-install verification:

```bash
node ~/.hermes/skills/grix-hermes/bin/grix-hermes.js list
node ~/.hermes/skills/grix-hermes/bin/grix-hermes.js manifest
hermes skills list
```

## Manual Install

Manual install is for environments that need explicit control over the install directory and Hermes profile.

### 1. Determine Hermes directory

Default `HERMES_HOME`:

```text
~/.hermes
```

Default install directory:

```text
~/.hermes/skills/grix-hermes
```

When using a custom `HERMES_HOME`, replace `~/.hermes` in the paths below with your directory.

### 2. Fetch the npm package

```bash
tmp="$(mktemp -d)"
npm install --prefix "$tmp/prefix" @dhf-hermes/grix
```

Package directory:

```text
$tmp/prefix/node_modules/@dhf-hermes/grix
```

### 3. Install the full bundle

```bash
install_dir="${HERMES_HOME:-$HOME/.hermes}/skills/grix-hermes"
node "$tmp/prefix/node_modules/@dhf-hermes/grix/bin/grix-hermes.js" install --dest "$install_dir" --force --skip-cron
```

The full bundle contains:

- `bin`
- `lib`
- `shared`
- 8 skill directories
- Bundled `node_modules`

### 4. Configure Hermes

Edit the target Hermes profile config file:

- Default profile: `~/.hermes/config.yaml`
- Named profile: `~/.hermes/profiles/<PROFILE_NAME>/config.yaml`

Configure `skills.external_dirs`:

```yaml
skills:
  external_dirs:
    - ~/.hermes/skills/grix-hermes
```

Visible skills for the target profile:

- `grix-admin`
- `grix-egg`
- `grix-group`
- `grix-query`
- `grix-register`
- `grix-update`
- `message-send`
- `message-unsend`

### 5. Configure daily updates

```bash
hermes cron add --name grix-hermes-daily-update --skill grix-update "0 6 * * *" 'Use the grix-update skill with {"install_dir":"~/.hermes/skills/grix-hermes"}'
```

### 6. Clean up temp directory

```bash
rm -rf "$tmp"
```

## Skill List

| Skill | Capability |
| --- | --- |
| `grix-admin` | Remote Grix Agent management: API agents, categories, assignment, status, and API key rotation |
| `grix-egg` | Hermes Agent incubation orchestration: empty agent creation, profile binding, gateway startup, and acceptance |
| `grix-group` | Grix group lifecycle management: create, query, members, and roles |
| `grix-query` | Contact, session, and message lookup |
| `grix-register` | HTTP registration, login, and API agent creation |
| `grix-update` | Skill bundle update and reinstall to Hermes skills directory |
| `message-send` | Message sending and Grix deep-link card generation |
| `message-unsend` | Message retraction |

## Installation Verification

```bash
node ~/.hermes/skills/grix-hermes/bin/grix-hermes.js list
node ~/.hermes/skills/grix-hermes/bin/grix-hermes.js manifest
hermes skills list
```

Acceptance criteria:

- `list` shows 8 skills
- `manifest` outputs `grix-hermes` and 8 skill entries
- `hermes skills list` scans `~/.hermes/skills/grix-hermes`
