import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MATCHES_TABLE_DDL } from "../../src/repository/sqlite-loader";

const FIXTURE_SQL_PATH = join(import.meta.dir, "../fixtures/wager-matches.sql");

export type WagerMatchSeed = {
	match_id?: string;
	home_team: string;
	away_team: string;
	winner_idx: number;
	loser_idx: number;
	date: string;
	sport?: string;
	league?: string;
	y?: number;
};

const tempDirs: string[] = [];

export function trackWagerFixtureDir(dir: string): void {
	tempDirs.push(dir);
}

export function cleanupWagerFixtures(): void {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Create a temp wager.db with MATCHES_TABLE_DDL and optional seed rows. */
export function createWagerFixtureDb(rows: WagerMatchSeed[] = []): string {
	const dir = mkdtempSync(join(tmpdir(), "bt-wager-fixture-"));
	trackWagerFixtureDir(dir);
	const dbPath = join(dir, "wager.db");
	const db = new Database(dbPath, { create: true });
	db.exec(MATCHES_TABLE_DDL);

	if (rows.length > 0) {
		const insert = db.prepare(`
			INSERT INTO matches (match_id, home_team, away_team, winner_idx, loser_idx, date, sport, league, y)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		for (const row of rows) {
			insert.run(
				row.match_id ?? null,
				row.home_team,
				row.away_team,
				row.winner_idx,
				row.loser_idx,
				row.date,
				row.sport ?? null,
				row.league ?? null,
				row.y ?? null,
			);
		}
	}

	db.close();
	return dbPath;
}

/** Materialize a temp wager.db from the committed Buckeye SQL fixture. */
export function createWagerFixtureFromSql(): string {
	const dbPath = createWagerFixtureDb();
	const db = new Database(dbPath);
	try {
		db.exec(readFileSync(FIXTURE_SQL_PATH, "utf8"));
	} finally {
		db.close();
	}
	return dbPath;
}
