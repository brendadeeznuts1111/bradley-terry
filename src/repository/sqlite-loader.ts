import { Database } from "bun:sqlite";
import { Effect, Schema } from "effect";
import { type MatchRow, MatchRowSchema } from "../schema";

export interface GetMatchesOptions {
	limit?: number;
	since?: Date;
	sport?: string;
	league?: string;
}

export class SqliteLoaderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SqliteLoaderError";
	}
}

/**
 * Historical match DB (wager.db / Buckeye) — separate from the HTTP service
 * ratings DB in `RatingsDB` (`massey_raw`, `bt_ratings`, `bt_ratings_history`).
 */
export const MATCHES_TABLE = "matches";

export const MATCHES_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS ${MATCHES_TABLE} (
  match_id TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  winner_idx INTEGER NOT NULL,
  loser_idx INTEGER NOT NULL,
  date TEXT NOT NULL,
  sport TEXT,
  league TEXT,
  y REAL
);

CREATE INDEX IF NOT EXISTS idx_matches_date ON ${MATCHES_TABLE} (date);
CREATE INDEX IF NOT EXISTS idx_matches_sport_league ON ${MATCHES_TABLE} (sport, league);
`;

type RawMatchRow = {
	match_id: string | null;
	home_team: string;
	away_team: string;
	winner_idx: number;
	loser_idx: number;
	date: string;
	sport: string | null;
	league: string | null;
	y: number | null;
};

const SELECT_COLUMNS =
	"match_id, home_team, away_team, winner_idx, loser_idx, date, sport, league, y";

function buildQuery(opts?: GetMatchesOptions): {
	sql: string;
	countSql: string;
	params: unknown[];
} {
	const conditions: string[] = [];
	const params: unknown[] = [];

	if (opts?.sport != null) {
		conditions.push("sport = ?");
		params.push(opts.sport);
	}
	if (opts?.league != null) {
		conditions.push("league = ?");
		params.push(opts.league);
	}
	if (opts?.since != null) {
		conditions.push("date >= ?");
		params.push(opts.since.toISOString());
	}

	const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
	let sql = `SELECT ${SELECT_COLUMNS} FROM ${MATCHES_TABLE} ${where} ORDER BY date ASC`;
	const countSql = `SELECT COUNT(*) AS count FROM ${MATCHES_TABLE} ${where}`;

	if (opts?.limit != null) {
		const limit = Math.max(0, Math.floor(opts.limit));
		sql += " LIMIT ?";
		params.push(limit);
	}

	return { sql, countSql, params };
}

function decodeRow(raw: RawMatchRow, index: number): Effect.Effect<MatchRow, SqliteLoaderError> {
	const candidate = {
		match_id: raw.match_id ?? undefined,
		home_team: raw.home_team,
		away_team: raw.away_team,
		winner_idx: raw.winner_idx,
		loser_idx: raw.loser_idx,
		date: raw.date,
		sport: raw.sport ?? undefined,
		league: raw.league ?? undefined,
		y: raw.y ?? undefined,
	};

	return Schema.decodeUnknown(MatchRowSchema)(candidate).pipe(
		Effect.mapError(
			(cause) => new SqliteLoaderError(`MatchRow decode failed at row ${index}: ${String(cause)}`),
		),
	);
}

export const SqliteLoader = {
	/** Apply `MATCHES_TABLE_DDL` to create the historical match schema. */
	initSchema: (dbPath: string) =>
		Effect.try({
			try: () => {
				const db = new Database(dbPath, { create: true });
				try {
					db.exec(MATCHES_TABLE_DDL);
				} finally {
					db.close();
				}
			},
			catch: (cause) => {
				const message = cause instanceof Error ? cause.message : String(cause);
				return new SqliteLoaderError(`SQLite schema init failed: ${message}`);
			},
		}),

	countMatches: (dbPath: string, opts?: GetMatchesOptions) =>
		Effect.gen(function* () {
			const { countSql, params } = buildQuery(opts);
			const limit = opts?.limit;
			const countParams = limit != null ? params.slice(0, -1) : params;

			const row = yield* Effect.try({
				try: () => {
					const db = new Database(dbPath, { readonly: true });
					try {
						return db.query(countSql).get(...countParams) as { count: number };
					} finally {
						db.close();
					}
				},
				catch: (cause) => {
					const message = cause instanceof Error ? cause.message : String(cause);
					if (message.includes("no such table")) {
						return new SqliteLoaderError(
							`Table "${MATCHES_TABLE}" not found in ${dbPath}. ` +
								"Apply MATCHES_TABLE_DDL or use a wager.db with a compatible schema.",
						);
					}
					return new SqliteLoaderError(`SQLite count failed: ${message}`);
				},
			});

			const total = row?.count ?? 0;
			if (limit != null) {
				return Math.min(total, Math.max(0, Math.floor(limit)));
			}
			return total;
		}),

	getMatches: (dbPath: string, opts?: GetMatchesOptions) =>
		Effect.gen(function* () {
			const { sql, params } = buildQuery(opts);

			const rawRows = yield* Effect.try({
				try: () => {
					const db = new Database(dbPath, { readonly: true });
					try {
						return db.query(sql).all(...params) as RawMatchRow[];
					} finally {
						db.close();
					}
				},
				catch: (cause) => {
					const message = cause instanceof Error ? cause.message : String(cause);
					if (message.includes("no such table")) {
						return new SqliteLoaderError(
							`Table "${MATCHES_TABLE}" not found in ${dbPath}. ` +
								"Apply MATCHES_TABLE_DDL or use a wager.db with a compatible schema.",
						);
					}
					return new SqliteLoaderError(`SQLite read failed: ${message}`);
				},
			});

			const rows: MatchRow[] = [];
			for (let i = 0; i < rawRows.length; i++) {
				rows.push(yield* decodeRow(rawRows[i], i));
			}

			return rows;
		}),
};
