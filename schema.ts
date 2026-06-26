import { Schema, Brand, Data } from "effect";

export type EntityId = string & Brand.Brand<"EntityId">;
export const EntityId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.brand("EntityId")
);

export const MatchSchema = Schema.Struct({
  winner: EntityId,
  loser: EntityId,
  date: Schema.optional(Schema.DateFromSelf),
  weight: Schema.optional(
    Schema.Number.pipe(Schema.positive(), Schema.lessThanOrEqualTo(10))
  ),
  sport: Schema.optional(Schema.String),
  league: Schema.optional(Schema.String),
});

export type Match = Schema.Schema.Type<typeof MatchSchema>;

export const MatchRowSchema = Schema.Struct({
  home_team: Schema.String,
  away_team: Schema.String,
  winner_idx: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  loser_idx: Schema.optional(Schema.Number.pipe(Schema.int())),
  date: Schema.optional(Schema.String),
  y: Schema.optional(Schema.Number),
  sport: Schema.optional(Schema.String),
  league: Schema.optional(Schema.String),
  match_id: Schema.optional(Schema.String),
});

export type MatchRow = Schema.Schema.Type<typeof MatchRowSchema>;

export const BradleyTerryConfigSchema = Schema.Struct({
  maxIterations: Schema.Number.pipe(Schema.int(), Schema.positive()).pipe(
    Schema.optionalWith({ default: () => 150 })
  ),
  tolerance: Schema.Number.pipe(Schema.positive()).pipe(
    Schema.optionalWith({ default: () => 1e-6 })
  ),
  normalize: Schema.Boolean.pipe(
    Schema.optionalWith({ default: () => true })
  ),
  timeDecayHalfLifeDays: Schema.optional(Schema.Number.pipe(Schema.positive())),
  homeAdvantage: Schema.optional(Schema.Boolean),
  outputScale: Schema.optional(
    Schema.Literal("geometric", "arithmetic", "elo400")
  ).pipe(Schema.optionalWith({ default: () => "arithmetic" as const })),
});

export type BradleyTerryConfig = Schema.Schema.Type<typeof BradleyTerryConfigSchema>;

export const RatingEntrySchema = Schema.Struct({
  entity: EntityId,
  strength: Schema.Number.pipe(Schema.positive()),
  rank: Schema.Number.pipe(Schema.int(), Schema.positive()),
});

export type RatingEntry = Schema.Schema.Type<typeof RatingEntrySchema>;

export const FitResultSchema = Schema.Struct({
  ratings: Schema.Map({ key: EntityId, value: Schema.Number.pipe(Schema.positive()) }),
  iterations: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  logLikelihood: Schema.optional(Schema.Number),
  entityCount: Schema.Number.pipe(Schema.int(), Schema.positive()),
  matchCount: Schema.Number.pipe(Schema.int(), Schema.positive()),
  convergenceDelta: Schema.optional(Schema.Number),
  warnings: Schema.optional(Schema.Array(Schema.String)),
  largestComponentSize: Schema.optional(Schema.Number),
});

export type FitResult = Schema.Schema.Type<typeof FitResultSchema>;

// Error types
export class InsufficientDataError extends Data.TaggedError("InsufficientDataError")<{
  readonly message: string;
  readonly matchCount: number;
}> {}

export class ConvergenceError extends Data.TaggedError("ConvergenceError")<{
  readonly message: string;
  readonly iterations: number;
}> {}

export class EntityNotFoundError extends Data.TaggedError("EntityNotFoundError")<{
  readonly entity: EntityId;
}> {}

export class DisconnectedGraphError extends Data.TaggedError("DisconnectedGraphError")<{
  readonly components: number;
  readonly isolatedEntities: readonly EntityId[];
}> {}

export class SelfMatchError extends Data.TaggedError("SelfMatchError")<{
  readonly entity: EntityId;
}> {}

export type BradleyTerryError =
  | InsufficientDataError
  | ConvergenceError
  | EntityNotFoundError
  | DisconnectedGraphError
  | SelfMatchError;