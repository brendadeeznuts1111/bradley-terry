import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "bun";

/**
 * Update README test counts from `bun test` output.
 *
 * This keeps the README in sync with the actual test suite without
 * hardcoding numbers that drift every time tests are added or removed.
 *
 * Usage: bun run scripts/update-readme-test-counts.ts
 */

const BUN_EXECUTABLE = process.env.BUN_DEBUG_BUILD || "bun";

function runBunTest(): { output: string; exitCode: number } {
	const result = spawnSync({
		cmd: [BUN_EXECUTABLE, "test"],
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: undefined },
	});

	const stdout = result.stdout?.toString() ?? "";
	const stderr = result.stderr?.toString() ?? "";
	return { output: `${stdout}\n${stderr}`, exitCode: result.exitCode ?? 1 };
}

function extractTotalCounts(
	output: string,
): { tests: number; files: number } | null {
	const match = output.match(/Ran (\d+) tests across (\d+) files?/);
	if (!match) return null;
	return {
		tests: Number.parseInt(match[1], 10),
		files: Number.parseInt(match[2], 10),
	};
}

interface FileCount {
	file: string;
	tests: number;
}

function collectPerFileCounts(output: string): FileCount[] {
	const entries = new Map<string, number>();
	let currentFile: string | null = null;

	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		const fileHeader = trimmed.match(
			/^test\/[\w.\-/]+\.(?:test|spec)\.(?:ts|tsx|js|jsx):$/,
		);
		if (fileHeader) {
			currentFile = trimmed.slice(0, -1);
			entries.set(currentFile, 0);
			continue;
		}

		if (currentFile && /^\(?(?:pass|fail|skip|todo)\)/.test(trimmed)) {
			entries.set(currentFile, (entries.get(currentFile) ?? 0) + 1);
		}
	}

	return Array.from(entries.entries())
		.map(([file, tests]) => ({ file, tests }))
		.sort((a, b) => a.file.localeCompare(b.file));
}

function updateReadme(
	total: { tests: number; files: number },
	fileCounts: FileCount[],
): void {
	const readmePath = "README.md";
	let readme = readFileSync(readmePath, "utf8");

	// Update project version badge from package.json.
	const packageVersion = JSON.parse(readFileSync("package.json", "utf8"))
		.version as string;
	readme = readme.replace(
		/\[BT_Core\]\(https:\/\/img\.shields\.io\/badge\/BT_Core-v[\d.]+-[a-z]+\)\]/,
		`[BT_Core](https://img.shields.io/badge/BT_Core-v${packageVersion}-success)]`,
	);

	// Update badge.
	readme = readme.replace(
		/\[Tests\]\(https:\/\/img\.shields\.io\/badge\/Tests-\d+%20pass-[a-z]+\)\]/,
		`[Tests](https://img.shields.io/badge/Tests-${total.tests}%20pass-brightgreen)]`,
	);

	// Update total summary line.
	readme = readme.replace(
		/\d+ tests across \d+ files:/,
		`${total.tests} tests across ${total.files} files:`,
	);

	// Update per-file table rows.
	const tableRows = fileCounts.map(
		({ file, tests }) => `| \`${file}\` | ${tests} | ${purposeForFile(file)} |`,
	);
	const tableHeader = "| File | Count | Purpose |\n| --- | --- | --- |";
	const tablePattern =
		/\| File \| Count \| Purpose \|\n\| --- \| --- \| --- \|\n(?:\| `[^`]+` \| \d+ \| [^|]+\|\n)+/;
	readme = readme.replace(
		tablePattern,
		`${tableHeader}\n${tableRows.join("\n")}\n`,
	);

	writeFileSync(readmePath, readme);
}

function purposeForFile(file: string): string {
	const purposes: Record<string, string> = {
		"test/completion-matrix.unit.test.ts":
			"Completion matrix helpers: flag taxonomy, alias sanitizer, global inheritance, table builder, hash generation, end-to-end generation, drift detection, SQLite history, Bun native APIs",
		"test/completions/snapshot.unit.test.ts":
			"Snapshot contracts for `makeTable`, `makeCSV`, `DYNAMIC_SOURCES.json`, `COMPLETION_MATRIX.md` header, and end-to-end artifact consistency",
		"test/completions/shell-completions.unit.test.ts":
			"Generated bash/zsh/fish shell completion scripts",
		"test/property/mm-invariants.test.ts":
			"Win probabilities symmetric and sum to 1; adding a win for A over B never decreases A's relative strength",
		"test/property/graph-connectivity.test.ts":
			"`largestComponentSize` reflects the biggest connected component; disconnected graphs still produce valid ratings",
		"test/property/error-handling.test.ts":
			"Self-matches always produce `SelfMatchError`; empty match list produces `InsufficientDataError`; error types are tagged `BradleyTerryError`",
		"test/integration/cli-completions.test.ts":
			"CLI completions generator integration tests",
		"test/ratings-config.unit.test.ts":
			"Effect `RatingsConfig` layer and `SecretClient` integration",
		"test/bun-api/one-liners.test.ts":
			"Curated `bun -e` one-liners executed as living API specifications",
	};
	return purposes[file] ?? "";
}

function main(): number {
	console.log("Running full test suite to collect counts...");
	const totalResult = runBunTest();
	const total = extractTotalCounts(totalResult.output);
	if (!total) {
		console.error("Unable to parse total test counts from `bun test` output.");
		console.error(totalResult.output);
		return 1;
	}
	if (totalResult.exitCode !== 0) {
		console.error("Tests failed; README will not be updated.");
		console.error(totalResult.output);
		return totalResult.exitCode;
	}

	console.log(`Found ${total.tests} tests across ${total.files} files.`);
	const fileCounts = collectPerFileCounts(totalResult.output);
	const countedTests = fileCounts.reduce((sum, f) => sum + f.tests, 0);
	if (countedTests !== total.tests) {
		console.warn(
			`Per-file sum (${countedTests}) differs from total (${total.tests}); README may be inaccurate.`,
		);
	}

	updateReadme(total, fileCounts);
	console.log("Updated README.md with current test counts.");
	return 0;
}

process.exit(main());
