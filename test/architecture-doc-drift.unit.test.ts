import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/** In-repo module paths declared in docs/ARCHITECTURE.md library table. */
const ARCHITECTURE_MODULE_PATHS = [
	"src/schema.ts",
	"src/data/massey-loader.ts",
	"src/repository/sqlite-loader.ts",
	"src/match-adapter.ts",
	"src/bradley-terry/index.ts",
];

describe("architecture doc drift", () => {
	it("library module paths in ARCHITECTURE.md exist on disk", () => {
		const missing = ARCHITECTURE_MODULE_PATHS.filter((rel) => !existsSync(join(ROOT, rel)));
		expect(missing).toEqual([]);
	});

	it("ARCHITECTURE.md does not claim in-repo cascade-mover module", async () => {
		const content = await Bun.file(join(ROOT, "docs/ARCHITECTURE.md")).text();
		expect(content).not.toContain("src/integrations/cascade-mover.ts");
		expect(content).toContain("## Overview");
	});
});
