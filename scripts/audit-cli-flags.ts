#!/usr/bin/env bun
/**
 * Audit CLI flag parity: live `bun --help` vs completions/bun-cli.json.
 *
 * Use before/after regeneration. Canonical source for global flags is
 * `bun --help` (parsed by generate-cli-completions.ts), not llms.txt.
 *
 * Regenerate with Bun 1.4.0+ (packageManager pin) — older Bun versions
 * produce different --help output and will drift snapshots.
 */

import { join } from "node:path";
import { spawnSync } from "bun";
import { BUILD_ONLY_FLAG_NAMES } from "./generate-cli-completions.js";

const ROOT = join(import.meta.dirname, "..");
const JSON_PATH = join(ROOT, "completions/bun-cli.json");

interface FlagInfo {
	name: string;
	shortName?: string;
}

interface CompletionData {
	bunVersion?: string;
	globalFlags: FlagInfo[];
	commands: Record<string, { flags: FlagInfo[] }>;
}

function parseGlobalFlagsFromHelp(helpText: string): Set<string> {
	const names = new Set<string>();
	let inFlags = false;
	for (const line of helpText.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "Flags:") {
			inFlags = true;
			continue;
		}
		if (inFlags && (trimmed === "" || trimmed.startsWith("("))) break;
		if (!inFlags || !line.match(/^\s+(-|\s+--)/)) continue;

		const long = line.match(/--([\w-]+)/);
		if (long) names.add(long[1]!);
		const short = line.match(/(?:^|\s)-([a-zA-Z]),/);
		if (short) names.add(short[1]!);
	}
	return names;
}

const help = spawnSync({ cmd: ["bun", "--help"], stdout: "pipe", stderr: "pipe" });
if (help.exitCode !== 0) {
	console.error("Failed to run bun --help");
	process.exit(1);
}

const helpFlags = parseGlobalFlagsFromHelp(help.stdout.toString());
const data = JSON.parse(await Bun.file(JSON_PATH).text()) as CompletionData;
const jsonGlobal = new Set(data.globalFlags.map((f) => f.name));
for (const f of data.globalFlags) {
	if (f.shortName) jsonGlobal.add(f.shortName);
}

const buildFlagNames = new Set<string>();
const buildCmd = data.commands.build;
if (buildCmd) {
	for (const f of buildCmd.flags) {
		buildFlagNames.add(f.name);
		if (f.shortName) buildFlagNames.add(f.shortName);
	}
}

/** Flags listed in `bun --help` globals but intentionally stored on `bun build` */
function isSatisfiedOnBuild(flag: string): boolean {
	if (BUILD_ONLY_FLAG_NAMES.has(flag)) return buildFlagNames.has(flag);
	if (flag === "d") return buildFlagNames.has("define");
	if (flag === "l") return buildFlagNames.has("loader");
	return false;
}

const missingInJson = [...helpFlags]
	.filter((f) => !jsonGlobal.has(f) && !isSatisfiedOnBuild(f))
	.sort();
const extraInJson = [...data.globalFlags.map((f) => f.name)]
	.filter((f) => !helpFlags.has(f))
	.sort();

console.log(`Running Bun: ${Bun.version}`);
console.log(`Pinned in bun-cli.json: ${data.bunVersion ?? "unknown"}`);
console.log(`Global flags in bun --help: ${helpFlags.size}`);
console.log(`Global flags in bun-cli.json: ${jsonGlobal.size}`);

if (missingInJson.length) {
	console.log("\n❌ In --help but missing from bun-cli.json globalFlags:");
	for (const f of missingInJson) console.log(`   --${f}`);
}

if (extraInJson.length) {
	console.log("\n⚠️  In bun-cli.json globalFlags but not in current bun --help:");
	for (const f of extraInJson) console.log(`   --${f}`);
	console.log("   (May be from a newer Bun pin, or should be build-only — run completions:regen)");
}

const buildLeaks = [...jsonGlobal].filter((f) => BUILD_ONLY_FLAG_NAMES.has(f)).sort();
if (buildLeaks.length) {
	console.log("\n❌ Build-only flags still in globalFlags (should be on build command):");
	for (const f of buildLeaks) console.log(`   --${f}`);
}

if (!missingInJson.length) {
	console.log("\n✅ All bun --help global flags are present in bun-cli.json");
} else {
	console.log(
		"\n(Build-only flags may appear in `bun --help` but live under `commands.build.flags`.)",
	);
}

const relocatedBuild = [...helpFlags]
	.filter((f) => !jsonGlobal.has(f) && isSatisfiedOnBuild(f))
	.sort();
if (relocatedBuild.length) {
	console.log(
		`\n📦 Build-only flags in --help, stored on build command: ${relocatedBuild.map((f) => `--${f}`).join(", ")}`,
	);
}

const proposed = [
	"silent",
	"if-present",
	"eval",
	"print",
	"console-depth",
	"smol",
	"preload",
	"inspect",
	"shell",
	"port",
	"filter",
	"parallel",
	"env-file",
	"redis-preconnect",
	"sql-preconnect",
];

const allJson = new Set([...jsonGlobal]);
for (const cmd of Object.values(data.commands)) {
	for (const f of cmd.flags) allJson.add(f.name);
}

const proposedMissing = proposed.filter((f) => !allJson.has(f));
console.log("\nProposed high-priority flags:");
if (proposedMissing.length) {
	console.log(`❌ Still missing: ${proposedMissing.join(", ")}`);
} else {
	console.log("✅ All proposed flags already captured (global or per-command)");
}

process.exit(missingInJson.length || buildLeaks.length ? 1 : 0);
