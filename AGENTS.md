# AGENTS.md

## Cursor Cloud specific instructions

This repo is the `@platform/bradley-terry` library: a stateless Bradley-Terry
pairwise-comparison ratings engine written in TypeScript on the **Bun** runtime
using the **Effect** framework. There are no long-running services, servers, or
databases to start — it is a library that reads local files (CSV) and embedded
SQLite (via Bun's built-in APIs) in-process.

Standard commands live in `package.json` (`scripts`): `start`, `dev`, `test`,
`lint`. Run them with Bun, e.g. `bun run start`, `bun test`, `bun run lint`.

Non-obvious caveats discovered during setup (these reflect the repo's current
early/partially-stubbed state, not environment problems — do not "fix" them as
part of unrelated work):

- The runtime is **Bun** (not Node). Bun is installed in the VM snapshot and is
  on `PATH` via `~/.bashrc`. The update script only runs `bun install`.
- `bun run start` runs `examples/usage-complete.ts`, which is currently a
  comment-only stub, so it exits 0 with no output. CI (`.github/workflows/ci.yml`)
  runs exactly `bun install && bun run start`.
- `bun test` reports "No tests found" — there are no `*.test.ts`/`*.spec.ts`
  files in the repo yet.
- `bun run lint` (Biome) currently reports pre-existing formatting/import-sort
  errors and exits non-zero. These are repo code-style issues, not env issues.
- `src/index.ts` and most files under `src/` are placeholder comments and import
  modules that do not exist yet (e.g. `./data/massey-importer`, `./sqlite-loader`,
  a real `bradley-terry` impl), so importing the barrel `src/index.ts` will fail.
- The only fully-implemented module is the **root** `schema.ts` (Effect Schema
  definitions for `Match`, `EntityId`, `BradleyTerryConfig`, `FitResult`, and
  tagged error types). Note `schema.ts`'s `BradleyTerryConfigSchema` has a latent
  decode bug: `Schema.decodeUnknown(BradleyTerryConfigSchema)({})` throws inside
  Effect ("parser is not a function") due to the chained `optionalWith` usage —
  decoding `MatchSchema`/`EntityId` works fine.
