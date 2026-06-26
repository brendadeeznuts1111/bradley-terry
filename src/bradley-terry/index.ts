import { Context, Effect, Layer } from "effect";
import type {
	BradleyTerryConfig,
	BradleyTerryError,
	ConvergenceError,
	DisconnectedGraphError,
	EntityId,
	EntityNotFoundError,
	FitResult,
	InsufficientDataError,
	Match,
	SelfMatchError,
} from "../schema";
import {
	ConvergenceError as ConvergenceErrorCtor,
	DisconnectedGraphError as DisconnectedGraphErrorCtor,
	EntityNotFoundError as EntityNotFoundErrorCtor,
	InsufficientDataError as InsufficientDataErrorCtor,
	SelfMatchError as SelfMatchErrorCtor,
} from "../schema";

// ============================================
// Service Definition
// ============================================

export class BradleyTerry extends Context.Tag("BradleyTerry")<
	BradleyTerry,
	{
		readonly fit: (
			matches: readonly Match[],
			config?: Partial<BradleyTerryConfig>,
		) => Effect.Effect<FitResult, BradleyTerryError>;

		readonly predictWinProbability: (
			ratings: ReadonlyMap<EntityId, number>,
			a: EntityId,
			b: EntityId,
		) => Effect.Effect<number, BradleyTerryError>;
	}
>() {}

// ============================================
// Union-Find for graph connectivity
// ============================================

class UnionFind {
	private parent: Map<string, string> = new Map();
	private rank: Map<string, number> = new Map();

	add(entity: string): void {
		if (!this.parent.has(entity)) {
			this.parent.set(entity, entity);
			this.rank.set(entity, 0);
		}
	}

	find(entity: string): string {
		let root = entity;
		while (this.parent.get(root) !== root) {
			root = this.parent.get(root)!;
		}
		// path compression
		let current = entity;
		while (this.parent.get(current) !== root) {
			const next = this.parent.get(current)!;
			this.parent.set(current, root);
			current = next;
		}
		return root;
	}

	union(a: string, b: string): void {
		const rootA = this.find(a);
		const rootB = this.find(b);
		if (rootA === rootB) return;

		const rankA = this.rank.get(rootA)!;
		const rankB = this.rank.get(rootB)!;
		if (rankA < rankB) {
			this.parent.set(rootA, rootB);
		} else if (rankA > rankB) {
			this.parent.set(rootB, rootA);
		} else {
			this.parent.set(rootB, rootA);
			this.rank.set(rootA, rankA + 1);
		}
	}

	largestComponentSize(entities: readonly string[]): number {
		const componentSizes = new Map<string, number>();
		for (const e of entities) {
			const root = this.find(e);
			componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1);
		}
		let max = 0;
		for (const size of componentSizes.values()) {
			if (size > max) max = size;
		}
		return max;
	}

	componentCount(entities: readonly string[]): number {
		const roots = new Set<string>();
		for (const e of entities) {
			roots.add(this.find(e));
		}
		return roots.size;
	}

	isolatedEntities(entities: readonly string[]): string[] {
		const componentSizes = new Map<string, number>();
		for (const e of entities) {
			const root = this.find(e);
			componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1);
		}
		return entities.filter((e) => componentSizes.get(this.find(e))! === 1);
	}
}

// ============================================
// Core fitting algorithm (MM / Hunter 2004)
// ============================================

interface InternalMatch {
	winner: string;
	loser: string;
	weight: number;
	timestamp: number | null;
}

function computeTimeDecayWeight(
	matchTimestamp: number | null,
	halfLifeDays: number | undefined,
	referenceTime: number,
): number {
	if (matchTimestamp === null || halfLifeDays === undefined) return 1;
	const daysDiff = (referenceTime - matchTimestamp) / (1000 * 60 * 60 * 24);
	if (daysDiff <= 0) return 1;
	return 0.5 ** (daysDiff / halfLifeDays);
}

function fitMM(
	matches: readonly InternalMatch[],
	entities: readonly string[],
	config: BradleyTerryConfig,
): {
	ratings: Map<string, number>;
	iterations: number;
	convergenceDelta: number;
	logLikelihood: number;
} {
	const n = entities.length;
	const entityIndex = new Map<string, number>();
	entities.forEach((e, i) => entityIndex.set(e, i));

	// Build win counts and matchup counts
	const wins = new Float64Array(n);
	// matchupMatrix[i][j] = number of matches between i and j (weighted)
	// For MM: p_i = W_i / sum_j (n_ij / (pi_i + pi_j))
	// We store opponents as adjacency for sparse iteration
	const opponents: Map<number, Map<number, number>> = new Map();

	for (let i = 0; i < n; i++) opponents.set(i, new Map());

	for (const m of matches) {
		const wi = entityIndex.get(m.winner)!;
		const li = entityIndex.get(m.loser)!;
		wins[wi] += m.weight;
		const oppMap = opponents.get(wi)!;
		oppMap.set(li, (oppMap.get(li) ?? 0) + m.weight);
		const oppMapL = opponents.get(li)!;
		oppMapL.set(wi, (oppMapL.get(wi) ?? 0) + m.weight);
	}

	// Initialize strengths to 1.0
	const strengths = new Float64Array(n).fill(1.0);

	let lastDelta = Infinity;
	let iter = 0;

	for (; iter < config.maxIterations; iter++) {
		const newStrengths = new Float64Array(n);

		for (let i = 0; i < n; i++) {
			const oppMap = opponents.get(i)!;
			let denominator = 0;
			for (const [j, n_ij] of oppMap) {
				denominator += n_ij / (strengths[i] + strengths[j]);
			}
			if (denominator > 0) {
				newStrengths[i] = wins[i] / denominator;
			} else {
				// No matchups for this entity — keep at 1.0
				newStrengths[i] = strengths[i];
			}
		}

		// Check convergence
		let maxDelta = 0;
		for (let i = 0; i < n; i++) {
			const delta = Math.abs(newStrengths[i] - strengths[i]);
			if (delta > maxDelta) maxDelta = delta;
		}

		newStrengths.forEach((v, i) => (strengths[i] = v));
		lastDelta = maxDelta;

		if (maxDelta < config.tolerance) {
			iter++;
			break;
		}
	}

	// Compute log-likelihood
	let logLikelihood = 0;
	for (const m of matches) {
		const wi = entityIndex.get(m.winner)!;
		const li = entityIndex.get(m.loser)!;
		const sW = strengths[wi];
		const sL = strengths[li];
		if (sW > 0 && sL > 0) {
			logLikelihood += m.weight * (Math.log(sW) - Math.log(sW + sL));
		}
	}

	return {
		ratings: new Map(entities.map((e, i) => [e, strengths[i]])),
		iterations: iter,
		convergenceDelta: lastDelta,
		logLikelihood,
	};
}

function scaleRatings(
	ratings: Map<string, number>,
	scale: "geometric" | "arithmetic" | "elo400",
): Map<string, number> {
	if (scale === "arithmetic") {
		// Normalize so mean = 1
		const values = Array.from(ratings.values());
		if (values.length === 0) return ratings;
		const mean = values.reduce((a, b) => a + b, 0) / values.length;
		if (mean === 0) return ratings;
		const scaled = new Map<string, number>();
		for (const [k, v] of ratings) scaled.set(k, v / mean);
		return scaled;
	}

	if (scale === "geometric") {
		// Normalize so geometric mean = 1
		const values = Array.from(ratings.values());
		if (values.length === 0) return ratings;
		let logSum = 0;
		for (const v of values) logSum += Math.log(v);
		const geoMean = Math.exp(logSum / values.length);
		if (geoMean === 0) return ratings;
		const scaled = new Map<string, number>();
		for (const [k, v] of ratings) scaled.set(k, v / geoMean);
		return scaled;
	}

	// elo400: convert to Elo scale with 400 divisor
	// Elo = 400 * log10(strength), centered at 1500
	const values = Array.from(ratings.values());
	if (values.length === 0) return ratings;
	let logSum = 0;
	for (const v of values) logSum += Math.log(v);
	const geoMean = Math.exp(logSum / values.length);
	const scaled = new Map<string, number>();
	for (const [k, v] of ratings) {
		scaled.set(k, 1500 + 400 * Math.log10(v / geoMean));
	}
	return scaled;
}

// ============================================
// Live Layer Implementation
// ============================================

export const BradleyTerryLive = Layer.succeed(
	BradleyTerry,
	BradleyTerry.of({
		fit: (matches, configOverride) =>
			Effect.gen(function* () {
				// Merge config with defaults
				const config: BradleyTerryConfig = {
					maxIterations: configOverride?.maxIterations ?? 150,
					tolerance: configOverride?.tolerance ?? 1e-8,
					normalize: configOverride?.normalize ?? true,
					timeDecayHalfLifeDays: configOverride?.timeDecayHalfLifeDays,
					homeAdvantage: configOverride?.homeAdvantage,
					outputScale: configOverride?.outputScale ?? "arithmetic",
				};

				// Validate: empty matches
				if (matches.length === 0) {
					return yield* Effect.fail(
						new InsufficientDataErrorCtor({
							message: "Cannot fit Bradley-Terry model with zero matches",
							matchCount: 0,
						}),
					);
				}

				// Validate: self-matches
				for (const m of matches) {
					if (m.winner === m.loser) {
						return yield* Effect.fail(
							new SelfMatchErrorCtor({ entity: m.winner }),
						);
					}
				}

				// Validate: insufficient data (need at least 2 entities)
				const entitySet = new Set<string>();
				for (const m of matches) {
					entitySet.add(m.winner);
					entitySet.add(m.loser);
				}

				if (entitySet.size < 2) {
					return yield* Effect.fail(
						new InsufficientDataErrorCtor({
							message:
								"Need at least 2 distinct entities to fit Bradley-Terry model",
							matchCount: matches.length,
						}),
					);
				}

				const entities = Array.from(entitySet);

				// Build graph and check connectivity
				const uf = new UnionFind();
				entities.forEach((e) => uf.add(e));
				for (const m of matches) {
					uf.union(m.winner, m.loser);
				}

				const largestComp = uf.largestComponentSize(entities);
				const compCount = uf.componentCount(entities);
				const warnings: string[] = [];

				if (compCount > 1) {
					const isolated = uf.isolatedEntities(entities);
					warnings.push(
						`Match graph is disconnected (${compCount} components). ` +
							`Ratings computed from largest component (${largestComp} entities). ` +
							`${isolated.length} isolated entities excluded.`,
					);
				}

				// Compute reference time for time decay (latest match timestamp)
				let referenceTime = Date.now();
				if (config.timeDecayHalfLifeDays !== undefined) {
					let latest = 0;
					for (const m of matches) {
						if (m.date) {
							const t = m.date.getTime();
							if (t > latest) latest = t;
						}
					}
					if (latest > 0) referenceTime = latest;
				}

				// Convert to internal match format with time-decay weights
				const internalMatches: InternalMatch[] = matches.map((m) => ({
					winner: m.winner,
					loser: m.loser,
					weight:
						(m.weight ?? 1) *
						computeTimeDecayWeight(
							m.date ? m.date.getTime() : null,
							config.timeDecayHalfLifeDays,
							referenceTime,
						),
					timestamp: m.date ? m.date.getTime() : null,
				}));

				// Filter to largest component only
				let fitMatches = internalMatches;
				let fitEntities = entities;

				if (compCount > 1) {
					// Find the largest component root
					const componentSizes = new Map<string, number>();
					for (const e of entities) {
						const root = uf.find(e);
						componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1);
					}
					let largestRoot = "";
					let largestSize = 0;
					for (const [root, size] of componentSizes) {
						if (size > largestSize) {
							largestSize = size;
							largestRoot = root;
						}
					}
					const largestComponentEntities = new Set(
						entities.filter((e) => uf.find(e) === largestRoot),
					);
					fitEntities = entities.filter((e) => largestComponentEntities.has(e));
					fitMatches = internalMatches.filter(
						(m) =>
							largestComponentEntities.has(m.winner) &&
							largestComponentEntities.has(m.loser),
					);
				}

				// Run MM algorithm
				const result = fitMM(fitMatches, fitEntities, config);

				// Check convergence
				if (
					result.convergenceDelta > config.tolerance &&
					result.iterations >= config.maxIterations
				) {
					warnings.push(
						`Model did not converge within ${config.maxIterations} iterations ` +
							`(final delta: ${result.convergenceDelta.toExponential(3)}).`,
					);
				}

				// Scale ratings
				let finalRatings = result.ratings;
				if (config.normalize) {
					finalRatings = scaleRatings(result.ratings, config.outputScale);
				}

				// Build FitResult
				const fitResult: FitResult = {
					ratings: finalRatings,
					iterations: result.iterations,
					logLikelihood: result.logLikelihood,
					entityCount: entities.length,
					matchCount: matches.length,
					convergenceDelta: result.convergenceDelta,
					warnings: warnings.length > 0 ? warnings : undefined,
					largestComponentSize: largestComp,
				};

				return fitResult;
			}),

		predictWinProbability: (ratings, a, b) =>
			Effect.gen(function* () {
				const sA = ratings.get(a);
				const sB = ratings.get(b);

				if (sA === undefined) {
					return yield* Effect.fail(new EntityNotFoundErrorCtor({ entity: a }));
				}
				if (sB === undefined) {
					return yield* Effect.fail(new EntityNotFoundErrorCtor({ entity: b }));
				}

				// P(A beats B) = sA / (sA + sB)
				// For elo400 scale, convert back to strengths first
				const total = sA + sB;
				if (total === 0) return 0.5;
				return sA / total;
			}),
	}),
);

// Re-export schema types for convenience
export type {
	BradleyTerryConfig,
	BradleyTerryError,
	ConvergenceError,
	DisconnectedGraphError,
	EntityId,
	EntityNotFoundError,
	FitResult,
	InsufficientDataError,
	Match,
	SelfMatchError,
} from "../schema";
