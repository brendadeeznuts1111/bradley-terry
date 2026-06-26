# Merge playbook

Historical guide for landing PRs #2–#4. **All merge work is complete** as of 2026-06-26.

## Final status

| PR | Branch | Status |
|----|--------|--------|
| **#2** | `feature/v0.3.2-testing` | Merged → `main` (v0.3.32 BT core) |
| **#4** | `cursor/effect-architecture-docs-d821` | Merged → `main` (HTTP service, secrets, OpenAPI) |
| **#5** | `cursor/request-logging-rate-limits-d821` | Merged → `main` (request logging, refresh rate limits) |
| **#3** | `cursor/setup-dev-environment-fae3` | **Close manually** — superseded by `AGENTS.md` on `main` |

Current `main` includes production Bradley-Terry MM fitter, Effect HTTP service, secrets layer, OpenAPI, structured request logs, and per-IP refresh rate limiting.

## Verify on `main`

```bash
bun install
bun test                    # tests/ + test/
bun run start               # http://localhost:3000
curl -s localhost:3000/openapi.json | jq .info.title
curl -s -X POST localhost:3000/api/ratings/refresh  # rate-limited per IP
```

## Historical merge order (reference)

```
main ──merge──► PR #2 (feature/v0.3.2-testing)
                  │
                  └──integrate──► PR #4 (effect-architecture)
                                    │
                                    └──► PR #5 (logging + rate limits)
```

### Conflict resolution (PR #4 onto #2)

| File | Resolution |
|------|------------|
| `src/bradley-terry/index.ts` | Take #2 production MM fitter |
| `src/secrets/*` | Take #4 SecretClient + backends |
| `src/service/*`, `src/server/*` | Take #4 HTTP layer |
| `package.json` | #2 scripts + #4 `start`, `secret`, `ci` |
| `docs/ARCHITECTURE.md` | Keep #4 six-layer matrix |

`BTCompute` imports `BradleyTerry` + `BradleyTerryLive` from #2 — no duplicate MLE.

## CI note

GitHub Actions may show billing-lock failures unrelated to code. Validate locally with `bun test` before merging.
