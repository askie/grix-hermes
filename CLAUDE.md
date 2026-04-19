# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build        # tsc — compiles .ts to .js in-place (same directory)
npm run typecheck    # tsc --noEmit
npm run clean        # removes compiled .js/.js.map/.d.ts where a sibling .ts exists
npm test             # clean + build + node --test tests/*.test.js
npm run test:watch   # tsx --test tests/*.test.ts (dev watch mode)
npm run list         # node bin/grix-hermes.js list — shows all 9 skills
npm run manifest     # node bin/grix-hermes.js manifest — JSON manifest
```

Run a single test file:
```bash
tsx --test tests/smoke.test.ts
```

Publish:
```bash
npm version patch --no-git-tag-version   # bump version
npm publish                               # prepack (clean+build) runs automatically
```

## Architecture

**Package**: `@dhf-hermes/grix` — a Hermes skill bundle published to npm. Installs 9 skills into `~/.hermes/skills/grix-hermes`.

**In-place compilation**: TypeScript compiles `.ts` → `.js` in the same directory (`rootDir` = `outDir` = `.`). `.gitignore` excludes `**/*.js` except `scripts/clean_build.mjs`. Never manually edit `.js` files.

### Key layers

- **`bin/grix-hermes.ts`** — CLI entry point (npm binary). Commands: `list`, `manifest`, `install`, `help`. The `install` command copies the bundle + `node_modules` to a target dir and optionally sets up a daily cron job via `hermes cron add`.
- **`lib/manifest.ts`** — Skill definitions (`SKILLS` array), project root resolution, install entries enumeration.
- **`shared/cli/`** — Central WebSocket CLI infrastructure:
  - `aibot-client.ts` — `AibotWsClient` class for Grix Aibot Agent API (auth handshake, seq-based request/response correlation)
  - `actions.ts` — Action implementations (query, send, group, admin, unsend, key_rotate)
  - `grix-hermes.ts` — CLI dispatcher for the shared WS commands
  - `config.ts` — Config resolution chain: CLI flags > env vars > `~/.hermes/.env` > `~/.hermes/config.yaml`
  - `targets.ts` — Target resolution (session/route to resolved session, unsend plan)
  - `skill-wrapper.ts` — Spawns `grix-hermes.js` as child process for thin skill shims
  - `card-links.ts` — Grix deep-link card generation
- **`shared/types/`** — `Envelope<T>` discriminated union (`{ok, data}` | `{ok:false, error}`), `BindRequest/Result`, `InstallContext`

### Skill structure

Each of the 9 skills follows this layout:

```
<skill-name>/
  SKILL.md           # Frontmatter + instruction docs for the AI agent (in Chinese)
  agents/
    openai.yaml      # Hermes agent interface definition
  scripts/
    <skill>.ts       # Executable helper(s)
  references/        # (optional) Additional docs
```

### Skills overview

| Skill | Role |
|---|---|
| `grix-admin` | Remote agent creation + local Hermes profile binding |
| `grix-egg` | Full install-flow orchestrator (WS or HTTP path) |
| `grix-group` | Grix group lifecycle (CRUD, members, roles) |
| `grix-query` | Read-only: contact/session/message lookup |
| `grix-register` | HTTP-based Grix registration + first-agent bootstrap |
| `grix-update` | Bundle self-update (`npm update -g` + reinstall) |
| `message-send` | Message sending + card links |
| `message-unsend` | Silent message retraction |
| `grix-key-rotate` | API key rotation with `.env` file update (WS path, no plaintext output) |

### Core patterns

- **Thin-shim pattern**: Most skill scripts (`group.ts`, `query.ts`, `send.ts`, `unsend.ts`, `admin.ts`, `grix-key-rotate.ts`) are 3-line files importing `runSharedCliAction` from `shared/cli/skill-wrapper.ts`, delegating to the shared WS CLI. Real logic lives in `shared/cli/`.
- **Dual-path routing**: WS path (grix-admin) used when `GRIX_ENDPOINT` + `GRIX_AGENT_ID` + `GRIX_API_KEY` are present; HTTP path (grix-register) as fallback.
- **Envelope output**: All scripts output `{ok: true, data}` or `{ok: false, error}` JSON.
- **Profile management**: `bind_local.ts` + `patch_profile_config.ts` manage Hermes profiles, `.env` files, and `config.yaml` skill visibility.

## 统一出站端到端测试

grix-hermes 是技能包而非 AI 适配器，不代理到 AI 模型，因此不适用统一的出站 E2E 测试。出站 E2E 测试仅适用于有 AI 模型交互的适配器（Claude、Gemini、Qwen、Codex、OpenClaw）。
