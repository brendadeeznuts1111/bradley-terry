import { Effect } from "effect";
import {
  type BradleyTerryConfig,
  type EntityId,
  type FitResult,
  type Match,
  ConvergenceError,
  InsufficientDataError,
  SelfMatchError,
} from "../../schema.js";

const defaultConfig: BradleyTerryConfig = {
  maxIterations: 300,
  tolerance: 1e-6,
  normalize: true,
  outputScale: "arithmetic",
};

function normalizeStrengths(
  strengths: Map<EntityId, number>,
  scale: BradleyTerryConfig["outputScale"]
): Map<EntityId, number> {
  const values = [...strengths.values()];
  if (values.length === 0) return strengths;

  let factor = 1;
  if (scale === "arithmetic") {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    factor = mean > 0 ? 1 / mean : 1;
  } else if (scale === "geometric") {
    const logSum = values.reduce((a, b) => a + Math.log(b), 0);
    const geo = Math.exp(logSum / values.length);
    factor = geo > 0 ? 1 / geo : 1;
  } else if (scale === "elo400") {
    factor = 400;
  }

  const out = new Map<EntityId, number>();
  for (const [id, s] of strengths) {
    out.set(id, scale === "elo400" ? 400 * Math.log10(s) : s * factor);
  }
  return out;
}

export function fit(
  matches: readonly Match[],
  config: BradleyTerryConfig = defaultConfig
): Effect.Effect<FitResult, InsufficientDataError | ConvergenceError | SelfMatchError> {
  return Effect.gen(function* () {
    if (matches.length < 1) {
      return yield* Effect.fail(
        new InsufficientDataError({ message: "No matches provided", matchCount: 0 })
      );
    }

    const entities = new Set<EntityId>();
    const wins = new Map<EntityId, number>();
    const nPairs = new Map<string, number>();

    for (const m of matches) {
      if (m.winner === m.loser) {
        return yield* Effect.fail(new SelfMatchError({ entity: m.winner }));
      }
      entities.add(m.winner);
      entities.add(m.loser);
      wins.set(m.winner, (wins.get(m.winner) ?? 0) + (m.weight ?? 1));
      const key = [m.winner, m.loser].sort().join("\0");
      nPairs.set(key, (nPairs.get(key) ?? 0) + (m.weight ?? 1));
    }

    const entityList = [...entities];
    const strengths = new Map<EntityId, number>(
      entityList.map((e) => [e, 1])
    );

    const maxIterations = config.maxIterations ?? 150;
    const tolerance = config.tolerance ?? 1e-8;
    let iterations = 0;
    let convergenceDelta = Number.POSITIVE_INFINITY;

    while (iterations < maxIterations) {
      const next = new Map<EntityId, number>();
      for (const entity of entityList) {
        let denom = 0;
        for (const other of entityList) {
          if (entity === other) continue;
          const key = [entity, other].sort().join("\0");
          const n = nPairs.get(key) ?? 0;
          if (n === 0) continue;
          const sE = strengths.get(entity) ?? 1;
          const sO = strengths.get(other) ?? 1;
          denom += n / (sE + sO);
        }
        const w = wins.get(entity) ?? 0;
        const raw = denom > 0 ? w / denom : 0;
        next.set(entity, Math.max(raw, 1e-12));
      }

      // Geometric-mean normalization each iteration (prevents drift / oscillation)
      const logSum = entityList.reduce(
        (acc, e) => acc + Math.log(Math.max(next.get(e) ?? 1, 1e-12)),
        0
      );
      const geoMean = Math.exp(logSum / entityList.length);
      for (const entity of entityList) {
        next.set(entity, (next.get(entity) ?? 1) / geoMean);
      }

      let maxDelta = 0;
      for (const entity of entityList) {
        const prev = strengths.get(entity) ?? 1;
        const cur = next.get(entity) ?? 1;
        maxDelta = Math.max(maxDelta, Math.abs(cur - prev) / Math.max(prev, 1e-12));
        strengths.set(entity, cur);
      }

      convergenceDelta = maxDelta;
      iterations++;
      if (maxDelta < tolerance) break;
    }

    if (convergenceDelta >= tolerance) {
      return yield* Effect.fail(
        new ConvergenceError({
          message: "Bradley-Terry did not converge within tolerance",
          iterations,
        })
      );
    }

    const normalized = config.normalize
      ? normalizeStrengths(strengths, config.outputScale ?? "arithmetic")
      : strengths;

    return {
      ratings: normalized,
      iterations,
      entityCount: entityList.length,
      matchCount: matches.length,
      convergenceDelta,
    };
  });
}

export const BradleyTerry = { fit };
