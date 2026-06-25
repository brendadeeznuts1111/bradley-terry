#!/usr/bin/env bun
// Unified Bun-native completion matrix generator.
// Produces COMPLETION_MATRIX.md and DYNAMIC_SOURCES.json from completions/bun-cli.json.
// Optional outputs: COMPLETION_MATRIX.csv, COMPLETION_MATRIX.html, gzip backup.

export {};

// ── CLI ─────────────────────────────────────────────────────────
const args = Bun.argv.slice(2);
const flags = {
	dryRun: args.includes("--dry-run"),
	verbose: args.includes("--verbose"),
	csv: args.includes("--csv"),
	html: args.includes("--html"),
	backup: args.includes("--backup") || Bun.env.BUN_COMPLETION_BACKUP === "1",
};

if (args.includes("--help") || args.includes("-h")) {
	console.log(`Usage: bun run scripts/make-completion-matrix.ts [options]

Options:
  --dry-run   Compute outputs without writing files
  --verbose   Print extra diagnostics
  --csv       Also write COMPLETION_MATRIX.csv
  --html      Also write COMPLETION_MATRIX.html
  --backup    Write a gzip backup of the source JSON
  --help      Show this help`);
	process.exit(0);
}

// ── Constants ───────────────────────────────────────────────────
const JSON_PATH = "completions/bun-cli.json";
const MATRIX_PATH = "completions/COMPLETION_MATRIX.md";
const DYNAMIC_SOURCES_PATH = "completions/DYNAMIC_SOURCES.json";
const CSV_PATH = "completions/COMPLETION_MATRIX.csv";
const HTML_PATH = "completions/COMPLETION_MATRIX.html";

// ── Entry guard ─────────────────────────────────────────────────
if (!Bun.main) {
	console.error("❌ Must be run as main module");
	process.exit(1);
}

// ── Bun binary check ────────────────────────────────────────────
const bunPath = Bun.which("bun");
if (!bunPath) {
	console.error("❌ bun not found in PATH");
	process.exit(1);
}

// ── Parallel version/revision probe ─────────────────────────────
let liveBunVersion = Bun.version;
let liveBunRevision = Bun.revision ?? "unknown";

try {
	const [versionProc, revisionProc] = [
		Bun.spawn({ cmd: [bunPath, "--version"], stdout: "pipe", stderr: "pipe" }),
		Bun.spawn({ cmd: [bunPath, "--revision"], stdout: "pipe", stderr: "pipe" }),
	];
	const [versionOut, revisionOut] = await Promise.all([
		Bun.readableStreamToText(versionProc.stdout),
		Bun.readableStreamToText(revisionProc.stdout),
	]);
	await Promise.all([versionProc.exited, revisionProc.exited]);
	if (versionProc.exitCode === 0) liveBunVersion = versionOut.trim();
	if (revisionProc.exitCode === 0) liveBunRevision = revisionOut.trim();
} catch {
	// Fallback to runtime constants.
}

if (flags.verbose) {
	console.log(`📦 Bun ${liveBunVersion} (${liveBunRevision})`);
}

// ── Read and parse source JSON ──────────────────────────────────
const rawJson = await Bun.file(JSON_PATH).text();
const data = Bun.JSONC.parse(rawJson);

// ── Integrity hashes ────────────────────────────────────────────
const sha256 = new Bun.CryptoHasher("sha256").update(rawJson).digest("hex");
const sha512 = new Bun.CryptoHasher("sha512").update(rawJson).digest("hex");
const blake2b256 = new Bun.CryptoHasher("blake2b256")
	.update(rawJson)
	.digest("hex");
const jsonHash = sha256.slice(0, 12);

if (flags.verbose) {
	console.log(`🔐 SHA256: ${sha256.slice(0, 16)}…`);
	console.log(`🔐 SHA512: ${sha512.slice(0, 16)}…`);
	console.log(`🔐 BLAKE2b256: ${blake2b256.slice(0, 16)}…`);
}

// ── Type definitions ────────────────────────────────────────────
interface FlagEntry {
	name: string;
	shortName?: string;
	description?: string;
	hasValue: boolean;
	valueType?: string;
	defaultValue?: string;
	choices?: string[];
	required?: boolean;
	multiple?: boolean;
}

interface PositionalArgEntry {
	name: string;
	description?: string;
	required: boolean;
	multiple: boolean;
	type?: string;
	completionType?: string;
	choices?: string[];
}

interface CommandEntry {
	name: string;
	aliases?: string[];
	description?: string;
	usage?: string;
	flags: FlagEntry[];
	positionalArgs: PositionalArgEntry[];
	examples: string[];
	subcommands?: Record<string, CommandEntry>;
	dynamicCompletions?: Record<string, boolean>;
}

interface CompletionData {
	version: string;
	bunVersion?: string;
	commands: Record<string, CommandEntry>;
	globalFlags: FlagEntry[];
	bunGetCompletes: {
		available: boolean;
		commands?: {
			scripts: string;
			binaries: string;
			packages: string;
			files: string;
		};
	};
	specialHandling: {
		bareCommand: {
			description: string;
			canRunFiles: boolean;
			dynamicCompletions: {
				scripts: boolean;
				files: boolean;
				binaries: boolean;
			};
		};
	};
}

const typedData = data as CompletionData;

// ── Flag taxonomy ───────────────────────────────────────────────
const FLAG_CATEGORIES = {
	fileIO: new Set([
		"outfile",
		"outdir",
		"entry-naming",
		"chunk-naming",
		"asset-naming",
		"public-dir",
		"assets",
		"loader",
		"tsconfig-override",
		"cwd",
		"config",
		"env-file",
		"cafile",
		"cache-dir",
		"public",
		"routes",
		"app",
	]),
	pm: new Set([
		"frozen-lockfile",
		"production",
		"development",
		"dev",
		"no-save",
		"save",
		"global",
		"trust",
		"no-trust",
		"exact",
		"optional",
		"peer",
		"resolutions",
		"hoist",
		"no-hoist",
		"linker",
		"omit",
		"backend",
		"concurrent-scripts",
		"network-concurrency",
		"registry",
		"auth-type",
		"tag",
		"access",
		"dry-run",
		"no-cache",
		"prefer-offline",
		"no-verify",
		"ignore-scripts",
		"no-summary",
		"no-progress",
		"no-install",
	]),
	runtime: new Set([
		"watch",
		"hot",
		"preload",
		"import-meta-url",
		"smol",
		"no-deprecation",
		"throw-deprecation",
		"env-file",
		"cwd",
		"port",
		"hostname",
		"conditions",
		"main-fields",
		"extensions",
		"target",
		"format",
		"packages",
	]),
	debug: new Set([
		"sourcemap",
		"inspect",
		"inspect-wait",
		"inspect-brk",
		"inspect-publish-port",
		"verbose",
		"silent",
		"quiet",
		"no-progress",
		"no-summary",
		"only-failures",
		"coverage",
		"coverage-reporter",
		"coverage-dir",
	]),
	network: new Set([
		"timeout",
		"prefer-offline",
		"no-cache",
		"registry",
		"cert",
		"ca",
		"cafile",
		"auth-type",
		"proxy",
		"network-concurrency",
		"no-verify",
		"tls-min-version",
		"tls-max-version",
		"no-deprecation",
	]),
} as const;

type FlagCategory = keyof typeof FLAG_CATEGORIES | "uncategorized";

function classifyFlag(name: string): FlagCategory[] {
	const categories: FlagCategory[] = [];
	for (const [cat, flags] of Object.entries(FLAG_CATEGORIES)) {
		if (flags.has(name)) categories.push(cat as keyof typeof FLAG_CATEGORIES);
	}
	return categories.length ? categories : ["uncategorized"];
}

function countCategory(
	flags: FlagEntry[],
	category: keyof typeof FLAG_CATEGORIES,
): number {
	return flags.filter((f) => classifyFlag(f.name).includes(category)).length;
}

function bool(x: unknown) {
	return x ? "Yes" : "No";
}

function flagsWithValues(flags: FlagEntry[]) {
	return flags.filter((f) => f.hasValue).length;
}

function flagsWithDefaults(flags: FlagEntry[]) {
	return flags.filter((f) => f.defaultValue !== undefined).length;
}

function flagsWithChoices(flags: FlagEntry[]) {
	return flags.filter((f) => f.choices?.length).length;
}

function defaultList(flags: FlagEntry[]): string {
	const defs = flags
		.filter((f) => f.defaultValue !== undefined)
		.map(
			(f) =>
				`${f.shortName ? `-${f.shortName}/` : ""}--${f.name}=${f.defaultValue}`,
		);
	return defs.join(", ") || "—";
}

function choiceList(flags: FlagEntry[]): string {
	const choices = flags
		.filter((f): f is FlagEntry & { choices: string[] } => !!f.choices?.length)
		.map(
			(f) =>
				`${f.shortName ? `-${f.shortName}/` : ""}--${f.name}={${f.choices.join(", ")}}`,
		);
	return choices.join(", ") || "—";
}

function subcommandCount(cmd: CommandEntry | undefined) {
	return cmd?.subcommands ? Object.keys(cmd.subcommands).length : 0;
}

function dynamicList(cmd: CommandEntry) {
	if (!cmd.dynamicCompletions) return "";
	const keys = Object.keys(cmd.dynamicCompletions);
	return keys.length ? keys.join(", ") : "";
}

function collectPmRows(cmd: CommandEntry): { name: string; path: string }[] {
	const rows: { name: string; path: string }[] = [];
	if (cmd.subcommands) {
		for (const [subName, sub] of Object.entries(cmd.subcommands)) {
			rows.push({ name: subName, path: `pm ${subName}` });
			if (sub.subcommands) {
				for (const nestedName of Object.keys(sub.subcommands)) {
					rows.push({ name: nestedName, path: `pm ${subName} ${nestedName}` });
				}
			}
		}
	}
	return rows;
}

function resolvePmPath(path: string): CommandEntry | undefined {
	const parts = path.split(" ");
	let target: CommandEntry | undefined = typedData.commands.pm;
	for (let i = 1; i < parts.length; i++) {
		target = target?.subcommands?.[parts[i]];
	}
	return target;
}

// ── Clean parser artifacts ──────────────────────────────────────
function cleanAliases(aliases: string[] | undefined): string[] {
	if (!aliases) return [];
	const cleaned = aliases.filter(
		(a) => a !== "bun" && a !== "bunx" && a.length > 0,
	);
	if (cleaned.some((a) => a === "bun")) {
		throw new Error('Parser leak: "bun" cannot be an alias of itself');
	}
	return cleaned;
}

function aliasText(cmd: CommandEntry) {
	const aliases = cleanAliases(cmd.aliases);
	return aliases.length ? ` (${aliases.join(", ")})` : "";
}

// ── Global flag inheritance ─────────────────────────────────────
const PM_TOP_COMMANDS = new Set(["pm"]);

function inheritsGlobals(cmdName: string): boolean {
	return !PM_TOP_COMMANDS.has(cmdName);
}

function totalSurface(cmd: CommandEntry): number {
	return cmd.flags.length + typedData.globalFlags.length;
}

function criticalInheritedFlags(cmdName: string): string {
	const globalFlagNames = new Set(typedData.globalFlags.map((f) => f.name));
	const ownFlagNames = new Set(
		(typedData.commands[cmdName]?.flags || []).map((f) => f.name),
	);

	const critical = [
		"watch",
		"hot",
		"env-file",
		"preload",
		"inspect",
		"sourcemap",
		"outfile",
		"minify",
		"timeout",
		"bail",
		"coverage",
		"global",
		"development",
		"exact",
		"optional",
	].filter((name) => globalFlagNames.has(name) && !ownFlagNames.has(name));

	return critical.length ? `\`${critical.slice(0, 6).join("`, `")}\`` : "—";
}

// ── Table builders ──────────────────────────────────────────────
function makeTable<T extends Record<string, string | number>>(
	rows: T[],
): string {
	if (rows.length === 0) return "";
	const cols = Object.keys(rows[0]);
	const header = `| ${cols.join(" | ")} |`;
	const sep = `|${cols.map(() => " --- ").join("|")}|`;
	const body = rows
		.map((r) => `| ${cols.map((c) => String(r[c])).join(" | ")} |`)
		.join("\n");
	return [header, sep, body].join("\n");
}

function makeCSV<T extends Record<string, string | number>>(rows: T[]): string {
	if (rows.length === 0) return "";
	const cols = Object.keys(rows[0]);
	const quoteCsv = (v: string) => {
		const s = String(v);
		if (s.includes(",") || s.includes('"') || s.includes("\n")) {
			return `"${s.replace(/"/g, '""')}"`;
		}
		return s;
	};
	const lines = [
		cols.join(","),
		...rows.map((r) => cols.map((c) => quoteCsv(String(r[c]))).join(",")),
	];
	return lines.join("\n");
}

function makeHTML(
	topRows: Record<string, string | number>[],
	pmRows: Record<string, string | number>[],
): string {
	const esc = Bun.escapeHTML;
	const makeTableHTML = (
		rows: Record<string, string | number>[],
		title: string,
	) => {
		if (!rows.length) return "";
		const cols = Object.keys(rows[0]);
		let html = `<h2>${esc(title)}</h2><table border="1" cellpadding="4"><thead><tr>`;
		for (const c of cols) {
			html += `<th>${esc(c)}</th>`;
		}
		html += "</tr></thead><tbody>";
		for (const r of rows) {
			html += "<tr>";
			for (const c of cols) {
				html += `<td>${esc(String(r[c]))}</td>`;
			}
			html += "</tr>";
		}
		html += "</tbody></table>";
		return html;
	};

	return `<!DOCTYPE html>
<html>
<head><title>Bun CLI Completion Behavior Matrix</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;background:#0f0f0f;color:#e0e0e0}
table{border-collapse:collapse;width:100%;margin-bottom:2rem;background:#1a1a1a}
th{background:#2a2a2a;color:#00ff88;padding:8px;text-align:left}
td{padding:6px;border-bottom:1px solid #333}
tr:hover{background:#252525}
h1,h2{color:#00ff88}
.meta{color:#888;font-size:0.9rem}
</style>
</head>
<body>
<h1>Bun CLI Completion Behavior Matrix</h1>
<p class="meta">Generated: ${esc(new Date().toISOString())} | Bun: ${esc(liveBunVersion)} | Hash: ${esc(jsonHash)}</p>
${makeTableHTML(topRows, "Top-level commands")}
${makeTableHTML(pmRows, "PM subcommands")}
</body>
</html>`;
}

function logDiagnosticsTable(label: string, rows: Record<string, unknown>[]) {
	console.log(`\n📊 ${label}`);
	console.log(
		Bun.inspect.table(rows, {
			colors: true,
		}),
	);
}

function positionalArgsTable(cmd: CommandEntry | undefined): string {
	if (!cmd?.positionalArgs?.length) return "*No positional arguments.*";
	const rows = cmd.positionalArgs.map((a) => ({
		Name: a.name,
		Required: a.required ? "Yes" : "No",
		Multiple: a.multiple ? "Yes" : "No",
		Type: a.type || "—",
		"Completion type": a.completionType || "—",
		Choices: a.choices?.length ? a.choices.join(", ") : "—",
		Description: (a.description || "").replace(/\|/g, "\\|"),
	}));
	return makeTable(rows);
}

function flagsTable(cmd: CommandEntry | undefined): string {
	if (!cmd?.flags?.length) return "*No flags.*";
	const rows = cmd.flags.map((f) => ({
		Flag: `${f.shortName ? `-${f.shortName}, ` : ""}--${f.name}`,
		"Has value": f.hasValue ? "Yes" : "No",
		"Value type": f.valueType || "—",
		Default: f.defaultValue || "—",
		Choices: f.choices?.length ? f.choices.join(", ") : "—",
		Categories: classifyFlag(f.name).join(", ") || "—",
		Description: (f.description || "").replace(/\|/g, "\\|"),
	}));
	return makeTable(rows);
}

// ── Build top-level rows ────────────────────────────────────────
const topLevelRows = Object.entries(typedData.commands)
	.sort(([a], [b]) => a.localeCompare(b))
	.map(([name, cmd]) => {
		const reqPos = cmd.positionalArgs.filter((a) => a.required).length;
		const optPos = cmd.positionalArgs.length - reqPos;
		return {
			Command: name + aliasText(cmd),
			Flags: cmd.flags.length,
			"Value flags": flagsWithValues(cmd.flags),
			"Positional args": cmd.positionalArgs.length,
			"Req pos": reqPos,
			"Opt pos": optPos,
			"File I/O": countCategory(cmd.flags, "fileIO"),
			PM: countCategory(cmd.flags, "pm"),
			Runtime: countCategory(cmd.flags, "runtime"),
			Debug: countCategory(cmd.flags, "debug"),
			Network: countCategory(cmd.flags, "network"),
			Subcommands: subcommandCount(cmd),
			Dynamic: dynamicList(cmd) || "—",
			Examples: cmd.examples.length,
			"Defaults (#)": flagsWithDefaults(cmd.flags),
			"Default values": defaultList(cmd.flags),
			"Choices (#)": flagsWithChoices(cmd.flags),
			"Choice values": choiceList(cmd.flags),
			"Drift hash": jsonHash,
		};
	});

// ── Build PM rows ───────────────────────────────────────────────
const pmRows = collectPmRows(typedData.commands.pm).map((row) => {
	const target = resolvePmPath(row.path);
	const reqPos = (target?.positionalArgs || []).filter(
		(a) => a.required,
	).length;
	const optPos = (target?.positionalArgs || []).length - reqPos;
	return {
		Path: row.path,
		Flags: target?.flags?.length || 0,
		"Value flags": flagsWithValues(target?.flags || []),
		"Positional args": target?.positionalArgs?.length || 0,
		"Req pos": reqPos,
		"Opt pos": optPos,
		"File I/O": countCategory(target?.flags || [], "fileIO"),
		PM: countCategory(target?.flags || [], "pm"),
		Runtime: countCategory(target?.flags || [], "runtime"),
		Debug: countCategory(target?.flags || [], "debug"),
		Network: countCategory(target?.flags || [], "network"),
		Subcommands: subcommandCount(target),
		Examples: target?.examples?.length || 0,
		"Defaults (#)": flagsWithDefaults(target?.flags || []),
		"Default values": defaultList(target?.flags || []),
		"Choices (#)": flagsWithChoices(target?.flags || []),
		"Choice values": choiceList(target?.flags || []),
		Isolated: "Yes",
		"Drift hash": jsonHash,
	};
});

// ── Terminal diagnostics ────────────────────────────────────────
logDiagnosticsTable("Top-level command summary", topLevelRows.slice(0, 6));
logDiagnosticsTable("PM subcommand summary", pmRows.slice(0, 6));

// ── Assemble markdown ───────────────────────────────────────────
const output = [
	"# Bun CLI Completion Behavior Matrix",
	"",
	`Generated from \`completions/bun-cli.json\` (schema v${typedData.version}, Bun ${liveBunVersion}, hash \`${jsonHash}\`).`,
	"",
	"## Top-level commands",
	"",
	makeTable(topLevelRows),
	"",
	"## `bun pm` subcommands",
	"",
	makeTable(pmRows),
	"",
	"## Global flag inheritance by command",
	"",
	"| Command | Inherits global | Own flags | Total surface | Isolated | Critical inherited |",
	"| --- | --- | --- | --- | --- | --- |",
	...Object.entries(typedData.commands)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, cmd]) => {
			const isolated = !inheritsGlobals(name);
			return `| ${name} | ${isolated ? "—" : typedData.globalFlags.length} | ${cmd.flags.length} | ${isolated ? cmd.flags.length : totalSurface(cmd)} | ${isolated ? "Yes" : "No"} | ${isolated ? "—" : criticalInheritedFlags(name)} |`;
		}),
	"",
	"## Global flags",
	"",
	`- Total: ${typedData.globalFlags.length}`,
	`- With values: ${flagsWithValues(typedData.globalFlags)}`,
	`- With defaults: ${flagsWithDefaults(typedData.globalFlags)}`,
	`- With choices: ${flagsWithChoices(typedData.globalFlags)}`,
	"",
	"## Special handling",
	"",
	"| Scenario | Behavior |",
	"| --- | --- |",
	"| Bare `bun` | Runs files, scripts, and binaries |",
	"| `bun run` | Completes scripts, files, and binaries |",
	"| `bun add` | Completes registry packages |",
	"| `bun remove` | Completes installed packages |",
	"| `bun create` | Completes templates |",
	"| `bun test` / `bun build` | Completes files |",
	"",
	"## `bun getcompletes`",
	"",
	`Available: ${bool(typedData.bunGetCompletes.available)}`,
];

if (typedData.bunGetCompletes.available) {
	const cmds = typedData.bunGetCompletes.commands;
	if (cmds) {
		output.push(
			"",
			"| Provider | Command |",
			"| --- | --- |",
			`| Scripts | \`${cmds.scripts}\` |`,
			`| Binaries | \`${cmds.binaries}\` |`,
			`| Packages | \`${cmds.packages}\` |`,
			`| Files | \`${cmds.files}\` |`,
		);
	}
}

output.push(
	"",
	"## Detailed command breakdowns",
	"",
	"### `bun pm version`",
	"",
	positionalArgsTable(resolvePmPath("pm version")),
	"",
	"### `bun pm pkg set`",
	"",
	positionalArgsTable(resolvePmPath("pm pkg set")),
	"",
	"### `bun pm pkg get`",
	"",
	positionalArgsTable(resolvePmPath("pm pkg get")),
	"",
	"### `bun pm pkg delete`",
	"",
	positionalArgsTable(resolvePmPath("pm pkg delete")),
	"",
	"### `bun install` flag defaults",
	"",
	flagsTable(typedData.commands.install),
	"",
	"### `bun add` flag defaults",
	"",
	flagsTable(typedData.commands.add),
	"",
	"### `bun test` flag defaults",
	"",
	flagsTable(typedData.commands.test),
	"",
	"### `bun build` flag defaults",
	"",
	flagsTable(typedData.commands.build),
);

// ── Dry-run summary ─────────────────────────────────────────────
if (flags.dryRun) {
	console.log("🏜️ Dry run — outputs computed but not written");
	console.log(`📄 Markdown: ${output.length} lines`);
	if (flags.csv)
		console.log(`📊 CSV rows: ${topLevelRows.length + pmRows.length}`);
	if (flags.html)
		console.log(
			`🌐 HTML size: ~${makeHTML(topLevelRows, pmRows).length} bytes`,
		);
	process.exit(0);
}

// ── Write markdown ──────────────────────────────────────────────
await Bun.write(MATRIX_PATH, `${output.join("\n")}\n`);
const matrixSize = await Bun.file(MATRIX_PATH).size;
console.log(`✅ Wrote ${MATRIX_PATH} (${matrixSize} bytes)`);

// ── Write optional CSV ──────────────────────────────────────────
if (flags.csv) {
	const csvContent = [
		"# Top-level commands",
		makeCSV(topLevelRows),
		"",
		"# PM subcommands",
		makeCSV(pmRows),
	].join("\n");
	await Bun.write(CSV_PATH, `${csvContent}\n`);
	console.log(`✅ Wrote ${CSV_PATH} (${await Bun.file(CSV_PATH).size} bytes)`);
}

// ── Write optional HTML ─────────────────────────────────────────
if (flags.html) {
	await Bun.write(HTML_PATH, `${makeHTML(topLevelRows, pmRows)}\n`);
	console.log(
		`✅ Wrote ${HTML_PATH} (${await Bun.file(HTML_PATH).size} bytes)`,
	);
}

// ── Machine-readable contract ─────────────────────────────────
const dynamicSources = {
	schema: typedData.version,
	bunVersion: liveBunVersion,
	revision: liveBunRevision,
	jsonHash,
	sha256,
	sha512,
	blake2b256,
	generatedAt: new Date().toISOString(),
	sources: {
		bare_bun: {
			completes: ["files", "scripts", "binaries"],
			provider: null,
			providerArgs: null,
		},
		run: {
			completes: ["scripts", "files", "binaries"],
			provider: "getcompletes",
			providerArgs: ["s", "b", "j"],
		},
		add: {
			completes: ["registry_packages"],
			provider: "getcompletes",
			providerArgs: ["a"],
		},
		remove: {
			completes: ["installed_packages"],
			provider: "getcompletes",
			providerArgs: ["a"],
		},
		create: {
			completes: ["templates"],
			provider: null,
			templateDir: "$BUN_INSTALL/create",
		},
		test: {
			completes: ["files"],
			provider: "getcompletes",
			providerArgs: ["j"],
		},
		build: {
			completes: ["files"],
			provider: "getcompletes",
			providerArgs: ["j"],
		},
	},
};

await Bun.write(
	DYNAMIC_SOURCES_PATH,
	`${JSON.stringify(dynamicSources, null, 2)}\n`,
);
console.log(`✅ Wrote ${DYNAMIC_SOURCES_PATH}`);

// ── Optional gzip backup ────────────────────────────────────────
if (flags.backup) {
	const backupPath = `${JSON_PATH}.gz`;
	const compressed = Bun.gzipSync(new TextEncoder().encode(rawJson));
	await Bun.write(backupPath, compressed);
	console.log(
		`📦 Compressed backup: ${backupPath} (${compressed.length} bytes)`,
	);
}

// ── Validation ──────────────────────────────────────────────────
const roundTrip = JSON.parse(await Bun.file(DYNAMIC_SOURCES_PATH).text());
const requiredKeys = ["schema", "bunVersion", "jsonHash", "sources"];
const missingKeys = requiredKeys.filter((k) => !Object.hasOwn(roundTrip, k));
if (missingKeys.length) {
	console.warn(`⚠️ DYNAMIC_SOURCES missing keys: ${missingKeys.join(", ")}`);
}
if (roundTrip.jsonHash !== jsonHash) {
	console.warn("⚠️ Round-trip hash mismatch");
}

// ── Final status ────────────────────────────────────────────────
const statusRows = [
	{ Artifact: "Matrix", Path: MATRIX_PATH, Size: matrixSize, Hash: jsonHash },
	{
		Artifact: "Dynamic sources",
		Path: DYNAMIC_SOURCES_PATH,
		Size: await Bun.file(DYNAMIC_SOURCES_PATH).size,
		Hash: "—",
	},
	{ Artifact: "Bun version", Path: bunPath, Size: "—", Hash: liveBunVersion },
];
if (flags.csv) {
	statusRows.push({
		Artifact: "CSV",
		Path: CSV_PATH,
		Size: await Bun.file(CSV_PATH).size,
		Hash: "—",
	});
}
if (flags.html) {
	statusRows.push({
		Artifact: "HTML",
		Path: HTML_PATH,
		Size: await Bun.file(HTML_PATH).size,
		Hash: "—",
	});
}

console.log(`\n${Bun.inspect.table(statusRows, { colors: true })}`);
