#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
/**
 * api-docs — scaffold Bun native API docs and tests from official docs.
 *
 * Usage:
 *   bun run api-docs --url https://bun.com/docs/api/http --name "HTTP Server"
 *   bun run api-docs --all
 *
 * The script fetches the page (Mintlify renders code blocks as HTML with Shiki),
 * extracts TypeScript/JavaScript code blocks, and creates:
 *   - a new section in `docs/ARCHITECTURE.md`
 *   - a test file under `test/bun-api/` that syntax-checks each example with
 *     `Bun.Transpiler` (safe for examples that reference files, sockets, certs,
 *     or long-running servers that would fail or hang if executed).
 */
import { mkdir } from "node:fs/promises";

interface Args {
	url: string;
	name: string;
}

interface ApiDoc {
	url: string;
	name: string;
}

interface CodeBlock {
	language: string;
	code: string;
}

const API_DOC_REGISTRY: ApiDoc[] = [
	{ url: "https://bun.com/docs/api/http", name: "HTTP Server" },
	{ url: "https://bun.com/docs/api/file", name: "Bun File" },
	{ url: "https://bun.com/docs/api/glob", name: "Glob" },
	{ url: "https://bun.com/docs/api/spawn", name: "Spawn" },
	{ url: "https://bun.com/docs/api/sqlite", name: "SQLite" },
	{ url: "https://bun.com/docs/api/hashing", name: "Hashing" },
	{ url: "https://bun.com/docs/api/transpiler", name: "Transpiler" },
	{ url: "https://bun.com/docs/api/color", name: "Color" },
	{ url: "https://bun.com/docs/api/semver", name: "Semver" },
	{ url: "https://bun.com/docs/api/websockets", name: "WebSockets" },
	{ url: "https://bun.com/docs/api/udp", name: "UDP" },
	{ url: "https://bun.com/docs/api/dns", name: "DNS" },
];

const RUNNABLE_LANGUAGES = new Set([
	"typescript",
	"ts",
	"javascript",
	"js",
	"tsx",
	"jsx",
]);

function parseArgs(): { mode: "single"; args: Args } | { mode: "all" } {
	let url: string | undefined;
	let name: string | undefined;
	let all = false;

	for (let i = 0; i < Bun.argv.length; i++) {
		if (Bun.argv[i] === "--url" && Bun.argv[i + 1]) {
			url = Bun.argv[i + 1];
			i++;
		} else if (Bun.argv[i] === "--name" && Bun.argv[i + 1]) {
			name = Bun.argv[i + 1];
			i++;
		} else if (Bun.argv[i] === "--all") {
			all = true;
		}
	}

	if (all) return { mode: "all" };
	if (!url || !name) {
		console.error(
			"Usage: bun run api-docs --url <url> --name <name>  OR  bun run api-docs --all",
		);
		process.exit(1);
	}

	return { mode: "single", args: { url, name } };
}

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function extractTitle(content: string, fallback: string): string {
	const match = content.match(/^#\s+(.+)$/m);
	return match?.[1].trim() ?? fallback;
}

function extractMarkdownCodeBlocks(content: string): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	const regex =
		/```(typescript|ts|javascript|js|tsx|jsx)(?:\s+[^\n]*)?\n([\s\S]*?)```/g;
	let match: RegExpExecArray | null = regex.exec(content);
	while (match !== null) {
		const language = match[1].toLowerCase();
		const code = match[2].trim();
		if (code && RUNNABLE_LANGUAGES.has(language)) {
			blocks.push({ language, code });
		}
		match = regex.exec(content);
	}
	return blocks;
}

function extractHtmlCodeBlocks(html: string): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	// Mintlify/Shiki rendered code blocks: <pre class="shiki ..." language="..."><code>...</code></pre>
	const preRegex =
		/<pre[^>]*class="shiki[^"]*"[^>]*\slanguage="([^"]+)"[^>]*>([\s\S]*?)<\/pre>/g;
	let preMatch: RegExpExecArray | null = preRegex.exec(html);
	while (preMatch !== null) {
		const language = preMatch[1].toLowerCase();
		const text = preMatch[2]
			.replace(/<[^>]+>/g, "")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&amp;/g, "&")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&#x27;/g, "'")
			.trim();
		if (text && RUNNABLE_LANGUAGES.has(language)) {
			blocks.push({ language, code: text });
		}
		preMatch = preRegex.exec(html);
	}
	return blocks;
}

function extractCodeBlocks(content: string): CodeBlock[] {
	const markdown = extractMarkdownCodeBlocks(content);
	if (markdown.length > 0) return markdown;
	return extractHtmlCodeBlocks(content);
}

function transpiles(code: string): boolean {
	try {
		new Bun.Transpiler({ loader: "ts" }).transformSync(code);
		return true;
	} catch {
		return false;
	}
}

function escapeForTemplateLiteral(code: string): string {
	return code
		.replace(/\\/g, "\\\\")
		.replace(/`/g, "\\`")
		.replace(/\$\{/g, "\\${");
}

function generateTestFile(name: string, codeBlocks: CodeBlock[]): string {
	const slug = slugify(name);
	const tests = codeBlocks
		.map(({ code }, index) => {
			const escaped = escapeForTemplateLiteral(code);
			return `
	test("${slug} example ${index + 1} transpiles without error", () => {
		const code = \`${escaped}\`;
		const transpiler = new Bun.Transpiler({ loader: "ts" });
		expect(() => transpiler.transformSync(code)).not.toThrow();
	});`;
		})
		.join("\n");

	return `import { expect, test } from "bun:test";

// Generated by api-docs from "${name}"
${tests}
`;
}

function generateArchSection(
	name: string,
	url: string,
	content: string,
	codeBlocks: CodeBlock[],
): string {
	const title = extractTitle(content, name);
	const rows = codeBlocks
		.map(({ code }, index) => {
			const firstLine = code.split("\n")[0] ?? "";
			return `| Example ${index + 1} | \`${firstLine.slice(0, 60)}\` |`;
		})
		.join("\n");

	return `

### ${title}

Source: <${url}>

| Example | First line |
| ------- | ---------- |
${rows}

\`\`\`typescript
${codeBlocks[0]?.code ?? "// No code examples found"}
\`\`\`
`;
}

async function processDoc({ url, name }: ApiDoc): Promise<number> {
	console.log(`\nFetching ${url}...`);

	const response = await fetch(url);
	if (!response.ok) {
		console.error(`Failed to fetch ${url}: ${response.status}`);
		return 1;
	}
	const content = await response.text();
	let codeBlocks = extractCodeBlocks(content);
	console.log(`Found ${codeBlocks.length} code blocks.`);

	codeBlocks = codeBlocks.filter((block) => {
		const escaped = escapeForTemplateLiteral(block.code);
		if (transpiles(escaped)) return true;
		console.log(`Skipping example that fails to transpile.`);
		return false;
	});
	console.log(`Using ${codeBlocks.length} transpileable examples.`);

	if (codeBlocks.length === 0) {
		console.log("No runnable code examples found; nothing to generate.");
		return 0;
	}

	const slug = slugify(name);
	const testDir = "test/bun-api";
	await mkdir(testDir, { recursive: true });
	const testPath = `${testDir}/${slug}.test.ts`;
	writeFileSync(testPath, generateTestFile(name, codeBlocks));
	console.log(`Wrote ${testPath}`);

	const archPath = "docs/ARCHITECTURE.md";
	let arch = readFileSync(archPath, "utf8");
	arch += generateArchSection(name, url, content, codeBlocks);
	writeFileSync(archPath, arch);
	console.log(`Updated ${archPath}`);

	return 0;
}

async function main(): Promise<number> {
	const parsed = parseArgs();
	const docs = parsed.mode === "all" ? API_DOC_REGISTRY : [parsed.args];

	let exitCode = 0;
	for (const doc of docs) {
		const result = await processDoc(doc);
		if (result !== 0) exitCode = result;
	}

	console.log("\nFormatting generated files...");
	const formatResult = Bun.spawnSync({
		cmd: [
			"bunx",
			"@biomejs/biome",
			"check",
			"--write",
			"test/bun-api",
			"docs/ARCHITECTURE.md",
		],
		stdout: "inherit",
		stderr: "inherit",
	});
	if (formatResult.exitCode !== 0) {
		console.error("Failed to format generated files.");
		return formatResult.exitCode ?? 1;
	}

	console.log("\nUpdating README test counts...");
	const result = Bun.spawnSync({
		cmd: ["bun", "run", "update-readme-test-counts"],
		stdout: "inherit",
		stderr: "inherit",
	});
	if (result.exitCode !== 0) {
		console.error("Failed to update README test counts.");
		return result.exitCode ?? 1;
	}

	console.log("Done.");
	return exitCode;
}

process.exit(await main());
