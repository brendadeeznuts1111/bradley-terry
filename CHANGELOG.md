## v0.3.2

- **Core engine implemented** — `src/bradley-terry/index.ts` MM fitter with
  `BradleyTerry` service + `BradleyTerryLive` layer (was a 0-LOC placeholder)
- Union-Find graph connectivity, time decay, three output scales
  (arithmetic / geometric / elo400), log-likelihood reporting
- Property tests: mm-invariants, graph-connectivity, error-handling (6 tests)
- Benchmarks: 50k matches in 87ms (target <1.5s), 5k in 3ms, 25k in 8ms
- Bun macros for embedding git commit hash in bench output
- Repo hygiene: `.editorconfig`, `.gitattributes`, `CODEOWNERS`
- Pinned `effect@3.21.4`, `@types/bun@1.3.14`; added `fast-check@4.8.0`
- Full README + ARCHITECTURE rewrite

## v0.3.1

- EntityId branding in `FitResult` and all tagged errors
- `match-adapter.ts` — SQLite MatchRow → BT Match pipeline
- `massey-loader.ts` — Effect Stream-based Massey CSV loader

## v0.3.0

- Barrel exports, import path standardization
- Cascade integration layer
- README badges + release assets

## v0.2.7

- Massey FIFA CSV importer + backtesting
- Documentation overhaul
- All previous increments documented.
