/**
 * Canonical bunfig.toml settings for completions (not CLI flags).
 * Source: https://bun.com/docs/runtime/bunfig.md
 */

export interface BunfigSetting {
	/** TOML path, e.g. `console.depth` or `preload` */
	readonly key: string;
	readonly section?: string;
	readonly type: "boolean" | "string" | "number" | "array" | "table";
	readonly description: string;
	readonly default?: string | number | boolean;
	readonly choices?: readonly string[];
	/** CLI override when applicable */
	readonly cliEquivalent?: string;
}

export interface BunfigCompletionData {
	readonly version: string;
	readonly source: string;
	readonly settings: readonly BunfigSetting[];
}

export const BUNFIG_SETTINGS: readonly BunfigSetting[] = [
	{
		key: "preload",
		type: "array",
		description: "Scripts/plugins to run before `bun run` or executing a file",
		cliEquivalent: "--preload",
	},
	{
		key: "jsx",
		type: "string",
		description: "JSX transform mode (also in tsconfig compilerOptions)",
	},
	{
		key: "jsxFactory",
		type: "string",
		description: "JSX factory function name",
		cliEquivalent: "--jsx-factory",
	},
	{
		key: "jsxFragment",
		type: "string",
		description: "JSX fragment factory name",
		cliEquivalent: "--jsx-fragment",
	},
	{
		key: "jsxImportSource",
		type: "string",
		description: "Module specifier for automatic JSX runtime",
		cliEquivalent: "--jsx-import-source",
	},
	{
		key: "smol",
		type: "boolean",
		description: "Reduce memory usage at the cost of performance",
		default: false,
		cliEquivalent: "--smol",
	},
	{
		key: "logLevel",
		type: "string",
		description: "Log verbosity for Bun runtime",
		choices: ["debug", "warn", "error"],
	},
	{
		key: "telemetry",
		type: "boolean",
		description: "Enable/disable anonymous crash reports",
		default: true,
	},
	{
		key: "console.depth",
		section: "console",
		type: "number",
		description:
			"Default depth for console.log object inspection (0 = unlimited). CLI --console-depth overrides bunfig.",
		default: 2,
		cliEquivalent: "--console-depth",
	},
	{
		key: "define",
		section: "define",
		type: "table",
		description: "Global identifier replacements (JSON values as strings)",
		cliEquivalent: "--define",
	},
	{
		key: "loader",
		section: "loader",
		type: "table",
		description: 'Map file extensions to loaders (e.g. `".bagel" = "tsx"`)',
		cliEquivalent: "--loader",
	},
	{
		key: "test.preload",
		section: "test",
		type: "array",
		description: "Preload scripts for `bun test` only",
	},
	{
		key: "test.smol",
		section: "test",
		type: "boolean",
		description: "`smol` mode for `bun test` only",
	},
	{
		key: "test.coverage",
		section: "test",
		type: "boolean",
		description: "Enable test coverage collection",
	},
	{
		key: "test.randomize",
		section: "test",
		type: "boolean",
		description: "Randomize test execution order (`bun test`)",
	},
	{
		key: "test.seed",
		section: "test",
		type: "number",
		description: "PRNG seed for test randomization (requires test.randomize = true)",
	},
	{
		key: "test.rerunEach",
		section: "test",
		type: "number",
		description: "Re-run each test file N times (`bun test`)",
	},
	{
		key: "install.optional",
		section: "install",
		type: "boolean",
		description: "Install optional dependencies",
	},
	{
		key: "install.peer",
		section: "install",
		type: "boolean",
		description: "Install peer dependencies",
	},
	{
		key: "install.exact",
		section: "install",
		type: "boolean",
		description: "Save exact versions in package.json",
	},
	{
		key: "run.shell",
		section: "run",
		type: "string",
		description: "Shell for package.json scripts",
		choices: ["bun", "system"],
		cliEquivalent: "--shell",
	},
];

export const buildBunfigCompletionData = (): BunfigCompletionData => ({
	version: "1.0.0",
	source: "https://bun.com/docs/runtime/bunfig.md",
	settings: BUNFIG_SETTINGS,
});
