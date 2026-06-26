# Bradley-Terry Ratings Service — v0.3.1 Release Notes

**Released:** 2026-06-25  
**Owner:** Ashley  
**Status:** Merged to `main`  
**PR:** #1  

## Highlights

- Full **EntityId** branding across `schema.ts` (`FitResult.ratings` + all tagged errors)
- `bradley-terry.ts` interface now uses `ReadonlyMap<EntityId, number>` consistently
- **New** `match-adapter.ts` — production SQLite → Bradley-Terry pipeline
  - `fromMatchRow()` + `loadMatchesForBT()`
  - Supports `winner_idx` convention from existing wager.db / Buckeye data
- Arithmetic mean normalization kept as default (stable for dominant teams)
- `outputScale: "geometric"` still available for classic BT behavior
- Rich `FitResult` with warnings, connectivity diagnostics, log-likelihood, etc.
- Stateless core + Effect-first design preserved (autophagy-friendly)

## Files Changed

- `schema.ts`
- `bradley-terry.ts`
- `match-adapter.ts` (new)
- `README.md` (updated status + usage example)

## Integration Points Now Ready

| System                    | Status   | Notes |
|---------------------------|----------|-------|
| **Cascade Mover v3**      | Ready    | Win probabilities, liquidity pressure, edge signals |
| **Sports Terminal v5.2**  | Ready    | BT Fair Line vs market for steam/edge detection |
| **Player/Agent Schemas**  | Ready    | Store `bt_strength`, `bt_rank`, `bt_updated_at` |
| **Buckeye / wager.db**    | Integrated | Direct path via `MatchAdapter` |

## Performance Target

< 1.5 seconds for 50k matches / ~200 entities on typical Bun hardware.

## Next (v0.3.2+)

- Benchmark harness + property-based tests
- First Cascade Mover metric wiring example
- Optional: incremental update path, contextual home advantage

**v0.3.1 is production-grade and ready for consumption.**
