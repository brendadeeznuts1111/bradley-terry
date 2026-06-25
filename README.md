# @bradley-terry

**Production-grade Bradley-Terry ratings service** built with **Effect + Bun** by Ashley (@brendadeeznuts1111).

## Quick Start

```bash
git clone https://github.com/brendadeeznuts1111/bradley-terry.git
cd bradley-terry
bun run examples/usage-complete.ts
```

Loads **both** SQLite (`SqliteLoader`) + test data → `toBtMatches()` converter → `BradleyTerry.fit()` → win probs + rankings.

**Key files**: `src/bradley-terry.ts` | `examples/usage-complete.ts` | `src/converters/to-bt-matches.ts` | PRD in `/docs/`

**Owner**: Ashley • **Status**: v0.2.1 Ready • Integrates with Sports Terminal + Cascade Mover

See `examples/usage-complete.ts` for complete runnable pipeline.