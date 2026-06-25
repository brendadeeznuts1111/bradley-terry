import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

describe("SQLite history", () => {
	test("creates an in-memory history table and queries rows", () => {
		using db = new Database(":memory:");

		db.run(`
			CREATE TABLE completion_history (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				generated_at TEXT NOT NULL,
				json_hash TEXT NOT NULL
			)
		`);

		db.run(
			"INSERT INTO completion_history (generated_at, json_hash) VALUES (?, ?)",
			["2026-06-25T12:00:00Z", "abc123"],
		);
		db.run(
			"INSERT INTO completion_history (generated_at, json_hash) VALUES (?, ?)",
			["2026-06-25T13:00:00Z", "def456"],
		);

		const rows = db.query("SELECT * FROM completion_history ORDER BY id").all();

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			id: 1,
			generated_at: "2026-06-25T12:00:00Z",
			json_hash: "abc123",
		});
		expect(rows[1]).toMatchObject({
			id: 2,
			generated_at: "2026-06-25T13:00:00Z",
			json_hash: "def456",
		});
	});
});
