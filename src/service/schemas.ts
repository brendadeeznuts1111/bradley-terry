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

export const HealthResponseSchema = Schema.Struct({
  status: Schema.Literal("ok"),
  version: Schema.String,
  timestamp: Schema.Number,
});

export type HealthResponse = Schema.Schema.Type<typeof HealthResponseSchema>;

export const encodeJson = <A, I, R>(schema: Schema.Schema<A, I, R>, value: A) =>
  Schema.encode(schema)(value);
