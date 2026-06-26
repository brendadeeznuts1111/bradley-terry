# Merge playbook

Guide for landing stacked PRs onto `main`.

## Final status (2026-06-26)

| PR | Branch | Status |
|----|--------|--------|
| **#10** | `cursor/completions-bunfig-regen-d821` | Merged → `main` (Bun 1.4.0 completions regen, bunfig settings) |
| **#11** | `cursor/completions-llms-batch-d821` | Merged → `main` (docs/upstream audits, console-depth tests) |
| **#13** | `cursor/preserving-work-backlog-884c` | Merged → `main` (SqliteLoader, doc drift guard, ARCHITECTURE sync) |
| **#12** | `cursor/bradley-terry-docs-canvas-884c` | Merged (canvas lives in IDE `canvases/` path, not repo) |
| **#15** | `cursor/bun-stable-upgrade-docs-884c` | Merged → `main` (canary ↔ stable upgrade docs) |
| **#3** | `cursor/setup-dev-environment-fae3` | **Close manually** — superseded by `AGENTS.md` on `main` |

### Post-merge fixes on `main`

| Commit | Description |
|--------|-------------|
| `9b49635` | Completions gap: parse standalone `-i`, regen on Bun 1.4.0 |
| `af44666` | Bun upgrade docs (`--canary` / `--stable`) in AGENTS.md + BUN_RUNTIME.md |

Current `main` includes: production BT fitter, Effect HTTP service, Bun 1.4.0 completions pipeline, SqliteLoader library path, doc drift tests, and Bun version upgrade guidance.

### Historical (prior stack)

| PR | Branch | Status |
|----|--------|--------|
| **#2** | `feature/v0.3.2-testing` | Merged → `main` (v0.3.32 BT core) |
| **#4** | `cursor/effect-architecture-docs-d821` | Merged → `main` (HTTP service, secrets, OpenAPI) |
| **#5** | `cursor/request-logging-rate-limits-d821` | Merged → `main` (request logging, refresh rate limits) |

## Stacked merge order (2026-06-26)

```
main ──► PR #10 (completions bunfig regen)
           │
           └──► PR #11 (completions batch + upstream audit)
                     │
                     └──► PR #13 (SqliteLoader + preserving-work docs)
```

### Conflict resolution (#13 onto #11)

| File | Resolution |
|------|------------|
| `AGENTS.md` | Completions pipeline (#11) + library data paths (#13) |
| `README.md` | Test counts/completions (#11) + SQLite library section (#13) |
| `package.json` | Audit scripts (#11) + `start:example:sqlite` (#13) |

## Verify on `main`

```bash
bun install
bun test                    # 172 tests (requires Bun 1.4.0 for full check:full)
bun run ci                  # test + lint
bun run check:full          # completions drift + bench (Bun 1.4.0+)
bun run start               # http://localhost:3000
bun run examples/usage-sqlite.ts
curl -s localhost:3000/openapi.json | jq .info.title
```

## CI note

GitHub Actions may show billing-lock failures unrelated to code. Validate locally with `bun test` on **Bun 1.4.0** before merging.

## Bun version

```bash
bun upgrade --canary   # back to 1.4.0 for this repo
bun upgrade --stable   # when you're done with canary-only work elsewhere
```

See [AGENTS.md](../AGENTS.md#bun-version) and [BUN_RUNTIME.md](BUN_RUNTIME.md#version--upgrades).
