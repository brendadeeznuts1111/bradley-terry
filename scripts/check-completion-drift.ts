#!/usr/bin/env bun
// Bun-native file I/O and hashing via Bun.file() / Bun.CryptoHasher
// https://bun.com/docs/runtime/file-io
// https://bun.com/docs/runtime/hashing

export {};

const JSON_PATH = "completions/bun-cli.json";
const MATRIX_PATH = "completions/COMPLETION_MATRIX.md";
const DYNAMIC_SOURCES_PATH = "completions/DYNAMIC_SOURCES.json";

const rawJson = await Bun.file(JSON_PATH).text();
const jsonHash = new Bun.CryptoHasher("sha256")
	.update(rawJson)
	.digest("hex")
	.slice(0, 12);
const matrixContent = await Bun.file(MATRIX_PATH).text();
const jsonData = JSON.parse(rawJson);

let failed = false;

// Check 1: Matrix contains current JSON hash
if (!matrixContent.includes(jsonHash)) {
	console.error(
		`❌ Drift detected: ${JSON_PATH} hash (${jsonHash}) not found in matrix`,
	);
	failed = true;
}

// Check 2: Matrix version matches JSON version
if (!matrixContent.includes(`schema v${jsonData.version}`)) {
	console.error(
		`❌ Version drift: expected schema v${jsonData.version} in matrix header`,
	);
	failed = true;
}

if (
	jsonData.bunVersion &&
	!matrixContent.includes(`Bun ${jsonData.bunVersion}`)
) {
	console.error(
		`❌ Bun version drift: expected Bun ${jsonData.bunVersion} in matrix header`,
	);
	failed = true;
}

// Check 3: DYNAMIC_SOURCES.json hash matches
const dynamicSources = JSON.parse(await Bun.file(DYNAMIC_SOURCES_PATH).text());
if (dynamicSources.jsonHash !== jsonHash) {
	console.error(
		`❌ DYNAMIC_SOURCES drift: ${DYNAMIC_SOURCES_PATH} hash (${dynamicSources.jsonHash}) does not match ${JSON_PATH} hash (${jsonHash})`,
	);
	failed = true;
}

// Check 4: Every top-level command in JSON has a matrix row
const jsonCommands = Object.keys(jsonData.commands);
const matrixCommandMatches = [
	...matrixContent.matchAll(/^\| (\w+)(?: \(|\s+\|)/gm),
];
const matrixCommands = matrixCommandMatches.map((m) => m[1]);
const missing = jsonCommands.filter((c) => !matrixCommands.includes(c));

if (missing.length) {
	console.error(`❌ Missing commands in matrix: ${missing.join(", ")}`);
	failed = true;
}

interface CommandEntry {
	aliases?: string[];
}

// Check 5: No "bun" alias parser leak in JSON
for (const [cmdName, cmd] of Object.entries(jsonData.commands) as [
	string,
	CommandEntry,
][]) {
	if (cmd.aliases?.includes("bun")) {
		console.error(`❌ Parser leak: "bun" appears as an alias of "${cmdName}"`);
		failed = true;
	}
}

if (failed) {
	process.exit(1);
}

console.log(`✅ Completion matrix aligned with ${JSON_PATH} (${jsonHash})`);
