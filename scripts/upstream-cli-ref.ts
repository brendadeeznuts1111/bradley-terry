/**
 * Pin to oven-sh/bun test/cli fixtures used for completions parity audits.
 * @see https://github.com/oven-sh/bun/tree/82688896d7c0e5078d44d64b93d1dfdcf2e0152c/test/cli
 */
export const BUN_UPSTREAM_REF = "82688896d7c0e5078d44d64b93d1dfdcf2e0152c";
export const BUN_UPSTREAM_CLI_TREE_URL = `https://github.com/oven-sh/bun/tree/${BUN_UPSTREAM_REF}/test/cli`;
export const BUN_UPSTREAM_RAW_BASE = `https://raw.githubusercontent.com/oven-sh/bun/${BUN_UPSTREAM_REF}`;

/** Flags exercised in upstream test/cli (curated from commit scan) */
export const UPSTREAM_CLI_FLAGS = [
	"console-depth",
	"smol",
	"inspect",
	"inspect-wait",
	"inspect-brk",
	"if-present",
	"eval",
	"print",
	"preload",
	"shell",
	"sql-preconnect",
	"redis-preconnect",
	"heap-prof",
	"heap-prof-md",
	"user-agent",
	"expose-gc",
	"no-deprecation",
	"throw-deprecation",
	"zero-fill-buffers",
	"no-addons",
	"unhandled-rejections",
] as const;

/** bunfig.toml keys proven in upstream test/cli */
export const UPSTREAM_BUNFIG_KEYS = [
	"console.depth",
	"test.randomize",
	"test.seed",
	"test.rerunEach",
] as const;
