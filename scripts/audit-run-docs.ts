#!/usr/bin/env bun
/**
 * Audit `bun run` docs (runtime/index.md) vs completions/bun-cli.json.
 *
 * llms.txt is a doc index — the run CLI reference lives in runtime/index.md.
 * Global flags still come from live `bun --help`; this script checks doc
 * examples and `--flag` mentions against the generated JSON.
 */

import { join } from "node:path";
import { BUILD_ONLY_FLAG_NAMES } from "./generate-cli-completions.js";

const ROOT = join(import.meta.dirname, "..");
const JSON_PATH = join(ROOT, "completions/bun-cli.json");
const RUN_DOCS_URL = "https://bun.com/docs/runtime/index.md";

/** Examples called out in runtime docs that should appear on `run` */
const REQUIRED_RUN_EXAMPLES = [
	"bun --smol run index.tsx",
	"bun --console-depth 5 run index.tsx",
	"bun run - < script.ts",
	"bun --inspect-brk run index.ts",
];

interface CompletionData {
	globalFlags: Array<{ name: string; shortName?: string }>;
	commands: Record<string, { flags: Array<{ name: string }>; examples: string[] }>;
}

function collectJsonFlagNames(data: CompletionData): Set<string> {
	const names = new Set<string>();
	for (const f of data.globalFlags) {
		names.add(f.name);
		if (f.shortName) names.add(f.shortName);
	}
	for (const cmd of Object.values(data.commands)) {
		for (const f of cmd.flags) {
			names.add(f.name);
			if ("shortName" in f && f.shortName) names.add(f.shortName as string);
		}
	}
	return names;
}

function isDocFlagSatisfied(name: string, jsonFlags: Set<string>): boolean {
	if (jsonFlags.has(name)) return true;
	if (BUILD_ONLY_FLAG_NAMES.has(name)) return jsonFlags.has(name);
	if (name === "d") return jsonFlags.has("define");
	if (name === "l") return jsonFlags.has("loader");
	return false;
}

function extractDocFlags(markdown: string): Set<string> {
	const names = new Set<string>();
	for (const match of markdown.matchAll(/--([a-z][a-z0-9-]*)/g)) {
		names.add(match[1]!);
	}
	return names;
}

function extractDocRunExamples(markdown: string): string[] {
	const examples: string[] = [];
	for (const block of markdown.matchAll(/```bash\n([\s\S]*?)```/g)) {
		for (const line of block[1]!.split("\n")) {
			const trimmed = line.trim();
			if (trimmed.startsWith("bun ") && !trimmed.startsWith("#")) {
				examples.push(trimmed);
			}
		}
	}
	return examples;
}

const response = await fetch(RUN_DOCS_URL);
if (!response.ok) {
	console.error(`Failed to fetch ${RUN_DOCS_URL}: ${response.status}`);
	process.exit(1);
}

const markdown = await response.text();
const data = JSON.parse(await Bun.file(JSON_PATH).text()) as CompletionData;
const jsonFlags = collectJsonFlagNames(data);
const docFlags = extractDocFlags(markdown);
const docExamples = extractDocRunExamples(markdown);
const runExamples = new Set(data.commands.run?.examples ?? []);

const docOnlyFlags = [...docFlags].filter((f) => !isDocFlagSatisfied(f, jsonFlags)).sort();
const missingRequired = REQUIRED_RUN_EXAMPLES.filter((ex) => !runExamples.has(ex));
const docRunExamplesMissing = docExamples
	.filter((ex) => ex.includes(" run ") || ex.match(/^bun --\w+ run /))
	.filter((ex) => !runExamples.has(ex));

console.log(`Fetched: ${RUN_DOCS_URL}`);
console.log(`Doc --flags: ${docFlags.size}, JSON flags: ${jsonFlags.size}`);
console.log(`Doc bash examples: ${docExamples.length}, run.examples: ${runExamples.size}`);

if (docOnlyFlags.length) {
	console.log("\n⚠️  In run docs but not in bun-cli.json (global or per-command):");
	for (const f of docOnlyFlags) console.log(`   --${f}`);
}

if (missingRequired.length) {
	console.log("\n❌ Required run examples missing from bun-cli.json:");
	for (const ex of missingRequired) console.log(`   ${ex}`);
}

if (docRunExamplesMissing.length) {
	console.log("\n⚠️  Doc bash run examples not in bun-cli.json:");
	for (const ex of docRunExamplesMissing.slice(0, 12)) console.log(`   ${ex}`);
	if (docRunExamplesMissing.length > 12) {
		console.log(`   … and ${docRunExamplesMissing.length - 12} more`);
	}
}

const verification = [
	["--console-depth", "CLI flag (also bunfig [console] depth)", jsonFlags.has("console-depth")],
	["--smol", "CLI + bunfig", jsonFlags.has("smol")],
	["--inspect-brk", "global inspect flags", jsonFlags.has("inspect-brk")],
	["--redis-preconnect", "Bun 1.4.0", jsonFlags.has("redis-preconnect")],
	["--sql-preconnect", "Bun 1.4.0", jsonFlags.has("sql-preconnect")],
] as const;

console.log("\nKey flags:");
for (const [flag, note, ok] of verification) {
	console.log(`   ${ok ? "✅" : "❌"} ${flag} (${note})`);
}

const failed =
	missingRequired.length > 0 || verification.some(([, , ok]) => !ok) || docOnlyFlags.length > 0;

if (!missingRequired.length && verification.every(([, , ok]) => ok)) {
	console.log("\n✅ Run docs audit passed (required examples + key flags)");
}

process.exit(failed ? 1 : 0);
