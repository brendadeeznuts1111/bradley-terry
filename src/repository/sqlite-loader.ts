import { Effect } from "effect";
import type { MatchRow } from "../schema";

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
 * Stub SQLite loader for the SQLite → MatchRow pipeline.
 *
 * `match-adapter.ts` expects this module to exist. A full implementation would
 * open a bun:sqlite database, query the match table, and decode rows via
 * Schema.decodeUnknown(MatchRowSchema). For now, returning an empty result keeps
 * the project compiling while the repository layer is finalized.
 */
export const SqliteLoader = {
	getMatches: (_dbPath: string, _opts?: GetMatchesOptions) =>
		Effect.succeed([] as MatchRow[]),
};
