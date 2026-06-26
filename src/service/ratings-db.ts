import { Database } from "bun:sqlite";
import { Context, Effect, Layer } from "effect";
import { RatingsConfigTag } from "./config.js";
import { DBError } from "./errors.js";
import type { BTRating, MasseyData } from "./schemas.js";

export interface RatingsDBApi {
  readonly storeMassey: (data: MasseyData) => Effect.Effect<void, DBError>;
  readonly storeBT: (
    ratings: readonly BTRating[],
    sport?: string,
    season?: string
  ) => Effect.Effect<void, DBError>;
  readonly getBT: (sport?: string, season?: string) => Effect.Effect<readonly BTRating[], DBError>;
  readonly getHistory: (
    sport?: string,
    season?: string,
    limit?: number
  ) => Effect.Effect<readonly BTRating[], DBError>;
}

export class RatingsDB extends Context.Tag("RatingsDB")<RatingsDB, RatingsDBApi>() {}

const DDL = `
CREATE TABLE IF NOT EXISTS massey_raw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  sport TEXT,
  season TEXT
);

CREATE TABLE IF NOT EXISTS bt_ratings (
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  rating REAL NOT NULL,
  confidence REAL NOT NULL,
  rank INTEGER NOT NULL,
  sport TEXT NOT NULL DEFAULT 'default',
  season TEXT NOT NULL DEFAULT 'default',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team_id, sport, season)
);
`;

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

function openDb(path: string): Effect.Effect<Database, DBError> {
  return Effect.try({
    try: () => {
      mkdirSync(dirname(path), { recursive: true });
      const db = new Database(path, { create: true });
      db.run(DDL);
      return db;
    },
    catch: (cause) => new DBError({ cause, operation: "open" }),
  });
}

export const RatingsDBLive = Layer.scoped(
  RatingsDB,
  Effect.gen(function* () {
    const config = yield* RatingsConfigTag;
    const db = yield* openDb(config.dbPath);

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        db.close();
      })
    );

    const storeMassey: RatingsDBApi["storeMassey"] = (data) =>
      Effect.try({
        try: () => {
          db.run(
            "INSERT INTO massey_raw (fetched_at, payload, sport, season) VALUES (?, ?, ?, ?)",
            [
              new Date().toISOString(),
              JSON.stringify(data),
              data.sport ?? null,
              data.season ?? null,
            ]
          );
        },
        catch: (cause) => new DBError({ cause, operation: "storeMassey" }),
      });

    const storeBT: RatingsDBApi["storeBT"] = (ratings, sport = "default", season = "default") =>
      Effect.try({
        try: () => {
          const stmt = db.prepare(
            `INSERT INTO bt_ratings (team_id, team_name, rating, confidence, rank, sport, season, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(team_id, sport, season) DO UPDATE SET
               team_name = excluded.team_name,
               rating = excluded.rating,
               confidence = excluded.confidence,
               rank = excluded.rank,
               updated_at = excluded.updated_at`
          );
          const updatedAt = new Date().toISOString();
          for (const r of ratings) {
            stmt.run(
              r.teamID,
              r.teamName,
              r.rating,
              r.confidence,
              r.rank,
              sport,
              season,
              updatedAt
            );
          }
        },
        catch: (cause) => new DBError({ cause, operation: "storeBT" }),
      });

    const getBT: RatingsDBApi["getBT"] = (sport = "default", season = "default") =>
      Effect.try({
        try: () => {
          const rows = db
            .query(
              `SELECT team_id, team_name, rating, confidence, rank, sport, season
               FROM bt_ratings WHERE sport = ? AND season = ? ORDER BY rank ASC`
            )
            .all(sport, season) as Array<{
            team_id: string;
            team_name: string;
            rating: number;
            confidence: number;
            rank: number;
            sport: string;
            season: string;
          }>;
          return rows.map((r) => ({
            teamID: r.team_id,
            teamName: r.team_name,
            rating: r.rating,
            confidence: r.confidence,
            rank: r.rank,
            sport: r.sport,
            season: r.season,
          }));
        },
        catch: (cause) => new DBError({ cause, operation: "getBT" }),
      });

    const getHistory: RatingsDBApi["getHistory"] = (
      sport = "default",
      season = "default",
      limit = 100
    ) => getBT(sport, season).pipe(Effect.map((rows) => rows.slice(0, limit)));

    return { storeMassey, storeBT, getBT, getHistory } satisfies RatingsDBApi;
  })
);
