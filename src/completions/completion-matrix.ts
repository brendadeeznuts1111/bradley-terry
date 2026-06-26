/**
 * Pure completion-matrix helpers used by scripts/make-completion-matrix.ts.
 * These functions are deliberately side-effect free so they can be unit-tested.
 */

export interface FlagEntry {
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

export interface PositionalArgEntry {
	name: string;
	description?: string;
	required: boolean;
	multiple: boolean;
	type?: string;
	completionType?: string;
	choices?: string[];
}

export interface CommandEntry {
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

export interface CompletionData {
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

export const FLAG_CATEGORIES = {
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

export type FlagCategory = keyof typeof FLAG_CATEGORIES | "uncategorized";

export function classifyFlag(name: string): FlagCategory[] {
	const categories: FlagCategory[] = [];
	for (const [cat, flags] of Object.entries(FLAG_CATEGORIES)) {
		if (flags.has(name)) categories.push(cat as keyof typeof FLAG_CATEGORIES);
	}
	return categories.length ? categories : ["uncategorized"];
}

export function countCategory(
	flags: FlagEntry[],
	category: keyof typeof FLAG_CATEGORIES,
): number {
	return flags.filter((f) => classifyFlag(f.name).includes(category)).length;
}

export function bool(x: unknown): string {
	return x ? "Yes" : "No";
}

export function flagsWithValues(flags: FlagEntry[]): number {
	return flags.filter((f) => f.hasValue).length;
}

export function flagsWithDefaults(flags: FlagEntry[]): number {
	return flags.filter((f) => f.defaultValue !== undefined).length;
}

export function flagsWithChoices(flags: FlagEntry[]): number {
	return flags.filter((f) => f.choices?.length).length;
}

export function defaultList(flags: FlagEntry[]): string {
	const defs = flags
		.filter((f) => f.defaultValue !== undefined)
		.map(
			(f) =>
				`${f.shortName ? `-${f.shortName}/` : ""}--${f.name}=${f.defaultValue}`,
		);
	return defs.join(", ") || "—";
}

export function choiceList(flags: FlagEntry[]): string {
	const choices = flags
		.filter((f): f is FlagEntry & { choices: string[] } => !!f.choices?.length)
		.map(
			(f) =>
				`${f.shortName ? `-${f.shortName}/` : ""}--${f.name}={${f.choices.join(", ")}}`,
		);
	return choices.join(", ") || "—";
}

export function subcommandCount(cmd: CommandEntry | undefined): number {
	return cmd?.subcommands ? Object.keys(cmd.subcommands).length : 0;
}

export function dynamicList(cmd: CommandEntry): string {
	if (!cmd.dynamicCompletions) return "";
	const keys = Object.keys(cmd.dynamicCompletions);
	return keys.length ? keys.join(", ") : "";
}

export function collectPmRows(
	cmd: CommandEntry,
): { name: string; path: string }[] {
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

export function cleanAliases(aliases: string[] | undefined): string[] {
	if (!aliases) return [];
	const cleaned = aliases.filter(
		(a) => a !== "bun" && a !== "bunx" && a.length > 0,
	);
	if (cleaned.some((a) => a === "bun")) {
		throw new Error('Parser leak: "bun" cannot be an alias of itself');
	}
	return cleaned;
}

export function aliasText(cmd: CommandEntry): string {
	const aliases = cleanAliases(cmd.aliases);
	return aliases.length ? ` (${aliases.join(", ")})` : "";
}

export const PM_TOP_COMMANDS = new Set(["pm"]);

export function inheritsGlobals(cmdName: string): boolean {
	return !PM_TOP_COMMANDS.has(cmdName);
}

export function makeTable<T extends Record<string, string | number>>(
	rows: T[],
): string {
	if (rows.length === 0) return "";
	const cols = Object.keys(rows[0]);

	// Compute max visual width per column (Bun.stringWidth accounts for CJK/emoji)
	const colWidths = cols.map((col) => {
		const headerWidth = Bun.stringWidth(col);
		const maxDataWidth = rows.reduce(
			(max, r) => Math.max(max, Bun.stringWidth(String(r[col]))),
			0,
		);
		return Math.max(headerWidth, maxDataWidth);
	});

	const padCell = (text: string, width: number): string => {
		const visualWidth = Bun.stringWidth(text);
		return text + " ".repeat(width - visualWidth);
	};

	const header = `| ${cols.map((c, i) => padCell(c, colWidths[i])).join(" | ")} |`;
	const sep = `|${cols.map((_, i) => "-".repeat(colWidths[i] + 2)).join("|")}|`;
	const body = rows
		.map(
			(r) =>
				`| ${cols.map((c, i) => padCell(String(r[c]), colWidths[i])).join(" | ")} |`,
		)
		.join("\n");
	return [header, sep, body].join("\n");
}

export function makeCSV<T extends Record<string, string | number>>(
	rows: T[],
): string {
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

export function makeHTML(
	topRows: Record<string, string | number>[],
	pmRows: Record<string, string | number>[],
	liveBunVersion: string,
	jsonHash: string,
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

export function positionalArgsTable(cmd: CommandEntry | undefined): string {
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

export function flagsTable(cmd: CommandEntry | undefined): string {
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
