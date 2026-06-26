import { Schema } from "effect";

export const MasseyTeamSchema = Schema.Struct({
	teamId: Schema.String,
	teamName: Schema.String,
	conference: Schema.optional(Schema.String),
});

export type MasseyTeam = Schema.Schema.Type<typeof MasseyTeamSchema>;

export const MasseyResultSchema = Schema.Struct({
	homeTeamId: Schema.String,
	awayTeamId: Schema.String,
	homeScore: Schema.Number,
	awayScore: Schema.Number,
	date: Schema.optional(Schema.String),
});

export const MasseyDataSchema = Schema.Struct({
	teams: Schema.Array(MasseyTeamSchema),
	results: Schema.Array(MasseyResultSchema),
	sport: Schema.optional(Schema.String),
	season: Schema.optional(Schema.String),
});

export type MasseyData = Schema.Schema.Type<typeof MasseyDataSchema>;

export const BTRatingSchema = Schema.Struct({
	teamID: Schema.String,
	teamName: Schema.String,
	rating: Schema.Number,
	confidence: Schema.Number,
	rank: Schema.Number.pipe(Schema.int(), Schema.positive()),
	sport: Schema.optional(Schema.String),
	season: Schema.optional(Schema.String),
});

export type BTRating = Schema.Schema.Type<typeof BTRatingSchema>;

export const BTRequestSchema = Schema.Struct({
	sport: Schema.optional(Schema.String),
	season: Schema.optional(Schema.String),
});

export type BTRequest = Schema.Schema.Type<typeof BTRequestSchema>;

export const HealthChecksSchema = Schema.Struct({
	db: Schema.Literal("ok", "error"),
	secretsBackend: Schema.String,
	lastUpdated: Schema.optional(Schema.String),
	teamCount: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.nonNegative())),
});

export type HealthChecks = Schema.Schema.Type<typeof HealthChecksSchema>;

export const HealthResponseSchema = Schema.Struct({
	status: Schema.Literal("ok"),
	version: Schema.String,
	timestamp: Schema.Number,
	checks: HealthChecksSchema,
});

export type HealthResponse = Schema.Schema.Type<typeof HealthResponseSchema>;

export const BTRatingHistorySchema = Schema.extend(
	BTRatingSchema,
	Schema.Struct({ snapshotAt: Schema.String }),
);

export type BTRatingHistory = Schema.Schema.Type<typeof BTRatingHistorySchema>;

export const BTRatingsSchema = Schema.Array(BTRatingSchema);
export const BTRatingHistoryListSchema = Schema.Array(BTRatingHistorySchema);

export const RefreshSummarySchema = Schema.Struct({
	stored: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
	sport: Schema.String,
	season: Schema.String,
});

export type RefreshSummary = Schema.Schema.Type<typeof RefreshSummarySchema>;

export const ErrorResponseSchema = Schema.Struct({
	error: Schema.String,
	message: Schema.String,
});

export const encodeJson = <A, I, R>(schema: Schema.Schema<A, I, R>, value: A) =>
	Schema.encode(schema)(value);
