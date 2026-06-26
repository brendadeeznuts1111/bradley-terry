# Release Notes — v0.3.32

**Tag:** `v0.3.32`
**Branch:** `feature/v0.3.2-testing` → `main` (PR #2)
**Theme:** Core engine implementation, property tests, benchmarks, repo hygiene

## Highlights

This release ships the **actual Bradley-Terry fitter** — the core
`src/bradley-terry/index.ts` module that was previously a 0-LOC placeholder
across v0.2.6–v0.3.1. Alongside the implementation, it adds property-based
tests, a 50k-match benchmark, and repo hygiene files.

## Added

### Core engine (`src/bradley-terry/index.ts`)

- **`BradleyTerry` Context tag** + **`BradleyTerryLive` Layer** — Effect-TS
  service with `fit()` and `predictWinProbability()`
- **MM algorithm** (Hunter 2004) — minorization-maximization for exact
  maximum-likelihood ratings. Float64 typed arrays for strengths and win
  counts.
- **Union-Find graph connectivity** — detects disconnected match graphs, fits
  the largest connected component, excludes isolated entities, reports
  `largestComponentSize` + a warning
- **Time decay** — optional `timeDecayHalfLifeDays` for exponential recency
  weighting (`0.5^((t_ref - t_match) / halfLife)`)
- **Output scales** — `arithmetic` (mean = 1), `geometric` (geo mean = 1),
  `elo400` (Elo scale centered at 1500, 400-divisor)
- **Log-likelihood** — `Σ w · log(s_w / (s_w + s_l))` reported in `FitResult`
- **Typed errors** — `SelfMatchError`, `InsufficientDataError`,
  `ConvergenceError`, `DisconnectedGraphError`, `EntityNotFoundError` on the
  `BradleyTerryError` union

### Property tests (`test/property/`)

- `mm-invariants.test.ts` — win probabilities symmetric and sum to 1; adding a
  win for A over B never decreases A's relative strength (40 + 30 runs)
- `graph-connectivity.test.ts` — `largestComponentSize` reflects the biggest
  connected component; disconnected graphs still produce valid ratings
  (30 + 25 runs)
- `error-handling.test.ts` — self-matches always produce `SelfMatchError`;
  empty match list produces `InsufficientDataError` (20 runs + 1 static)

### Benchmarks

- `test/benchmark/bradley-terry.bench.ts` — 50k-match perf target (<1.5s)
- `src/bench/bt-fit.bench.ts` — 5k + 25k timed runs via `runBench()`
- `benchmark-loader.ts` — `runBench()` utility (mean/min/max/total)
- `getGitCommitHash.ts` + `git-commit.ts` — Bun macros to embed the current
  git commit hash at build time; bench output prints a clickable GitHub URL

### Repo hygiene

- `.editorconfig` — consistent coding standards (2-space indent, LF, UTF-8)
- `.gitattributes` — consistent line endings across platforms
- `.github/CODEOWNERS` — explicit review ownership

### Docs

- `README.md` — full rewrite: features, install, quick start, API reference,
  testing, benchmarks, project layout, references
- `docs/ARCHITECTURE.md` — full rewrite: layer diagram, data flow, per-layer
  description, testing strategy, performance notes
- `RELEASE_NOTES_v0.3.32.md` — this file

## Fixed

- **Missing `fast-check` dependency** — added `fast-check@4.8.0` to
  `devDependencies` (was imported by tests but never declared)
- **fast-check 4.x import pattern** — changed `import { fc } from "fast-check"`
  to `import fc from "fast-check"` (4.x ships `fc` as default export)
- **fast-check 4.x float constraints** — wrapped `fc.float` min/max in
  `Math.fround()` (4.x requires 32-bit floats)
- **Effect `Cause` unwrapping in error tests** — use `Cause.failureOption()`
  instead of `expect(cause).toBeInstanceOf(Error)` (the `Cause` wrapper is not
  the error itself)
- **`entityCount` semantics** — now reports total distinct entities in input,
  not the filtered largest-component count (so `largestComponentSize <
  entityCount` holds for disconnected graphs)
- **Import resolution** — added root `bradley-terry.ts` re-export so
  `../../bradley-terry` resolves from `test/property/` and `test/benchmark/`
- **Missing `benchmark-loader` module** — created `benchmark-loader.ts` with
  `runBench()` (was imported by `src/bench/bt-fit.bench.ts` but didn't exist)

## Performance

| Workload | Mean | Min | Target |
| --- | --- | --- | --- |
| 5k matches | 4.7ms | 2.8ms | — |
| 25k matches | 8.9ms | 7.5ms | — |
| 50k matches | 87ms | — | < 1500ms ✅ |

Measured on Apple Silicon with Bun 1.4. 50k-match fit is **17x under target**.

## Test results

```
6 pass, 0 fail, 368 expect() calls
Ran 6 tests across 3 files. [176ms]
```

## Breaking changes

None. The v0.2.6–v0.3.1 stub `src/bradley-terry/index.ts` exported nothing, so
there are no existing consumers to break. The new module is purely additive.

## Dependencies

- `effect@3.21.4` (pinned from `latest`)
- `@types/bun@1.3.14` (pinned from `latest`)
- `fast-check@4.8.0` (new devDependency)

## Migration from v0.3.1

No migration required. Existing schema types (`EntityId`, `Match`,
`FitResult`, `BradleyTerryConfig`, errors) are unchanged. The new
`BradleyTerry` / `BradleyTerryLive` exports are additive.
