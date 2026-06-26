# @platform/bradley-terry

[![Bun](https://img.shields.io/badge/Bun-1.x-brightgreen)](https://bun.sh)
[![Effect](https://img.shields.io/badge/Effect-3.21-blue)](https://effect.website)
[![Tests](https://img.shields.io/badge/Tests-141%20pass-brightgreen)](#testing)
[![BT Core](https://img.shields.io/badge/BT_Core-v0.3.32-success)](#api)
[![HTTP](https://img.shields.io/badge/HTTP-Service-blue)](#http-service)
[![Massey](https://img.shields.io/badge/Massey-Imported-success)](#project-layout)
[![Bench](https://img.shields.io/badge/50k%20matches-87ms-success)](#benchmarks)

A Bun-native, Effect-powered Bradley-Terry rating engine for sports intelligence.
Fits maximum-likelihood strength ratings from win/loss match data using the
Hunter (2004) MM algorithm, with graph-connectivity awareness, time decay,
multiple output scales, and a streaming Massey CSV loader.

The integrated HTTP service ingests Massey JSON, computes BT ratings via the
production MM fitter, and persists snapshots in SQLite.

## Install

```bash
bun install
```

## HTTP service

```bash
bun test
bun run start          # http://localhost:3000
```

### API routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health, DB stats, secrets backend |
| `GET` | `/api/ratings/bt` | Current BT ratings (`?sport=&season=`) |
| `GET` | `/api/ratings/history` | Historical snapshots with `snapshotAt` |
| `POST` | `/api/ratings/refresh` | Fetch Massey → compute BT → store |

Full reference with curl examples: [docs/API.md](docs/API.md). Copy [`.env.example`](.env.example) for local config.

### Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP listen port |
| `DB_PATH` | `./data/ratings.db` | SQLite file path |
| `MASSEY_URL` | Massey JSON endpoint | Upstream data source |
| `MASSEY_API_TOKEN` | — | Bearer token (env secret backend) |
| `SECRETS_BACKEND` | `auto` | `auto` \| `env` \| `bun` \| `vault` |
| `REFRESH_INTERVAL` | `3600` | Auto-refresh seconds (`0` = off) |
| `CORS_ORIGIN` | `*` | CORS allow-origin header |

See [`.env.example`](.env.example) for all variables. Secrets use reverse-domain namespaces (`com.bradley-terry.massey/api-token`). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [AGENTS.md](AGENTS.md), and [docs/MERGE.md](docs/MERGE.md) for architecture, agent conventions, and merge order.

### Secret CLI

```bash
bun run secret set com.bradley-terry.massey api-token "token" --ttl 3600
bun run secret get com.bradley-terry.massey api-token
```

## Library quick start

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

## Features

- **MM algorithm fitter** — Hunter (2004) minorization-maximization for exact
  maximum-likelihood Bradley-Terry ratings. Converges in ~150 iterations for
  typical datasets.
- **Effect-TS service** — `BradleyTerry` Context tag + `BradleyTerryLive` layer.
  Compose with other Effect services, layers, and streams.
- **HTTP ratings service** — `MasseyClient`, `RatingsDB`, `BTCompute` layers with
  auto-refresh scheduler, CORS, enhanced `/health`, and historical snapshots.
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

141 tests across 16 files:

| File | Count | Purpose |
| --- | --- | --- |
| `test/completion-matrix.unit.test.ts` | 61 | Completion matrix helpers |
| `test/completions/shell-completions.unit.test.ts` | 12 | Generated bash/zsh/fish shell completion scripts |
| `test/completions/snapshot.unit.test.ts` | 21 | Snapshot contracts for completion artifacts |
| `test/integration/cli-completions.test.ts` | 7 | CLI completions generator integration tests |
| `test/property/error-handling.test.ts` | 7 | Tagged error invariants |
| `test/property/graph-connectivity.test.ts` | 2 | Connected-component reporting |
| `test/property/mm-invariants.test.ts` | 2 | Win-probability symmetry and monotonicity |
| `test/ratings-config.unit.test.ts` | 2 | Ratings config |
| `tests/*.test.ts` | 27 | HTTP service, secrets TTL, refresh integration |

## Updating snapshots

Generated artifact snapshots live in `test/completions/__snapshots__/`. They lock structure while ignoring dynamic values (hashes, timestamps, versions) via property matchers.

```bash
bun run test:snapshots:update   # regenerate all snapshots
```

Regenerate when the completion matrix schema, header format, or markdown table output intentionally changes, then commit the updated `.snap` file.

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
(`src/utils/git-commit.ts`) and prints a clickable GitHub commit URL.

## Shell completions

Generate static bash, zsh, and fish completions from `completions/bun-cli.json`:

```bash
bun run completions:shell
```

This writes:

- `completions/shell/bun.bash`
- `completions/shell/bun.zsh`
- `completions/shell/bun.fish`

Source them manually or install them into your shell's completion directory
(`/etc/bash_completion.d/`, `~/.zsh/completions/`, `~/.config/fish/completions/`).

Generated completions cover all 23 top-level Bun commands, including:

- **Package management**: `install`, `add`, `remove`, `update`, `link`, `unlink`, `outdated`, `audit`, `publish`, `patch`
- **Runtime & test**: `run`, `test`, `exec`, `repl`, `x`/`bunx`
- **Build & tooling**: `build`, `init`, `create`, `pm`, `info`, `why`, `upgrade`, `feedback`

Each completion includes contextual descriptions and, where documented, valid choice values (e.g. `--target browser|bun|node`, `--backend clonefile|hardlink|symlink|copyfile`). Fish completions also use `bun getcompletes` for dynamic suggestions such as `package.json` scripts, test files, and package names.

## Project layout

```
bradley-terry/
├── src/
│   ├── bradley-terry/index.ts   # Core MM fitter + Effect service
│   ├── schema.ts                # EntityId, Match, FitResult, errors (SSOT)
│   ├── secrets/                 # SecretClient + Bun/env/vault backends
│   ├── service/                 # MasseyClient, RatingsDB, BTCompute layers
│   ├── server/                  # Bun.serve HTTP handlers + shared runtime
│   ├── repository/              # sqlite-loader (SQLite persistence layer)
│   ├── data/massey-loader.ts    # Streaming Massey CSV → MatchRow
│   ├── match-adapter.ts         # SQLite MatchRow → BT Match pipeline
│   ├── bench/                   # Benchmark utilities and scripts
│   ├── utils/                   # Bun macros and helpers
│   └── index.ts                 # Barrel export
├── tests/                       # HTTP service + secrets integration tests
├── test/
│   ├── property/                # fast-check invariants (3 files)
│   └── benchmark/               # 50k-match perf test
├── docs/
│   ├── ARCHITECTURE.md          # 6-layer service architecture matrix
│   ├── API.md                   # HTTP route reference
│   ├── MERGE.md                 # PR merge playbook
│   └── releases/                # Historical release notes and assets
├── completions/
│   ├── bun-cli.json             # Parsed Bun CLI flag/completion data
│   ├── COMPLETION_MATRIX.md     # Human-readable command matrix
│   ├── DYNAMIC_SOURCES.json     # Completion source metadata + hashes
│   └── shell/                   # Generated bash/zsh/fish completions
├── bradley-terry.ts             # Root re-export for test imports
└── scripts/
    ├── generate-cli-completions.ts
    ├── make-completion-matrix.ts
    ├── check-completion-drift.ts
    └── generate-shell-completions.ts
```

## References

- Hunter, D. R. (2004). *MM algorithms for generalized Bradley-Terry models.*
  The Annals of Statistics, 32(1), 384–406.
- Bradley, R. A., & Terry, M. E. (1952). *Rank analysis of incomplete block
  designs I. The method of paired comparisons.* Biometrika, 39, 324–345.

## License

MIT
