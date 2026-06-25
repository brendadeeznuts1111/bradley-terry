# @platform/bradley-terry

[![Bun](https://img.shields.io/badge/Bun-1.x-brightgreen)](https://bun.sh)
[![Effect](https://img.shields.io/badge/Effect-3.21-blue)](https://effect.website)
[![Tests](https://img.shields.io/badge/Tests-6%20pass-brightgreen)](#testing)
[![BT Core](https://img.shields.io/badge/BT_Core-v0.3.2-success)](#api)
[![Cascade](https://img.shields.io/badge/Cascade-Integrated-success)](docs/ARCHITECTURE.md)
[![Massey](https://img.shields.io/badge/Massey-Imported-success)](#project-layout)
[![Bench](https://img.shields.io/badge/50k%20matches-87ms-success)](#benchmarks)

A Bun-native, Effect-powered Bradley-Terry rating engine for sports intelligence.
Fits maximum-likelihood strength ratings from win/loss match data using the
Hunter (2004) MM algorithm, with graph-connectivity awareness, time decay,
multiple output scales, and a streaming Massey CSV loader.

## Features

- **MM algorithm fitter** — Hunter (2004) minorization-maximization for exact
  maximum-likelihood Bradley-Terry ratings. Converges in ~150 iterations for
  typical datasets.
- **Effect-TS service** — `BradleyTerry` Context tag + `BradleyTerryLive` layer.
  Compose with other Effect services, layers, and streams.
- **Graph connectivity** — Union-Find detects disconnected match graphs, fits
  the largest connected component, and reports `largestComponentSize` plus a
  warning. Isolated entities are excluded from the fit.
- **Time decay** — Optional `timeDecayHalfLifeDays` weights recent matches more
  heavily using exponential decay with the specified half-life.
- **Output scales** — `arithmetic` (mean = 1), `geometric` (geometric mean = 1),
  or `elo400` (Elo scale centered at 1500 with 400-divisor).
- **Typed errors** — `SelfMatchError`, `InsufficientDataError`,
  `ConvergenceError`, `DisconnectedGraphError`, `EntityNotFoundError` as
  `Data.TaggedError` variants on the `BradleyTerryError` union.
- **Streaming Massey loader** — Effect `Stream`-based CSV ingestion with
  backpressure-friendly line parsing and `MatchRow` schema validation.
- **Property tests** — fast-check invariants for win-probability symmetry,
  monotonicity under added wins, graph-connectivity reporting, and error
  handling.
- **Benchmarks** — 50k matches fit in ~87ms (target: <1.5s). 5k in ~3ms,
  25k in ~8ms.

## Install

```bash
bun install
```

## Quick start

```ts
import { Effect } from "effect";
import { BradleyTerry, BradleyTerryLive } from "./src/bradley-terry";

const matches = [
  { winner: "lakers", loser: "celtics", date: new Date("2026-01-15") },
  { winner: "celtics", loser: "warriors", date: new Date("2026-01-16") },
  { winner: "lakers", loser: "warriors", date: new Date("2026-01-17") },
];

const program = Effect.gen(function* () {
  const bt = yield* BradleyTerry;
  const result = yield* bt.fit(matches, {
    maxIterations: 200,
    timeDecayHalfLifeDays: 90,
    outputScale: "elo400",
  });

  console.log(`Entities: ${result.entityCount}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Log-likelihood: ${result.logLikelihood?.toFixed(4)}`);

  for (const [entity, strength] of result.ratings) {
    console.log(`  ${entity}: ${strength.toFixed(1)}`);
  }

  // Predict win probability
  const pLakersOverWarriors = yield* bt.predictWinProbability(
    result.ratings,
    "lakers" as any,
    "warriors" as any,
  );
  console.log(`P(lakers > warriors) = ${pLakersOverWarriors.toFixed(3)}`);

  return result;
});

await Effect.runPromise(Effect.provide(program, BradleyTerryLive));
```

## API

### `BradleyTerry` (Context tag)

```ts
declare class BradleyTerry extends Context.Tag("BradleyTerry")<
  BradleyTerry,
  {
    fit: (
      matches: readonly Match[],
      config?: Partial<BradleyTerryConfig>,
    ) => Effect.Effect<FitResult, BradleyTerryError>;
    predictWinProbability: (
      ratings: ReadonlyMap<EntityId, number>,
      a: EntityId,
      b: EntityId,
    ) => Effect.Effect<number, BradleyTerryError>;
  };
> {};
```

### `BradleyTerryLive` (Layer)

Default in-memory implementation. Provide via `Effect.provide(program, BradleyTerryLive)`.

### `fit(matches, config?)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxIterations` | `number` | `150` | Cap on MM iterations |
| `tolerance` | `number` | `1e-8` | Convergence threshold on max delta |
| `normalize` | `boolean` | `true` | Whether to apply `outputScale` normalization |
| `timeDecayHalfLifeDays` | `number?` | — | Exponential half-life for recency weighting |
| `homeAdvantage` | `boolean?` | — | Reserved for future home/away support |
| `outputScale` | `"arithmetic" \| "geometric" \| "elo400"` | `"arithmetic"` | Rating scale |

Returns `FitResult`:

```ts
{
  ratings: Map<EntityId, number>;
  iterations: number;
  logLikelihood?: number;
  entityCount: number;
  matchCount: number;
  convergenceDelta?: number;
  warnings?: string[];
  largestComponentSize?: number;
}
```

### `predictWinProbability(ratings, a, b)`

Returns `P(a beats b) = strength(a) / (strength(a) + strength(b))`.
Fails with `EntityNotFoundError` if either entity is not in `ratings`.

## Testing

```bash
bun test
```

6 property tests across 3 files:

| File | Invariant |
| --- | --- |
| `test/property/mm-invariants.test.ts` | Win probabilities symmetric and sum to 1; adding a win for A over B never decreases A's relative strength |
| `test/property/graph-connectivity.test.ts` | `largestComponentSize` reflects the biggest connected component; disconnected graphs still produce valid ratings |
| `test/property/error-handling.test.ts` | Self-matches always produce `SelfMatchError`; empty match list produces `InsufficientDataError` |

## Benchmarks

```bash
bun test ./test/benchmark/bradley-terry.bench.ts   # 50k-match perf target
bun run src/bench/bt-fit.bench.ts                  # 5k + 25k timed runs
```

| Workload | Mean | Min | Target |
| --- | --- | --- | --- |
| 5k matches | 4.7ms | 2.8ms | — |
| 25k matches | 8.9ms | 7.5ms | — |
| 50k matches | 87ms | — | < 1500ms |

The bench script embeds the current git commit hash via a Bun macro
(`getGitCommitHash.ts`) and prints a clickable GitHub commit URL.

## Project layout

```
bradley-terry/
├── src/
│   ├── bradley-terry/index.ts   # Core MM fitter + Effect service
│   ├── schema.ts                # FitResult schema + runtime helpers
│   ├── repository/              # RatingsRepository (SQLite persistence)
│   ├── integrations/cascade-mover.ts  # Cascade signal generation
│   ├── data/massey-loader.ts    # Streaming Massey CSV → MatchRow
│   ├── bench/bt-fit.bench.ts    # 5k + 25k benchmark script
│   └── index.ts                 # Barrel export
├── test/
│   ├── property/                # fast-check invariants (3 files)
│   └── benchmark/               # 50k-match perf test
├── schema.ts                    # EntityId, Match, FitResult, errors (SSOT)
├── massey-loader.ts             # Root-level Massey loader (Effect Stream)
├── match-adapter.ts             # SQLite MatchRow → BT Match pipeline
├── benchmark-loader.ts          # runBench() timing utility
├── bradley-terry.ts             # Root re-export for test imports
├── getGitCommitHash.ts          # Bun macro: embed HEAD hash at build time
└── git-commit.ts                # Bun macro: GIT_COMMIT constant
```

## References

- Hunter, D. R. (2004). *MM algorithms for generalized Bradley-Terry models.*
  The Annals of Statistics, 32(1), 384–406.
- Bradley, R. A., & Terry, M. E. (1952). *Rank analysis of incomplete block
  designs I. The method of paired comparisons.* Biometrika, 39, 324–345.

## License

MIT
