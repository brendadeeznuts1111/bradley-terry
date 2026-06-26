# Merge playbook

Step-by-step guide to land open PRs without losing work from any branch.

## Recommended order

```
main ──merge──► PR #2 (feature/v0.3.2-testing)
                  │
                  └──rebase──► PR #4 (cursor/effect-architecture-docs-d821)

PR #3 (cursor/setup-dev-environment-fae3) ──close──► superseded by AGENTS.md on #4
```

| PR | Branch | Action |
|----|--------|--------|
| **#2** | `feature/v0.3.2-testing` | **Merge first** — production BT core, property tests, benchmarks |
| **#4** | `cursor/effect-architecture-docs-d821` | **Rebase onto main after #2** — keep service layer + secrets + HTTP |
| **#3** | `cursor/setup-dev-environment-fae3` | **Close** — stale; `AGENTS.md` lives on #4 |

## PR #2 — merge checklist

- [ ] Review BT core: Union-Find, time decay, elo400, property tests
- [ ] Run locally: `bun install && bun ci` (or `bun test` + `bun run check:full`)
- [ ] Squash or merge per repo preference
- [ ] Tag release if desired (`v0.3.32`)

## PR #4 — rebase checklist (after #2 on main)

```bash
git fetch origin
git checkout cursor/effect-architecture-docs-d821
git rebase origin/main
```

### Expected conflicts and resolution

| File | Resolution |
|------|------------|
| `.github/workflows/ci.yml` | Keep #2's `bun ci` + `check:full`; ensure `bun test` covers `tests/` (service + secrets) |
| `package.json` | Keep #2 name/version/scripts; add #4 `start` → server, `secret` script |
| `bun.lock` | Regenerate: `bun install` after merging package.json |
| `docs/ARCHITECTURE.md` | Keep #4 6-layer doc; fold in any #2 architecture notes if present |
| `README.md` | Combine #2 badges/test counts with #4 quick-start + API table |
| `src/bradley-terry/index.ts` | **Take #2** — production `fit()`; delete #4 simplified MLE |
| `src/index.ts` | Export #2 core + #4 `secrets/`, `service/`, `server/` |
| `src/schema.ts` / `schema.ts` | **Take #2** schema; ensure `MatchRowSchema` and service schemas align |
| `src/secrets/*` | **Take #4** — no equivalent on #2 |

### Post-rebase verification

```bash
bun install
bun test                    # all tests/ + test/ from #2
bun run start               # HTTP server boots
bun run secret get com.bradley-terry.massey api-token  # optional
```

### Wire BTCompute to #2 core

After rebase, `src/service/bt-compute.ts` should import `BradleyTerry.fit` from #2's `src/bradley-terry/` — remove any duplicate iterative MLE from the rebase conflict resolution.

## PR #3 — close rationale

PR #3 only added an early `AGENTS.md` (35 lines) and `bun.lock` when the repo was mostly stubs. PR #4 includes an updated `AGENTS.md` with current layout, secrets, HTTP routes, and this merge guide.

## CI note

GitHub Actions may show billing-lock failures unrelated to code. Validate locally with `bun test` before merging.

## Current PR #4 standalone status

Mergeable on its own only if #2 is **not** required for your use case (simplified BT core). For production rankings, follow the order above.

**20 tests** in `tests/` on branch `cursor/effect-architecture-docs-d821` (pre-rebase).
