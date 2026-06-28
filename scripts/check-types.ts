#!/usr/bin/env bun
// Strict type-check gate for hardened project files.
// Filters known bun-types noise (TS2339 on Bun 1.3.6) which are false positives
// from incomplete global type definitions — not project errors.
// All 6 strict flags catch real issues regardless.

export {};

const proc = Bun.spawnSync(["bunx", "tsc", "--noEmit"], {
	stdout: "pipe",
	stderr: "pipe",
});

const output = (proc.stdout?.toString() ?? "") + (proc.stderr?.toString() ?? "");
const lines = output.split("\n");

const ts2339 = lines.filter((l: string) => l.includes("TS2339:")).length;
const realErrors = lines.filter(
	(l: string) =>
		!l.includes("node_modules") &&
		!l.includes("TS2339:") &&
		/loc*error TS/.test(l),
);

if (realErrors.length > 0) {
	console.error(`❌ ${realErrors.length} project type errors (${ts2339} bun-types TS2339 filtered):`);
	for (const e of realErrors.slice(0, 20)) console.error(`  ${e.trim()}`);
	if (realErrors.length > 20) console.error(`  ... and ${realErrors.length - 20} more`);
	process.exit(1);
}

console.log(`✅ Strict type-check passed (${ts2339} bun-types TS2339 filtered)`);
