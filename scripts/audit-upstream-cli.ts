#!/usr/bin/env bun
/**
 * Audit completions against oven-sh/bun test/cli at a pinned commit.
 *
 * Upstream integration tests are the ground truth for flag behavior
 * (console-depth CLI vs bunfig, sql-preconnect, etc.).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	BUN_UPSTREAM_CLI_TREE_URL,
	BUN_UPSTREAM_RAW_BASE,
	BUN_UPSTREAM_REF,
	UPSTREAM_BUNFIG_KEYS,
	UPSTREAM_CLI_FLAGS,
} from "./upstream-cli-ref.js";

const ROOT = join(import.meta.dirname, "..");
const JSON_PATH = join(ROOT, "completions/bun-cli.json");
const BUNFIG_PATH = join(ROOT, "completions/bunfig-settings.json");

interface CompletionData {
	globalFlags: Array<{ name: string; shortName?: string }>;
	commands: Record<string, { flags: Array<{ name: string; shortName?: string }> }>;
}

interface BunfigData {
	settings: Array<{ key: string }>;
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
			if (f.shortName) names.add(f.shortName);
		}
	}
	return names;
}

function extractFlagsFromSource(source: string): Set<string> {
	const names = new Set<string>();
	for (const m of source.matchAll(
		/(?:bunExe\(\),\s*|cmd:\s*\[[^\]]*?)(["'`])(--[a-z][a-z0-9-]*)\1/g,
	)) {
		const name = m[2]?.slice(2);
		if (name) names.add(name);
	}
	for (const m of source.matchAll(/(["'`])--([a-z][a-z0-9-]*)\1/g)) {
		if (m[2]) names.add(m[2]);
	}
	return names;
}

async function fetchUpstreamTestFlags(): Promise<Set<string>> {
	const treeUrl = `https://api.github.com/repos/oven-sh/bun/git/trees/${BUN_UPSTREAM_REF}?recursive=1`;
	const tree = (await (await fetch(treeUrl)).json()) as {
		tree: Array<{ path: string; type: string }>;
	};
	const paths = tree.tree
		.filter(
			(t) =>
				t.type === "blob" &&
				t.path.startsWith("test/cli/") &&
				/\.(test|spec)\.(ts|js)$/.test(t.path),
		)
		.map((t) => t.path);

	const discovered = new Set<string>();
	const limit = Math.min(paths.length, 100);
	for (const path of paths.slice(0, limit)) {
		const res = await fetch(`${BUN_UPSTREAM_RAW_BASE}/${path}`);
		if (!res.ok) continue;
		for (const flag of extractFlagsFromSource(await res.text())) {
			discovered.add(flag);
		}
	}
	return discovered;
}

const data = JSON.parse(readFileSync(JSON_PATH, "utf8")) as CompletionData;
const bunfig = JSON.parse(readFileSync(BUNFIG_PATH, "utf8")) as BunfigData;
const jsonFlags = collectJsonFlagNames(data);
const bunfigKeys = new Set(bunfig.settings.map((s) => s.key));

console.log(`Upstream ref: ${BUN_UPSTREAM_REF}`);
console.log(`Tree: ${BUN_UPSTREAM_CLI_TREE_URL}`);

const missingCurated = UPSTREAM_CLI_FLAGS.filter((f) => !jsonFlags.has(f));
const missingBunfig = UPSTREAM_BUNFIG_KEYS.filter((k) => !bunfigKeys.has(k));

if (missingCurated.length) {
	console.log("\n❌ Curated upstream CLI flags missing from bun-cli.json:");
	for (const f of missingCurated) console.log(`   --${f}`);
} else {
	console.log("\n✅ Curated upstream CLI flags present in bun-cli.json");
}

if (missingBunfig.length) {
	console.log("\n❌ Upstream bunfig keys missing from bunfig-settings.json:");
	for (const k of missingBunfig) console.log(`   ${k}`);
} else {
	console.log("✅ Upstream bunfig keys present in bunfig-settings.json");
}

let discovered: Set<string>;
try {
	discovered = await fetchUpstreamTestFlags();
	const missingDiscovered = [...discovered].filter((f) => !jsonFlags.has(f)).sort();
	const extraNote = missingDiscovered.length
		? `\n⚠️  ${missingDiscovered.length} flags in upstream tests not in JSON (may be per-command only): ${missingDiscovered.slice(0, 12).join(", ")}${missingDiscovered.length > 12 ? "…" : ""}`
		: "\n✅ All upstream test/cli flags found in bun-cli.json";
	console.log(
		`\nScanned ${Math.min(100, discovered.size)} upstream test files; discovered ${discovered.size} unique --flags${extraNote}`,
	);
} catch (err) {
	console.warn("\n⚠️  Could not fetch upstream tree (offline?):", err);
}

process.exit(missingCurated.length || missingBunfig.length ? 1 : 0);
