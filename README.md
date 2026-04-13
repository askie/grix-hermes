# grix-hermes

`grix-hermes` is a set of Grix skills for Hermes.

The npm package name is `@dhf-hermes/grix`, and the installed command is `grix-hermes`.

## One-Line Install

```bash
npx -y @dhf-hermes/grix install
```

By default, the bundle is installed to:

```text
~/.hermes/skills/grix-hermes
```

## Included Skills

- `grix-admin`
- `grix-egg`
- `grix-group`
- `grix-query`
- `grix-register`
- `grix-update`
- `message-send`
- `message-unsend`

## Recommended Usage

The recommended setup is simple:

1. Install `grix-hermes` once
2. Let multiple Hermes profiles share the same skill directory
3. Keep each profile's own `.env`, `config.yaml`, and `SOUL.md`

This way, you update the code once and every profile picks it up.

## Main Agent vs Other Agents

Default behavior:

- Main agent: keeps all skills enabled
- Other agents: disable `grix-admin`, `grix-register`, `grix-update`, and `grix-egg` by default

That means regular business agents keep the runtime skills for querying, group operations, sending messages, and unsending messages.

## Common Commands

```bash
grix-hermes list
grix-hermes manifest
grix-hermes install
grix-hermes install --dest ~/.hermes/skills/grix-hermes --force
```

## Verify After Install

```bash
grix-hermes list
grix-hermes manifest
hermes skills list
```
