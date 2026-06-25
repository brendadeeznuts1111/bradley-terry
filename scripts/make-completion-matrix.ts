#!/usr/bin/env bun
// Enhanced Bun-native completion matrix generator.
// Uses Bun.argv, Bun.nanoseconds, Bun.sleep, Bun.peek, Bun.Glob, Bun.TOML,
// Bun.JSONC, Bun.CSV, Bun.escapeHTML, Bun.spawn, Bun.readableStreamToText,
// Bun.build, Bun.Transpiler, Bun.serve, Bun.WebSocket, Bun.fileURLToPath,
// Bun.which, Bun.stdin, Bun.stdout, Bun.stderr, Bun.origin, Bun.revision,
// Bun.env, Bun.version, Bun.main, Bun.dns, Bun.lazy, Bun.deepEquals,
// Bun.gzipSync, Bun.CryptoHasher, Bun.connect, Bun.udpSocket, Bun.inspect.table.

import {
	aliasText,
	bool,
	type CommandEntry,
	type CompletionData,
	choiceList,
	collectPmRows,
	countCategory,
	defaultList,
	dynamicList,
	flagsTable,
	flagsWithChoices,
	flagsWithDefaults,
	flagsWithValues,
	inheritsGlobals,
	makeCSV,
	makeHTML,
	makeTable,
	positionalArgsTable,
	subcommandCount,
} from "../src/completions/completion-matrix";

// ── CLI ─────────────────────────────────────────────────────────
const args = Bun.argv.slice(2);
const flags = {
	dryRun: args.includes("--dry-run"),
	verbose: args.includes("--verbose"),
	backup: args.includes("--backup"),
	serve: args.includes("--serve"),
	watch: args.includes("--watch"),
	csv: args.includes("--csv"),
	html: args.includes("--html"),
	check: args.includes("--check"),
	bundle: args.includes("--bundle"),
	port: parseInt(args[args.indexOf("--port") + 1] || "3000", 10),
};

if (args.includes("--help") || args.includes("-h")) {
	console.log(`Usage: bun run scripts/make-completion-matrix.ts [options]

Options:
  --dry-run   Compute outputs without writing files
  --verbose   Print extra diagnostics
  --backup    Write a gzip backup of the source JSON
  --serve     Start an HTTP dashboard
  --watch     Enable WebSocket live reload (requires --serve)
  --csv       Also write COMPLETION_MATRIX.csv
  --html      Also write COMPLETION_MATRIX.html
  --check     Verify generated artifacts against source JSON
  --bundle    Self-bundle the script into ./dist
  --port      Dashboard port (default 3000)
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

// ── Timing harness ──────────────────────────────────────────────
const timings: Record<string, number> = {};
function tic(label: string): void {
	timings[label] = Bun.nanoseconds();
}
function toc(label: string): string {
	const elapsed = Bun.nanoseconds() - (timings[label] ?? 0);
	return `${(elapsed / 1e6).toFixed(2)}ms`;
}

// ── File discovery via Bun.Glob ─────────────────────────────────
tic("glob");
const relatedFiles = new Bun.Glob("completions/*.{json,md,csv,html,toml}");
const discoveredFiles = [...relatedFiles.scanSync(".")];
if (flags.verbose) {
	console.log(`🔍 Discovered ${discoveredFiles.length} completion artifacts`);
	Bun.sleep(0); // yield to event loop
}

// ── Bun binary check ────────────────────────────────────────────
tic("which");
const bunPath = Bun.which("bun");
if (!bunPath) {
	console.error("❌ bun not found in PATH");
	process.exit(1);
}

// ── Parallel version/revision probe ─────────────────────────────
tic("version");
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
	console.log(
		`📦 Bun ${liveBunVersion} (${liveBunRevision}) — probe took ${toc("version")}`,
	);
}

// ── Streaming JSON read ─────────────────────────────────────────
tic("read");
const rawJsonStream = Bun.file(JSON_PATH).stream();
const rawJson = await Bun.readableStreamToText(rawJsonStream);

// ── Multi-hash integrity ────────────────────────────────────────
tic("hash");
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

// ── Parse with JSONC ────────────────────────────────────────────
tic("parse");
const data = Bun.JSONC.parse(rawJson);

if (flags.verbose) {
	console.log(`📄 Parsed ${JSON_PATH} in ${toc("parse")}`);
}

const typedData = data as CompletionData;

// ── Bun.peek shape debug ────────────────────────────────────────
if (flags.verbose) {
	console.log("🔬 Command keys:", Bun.peek(Object.keys(typedData.commands)));
	console.log("🔬 Global flags count:", Bun.peek(typedData.globalFlags.length));
}

// ── Helpers that depend on the loaded JSON fixture ───────────────
function resolvePmPath(path: string): CommandEntry | undefined {
	const parts = path.split(" ");
	let target: CommandEntry | undefined = typedData.commands.pm;
	for (let i = 1; i < parts.length; i++) {
		target = target?.subcommands?.[parts[i]];
	}
	return target;
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

function logDiagnosticsTable(label: string, rows: Record<string, unknown>[]) {
	console.log(`\n📊 ${label}`);
	console.log(
		Bun.inspect.table(rows, {
			colors: true,
		}),
	);
}

// ── Build top-level rows ────────────────────────────────────────
tic("build");
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

if (flags.verbose) {
	console.log(`🏗️ Matrix built in ${toc("build")}`);
	console.log(
		Bun.inspect.table(
			[
				{ Metric: "Top-level commands", Count: topLevelRows.length },
				{ Metric: "PM subcommands", Count: pmRows.length },
				{ Metric: "Global flags", Count: typedData.globalFlags.length },
			],
			{ colors: true },
		),
	);
}

// ── Terminal diagnostics ────────────────────────────────────────
logDiagnosticsTable("Top-level command summary", topLevelRows.slice(0, 6));
logDiagnosticsTable("PM subcommand summary", pmRows.slice(0, 6));

// ── Assemble markdown ───────────────────────────────────────────────
const output = [
	"# Bun CLI Completion Behavior Matrix",
	"",
	`Generated from \`completions/bun-cli.json\` (schema v${typedData.version}, Bun ${liveBunVersion}, revision ${liveBunRevision}, hash \`${jsonHash}\`).`,
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

// ── HMAC-signed artifact manifest ─────────────────────────────────
const hmacKey = Bun.env.BUN_COMPLETION_HMAC_KEY || jsonHash;
const manifest = {
	jsonHash,
	sha256,
	sha512,
	blake2b256,
	bunVersion: liveBunVersion,
	revision: liveBunRevision,
	generatedAt: new Date().toISOString(),
	files: [MATRIX_PATH, DYNAMIC_SOURCES_PATH, CSV_PATH, HTML_PATH].filter(
		Boolean,
	),
};
const manifestString = JSON.stringify(manifest);
const hmac = new Bun.CryptoHasher("sha256", hmacKey)
	.update(manifestString)
	.digest("hex");

// ── Check mode ────────────────────────────────────────────────────
if (flags.check) {
	const matrixContent = await Bun.file(MATRIX_PATH).text();
	const dynamicSources = JSON.parse(
		await Bun.file(DYNAMIC_SOURCES_PATH).text(),
	);
	let ok = true;
	if (!matrixContent.includes(jsonHash)) {
		console.error("❌ Matrix hash mismatch");
		ok = false;
	}
	if (dynamicSources.jsonHash !== jsonHash) {
		console.error("❌ DYNAMIC_SOURCES hash mismatch");
		ok = false;
	}
	if (!matrixContent.includes(`schema v${typedData.version}`)) {
		console.error("❌ Matrix schema version mismatch");
		ok = false;
	}
	console.log(ok ? `✅ Check passed (${jsonHash})` : `❌ Check failed`);
	process.exit(ok ? 0 : 1);
}

// ── Dry-run summary ─────────────────────────────────────────────
if (flags.dryRun) {
	console.log("🏜️ Dry run — outputs computed but not written");
	console.log(`📄 Markdown: ${output.length} lines`);
	console.log(`📊 CSV rows: ${topLevelRows.length + pmRows.length}`);
	console.log(
		`🌐 HTML size: ~${makeHTML(topLevelRows, pmRows, liveBunVersion, jsonHash).length} bytes`,
	);
	console.log(`🔐 HMAC: ${hmac.slice(0, 16)}…`);
	process.exit(0);
}

// ── Write markdown ──────────────────────────────────────────────
tic("write");
await Bun.write(MATRIX_PATH, `${output.join("\n")}\n`);
const matrixSize = await Bun.file(MATRIX_PATH).size;

// ── Write CSV ───────────────────────────────────────────────────
if (flags.csv) {
	const csvTop = makeCSV(topLevelRows);
	const csvPm = makeCSV(pmRows);
	const csvOutput = [csvTop, "", "## PM subcommands", "", csvPm].join("\n");
	await Bun.write(CSV_PATH, `${csvOutput}\n`);
	console.log(`✅ Wrote ${CSV_PATH}`);
}

// ── Write HTML ──────────────────────────────────────────────────
if (flags.html) {
	await Bun.write(
		HTML_PATH,
		makeHTML(topLevelRows, pmRows, liveBunVersion, jsonHash),
	);
	console.log(`✅ Wrote ${HTML_PATH}`);
}

// ── Write dynamic sources contract ────────────────────────────────
const dynamicSources = {
	schema: typedData.version,
	bunVersion: liveBunVersion,
	revision: liveBunRevision,
	jsonHash,
	sha256,
	sha512,
	blake2b256,
	hmac,
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
if (flags.backup || Bun.env.BUN_COMPLETION_BACKUP === "1") {
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

console.log(`📝 All writes completed in ${toc("write")}`);

// ── DNS registry validation (async, non-blocking) ───────────────
if (typedData.commands.add?.flags.some((f) => f.name === "registry")) {
	Bun.dns
		.lookup("registry.npmjs.org")
		.then((address) => {
			if (flags.verbose) {
				console.log(`🌐 Registry DNS: ${address}`);
			}
		})
		.catch(() => {
			console.warn("⚠️ Registry DNS resolution failed");
		});
}

// ── TCP health check (async, non-blocking) ──────────────────────
Bun.connect({
	hostname: "registry.npmjs.org",
	port: 443,
	tls: true,
	socket: {
		open(socket) {
			if (flags.verbose) console.log("🔒 Registry TLS: connected");
			socket.end();
		},
		error(_socket, _error) {
			if (flags.verbose) console.warn("⚠️ Registry TLS check failed");
		},
		data(_socket, _data) {},
		close(_socket, _hadError) {},
	},
}).catch(() => {
	if (flags.verbose) console.warn("⚠️ Registry TLS check failed");
});

// ── Serve mode ──────────────────────────────────────────────────
function serveDashboard(req: Request): Response {
	const url = new URL(req.url);
	if (url.pathname === "/") {
		return new Response(Bun.file(HTML_PATH), {
			headers: { "content-type": "text/html" },
		});
	}
	if (url.pathname === "/matrix.md") {
		return new Response(Bun.file(MATRIX_PATH), {
			headers: { "content-type": "text/markdown" },
		});
	}
	if (url.pathname === "/dynamic.json") {
		return new Response(Bun.file(DYNAMIC_SOURCES_PATH), {
			headers: { "content-type": "application/json" },
		});
	}
	if (url.pathname === "/manifest") {
		return new Response(manifestString, {
			headers: { "content-type": "application/json" },
		});
	}
	return new Response("Not found", { status: 404 });
}

if (flags.serve) {
	const origin = `http://localhost:${flags.port}`;
	const server = flags.watch
		? Bun.serve({
				port: flags.port,
				fetch: serveDashboard,
				websocket: {
					open(ws) {
						console.log("🔌 WebSocket client connected");
						ws.subscribe("matrix-updates");
					},
					message(_ws, message) {
						console.log("📨 WS:", message);
					},
				},
			})
		: Bun.serve({
				port: flags.port,
				fetch: serveDashboard,
			});

	console.log(`🚀 Dashboard: ${origin}`);
	console.log("   /         → HTML dashboard");
	console.log("   /matrix.md → Markdown");
	console.log("   /dynamic.json → Machine contract");
	console.log("   /manifest → Signed manifest");

	if (flags.watch) {
		console.log("👁️ Watch mode active — WebSocket ready for live reload");
		let lastMtime = 0;
		setInterval(async () => {
			const stat = await Bun.file(JSON_PATH).stat();
			if (stat.mtime && stat.mtime.getTime() !== lastMtime) {
				lastMtime = stat.mtime.getTime();
				server.publish(
					"matrix-updates",
					JSON.stringify({ event: "changed", hash: jsonHash }),
				);
				console.log("📡 Published matrix change to WebSocket clients");
			}
		}, 2000);
	}
}

// ── Bundle mode (self-bundling) ─────────────────────────────────
if (flags.bundle) {
	tic("bundle");
	const bundleResult = await Bun.build({
		entrypoints: [Bun.fileURLToPath(import.meta.url)],
		outdir: "./dist",
		minify: true,
		target: "bun",
	});
	if (bundleResult.success) {
		console.log(`📦 Bundled to ./dist in ${toc("bundle")}`);
	} else {
		console.error("❌ Bundle failed:", bundleResult.logs);
	}
}

// ── Final status ────────────────────────────────────────────────
const statusRows = [
	{
		Artifact: "Matrix",
		Path: MATRIX_PATH,
		Size: String(matrixSize),
		Hash: jsonHash,
	},
	{
		Artifact: "Dynamic sources",
		Path: DYNAMIC_SOURCES_PATH,
		Size: String(await Bun.file(DYNAMIC_SOURCES_PATH).size),
		Hash: "—",
	},
	{ Artifact: "Bun version", Path: bunPath, Size: "—", Hash: liveBunVersion },
];
if (flags.csv) {
	statusRows.push({
		Artifact: "CSV",
		Path: CSV_PATH,
		Size: String(await Bun.file(CSV_PATH).size),
		Hash: "—",
	});
}
if (flags.html) {
	statusRows.push({
		Artifact: "HTML",
		Path: HTML_PATH,
		Size: String(await Bun.file(HTML_PATH).size),
		Hash: "—",
	});
}

console.log(`\n${Bun.inspect.table(statusRows, { colors: true })}`);

// ── UDP status broadcast (optional, fire-and-forget) ───────────
if (Bun.env.BUN_COMPLETION_UDP_BROADCAST === "1") {
	const udp = await Bun.udpSocket({});
	udp.send(
		JSON.stringify({
			event: "matrix-generated",
			hash: jsonHash,
			version: liveBunVersion,
		}),
		"255.255.255.255",
		9123,
	);
	udp.close();
	console.log("📻 UDP broadcast sent");
}
