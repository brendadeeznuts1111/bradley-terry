#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
/**
 * api-docs — scaffold Bun native API docs and tests from bun-types MDX.
 *
 * Source: node_modules/bun-types/docs (shipped with @types/bun / bun-types)
 * https://github.com/oven-sh/bun/tree/main/packages/bun-types
 *
 * Usage:
 *   bun run api-docs --slug runtime/http/server --name "HTTP Server"
 *   bun run api-docs --all
 *
 * Extracts TypeScript/JavaScript code blocks and creates:
 *   - a new section in `docs/ARCHITECTURE.md`
 *   - a test file under `test/bun-api/` that syntax-checks each example with
 *     `Bun.Transpiler` (safe for examples that reference files, sockets, certs,
 *     or long-running servers that would fail or hang if executed).
 */
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as ts from "typescript";

const require = createRequire(import.meta.url);

interface Args {
	slug: string;
	name: string;
}

interface ApiDoc {
	slug: string;
	name: string;
}

interface CodeBlock {
	language: string;
	code: string;
}

const BUN_DOCS_BASE = "https://bun.com/docs";

const API_DOC_REGISTRY: ApiDoc[] = [
	{ slug: "runtime/http/server", name: "HTTP Server" },
	{ slug: "runtime/file-io", name: "Bun File" },
	{ slug: "runtime/glob", name: "Glob" },
	{ slug: "runtime/child-process", name: "Spawn" },
	{ slug: "runtime/sqlite", name: "SQLite" },
	{ slug: "runtime/hashing", name: "Hashing" },
	{ slug: "runtime/transpiler", name: "Transpiler" },
	{ slug: "runtime/color", name: "Color" },
	{ slug: "runtime/semver", name: "Semver" },
	{ slug: "runtime/http/websockets", name: "WebSockets" },
	{ slug: "runtime/networking/udp", name: "UDP" },
	{ slug: "runtime/networking/dns", name: "DNS" },
];

const RUNNABLE_LANGUAGES = new Set([
	"typescript",
	"ts",
	"javascript",
	"js",
	"tsx",
	"jsx",
]);

interface TypeSource {
	file: string;
	keywords: string[];
}

const API_DOC_TYPE_SOURCES: Record<string, TypeSource[]> = {
	"runtime/http/server": [
		{ file: "serve.d.ts", keywords: ["serve", "Serve", "Server", "WebSocket"] },
	],
	"runtime/file-io": [
		{ file: "bun.d.ts", keywords: ["file", "BunFile", "fileURLToPath"] },
	],
	"runtime/glob": [{ file: "bun.d.ts", keywords: ["Glob"] }],
	"runtime/child-process": [
		{
			file: "bun.d.ts",
			keywords: ["spawn", "Shell", "Subprocess", "SpawnOptions", "spawnSync"],
		},
	],
	"runtime/sqlite": [
		{ file: "sqlite.d.ts", keywords: ["Database", "Statement", "SQLite"] },
	],
	"runtime/hashing": [
		{
			file: "bun.d.ts",
			keywords: ["CryptoHasher", "hash", "password", "bcrypt", "argon2"],
		},
	],
	"runtime/transpiler": [{ file: "bun.d.ts", keywords: ["Transpiler"] }],
	"runtime/color": [
		{ file: "bun.d.ts", keywords: ["Color", "color", "gradient"] },
	],
	"runtime/semver": [
		{ file: "bun.d.ts", keywords: ["Semver", "semver", "SemVer"] },
	],
	"runtime/http/websockets": [
		{ file: "serve.d.ts", keywords: ["WebSocket", "ServerWebSocket"] },
	],
	"runtime/networking/udp": [
		{ file: "bun.d.ts", keywords: ["udpSocket", "UDP"] },
	],
	"runtime/networking/dns": [{ file: "bun.d.ts", keywords: ["dns"] }],
};

function declarationName(node: ts.Node): string | undefined {
	if (
		ts.isInterfaceDeclaration(node) ||
		ts.isTypeAliasDeclaration(node) ||
		ts.isFunctionDeclaration(node) ||
		ts.isClassDeclaration(node) ||
		ts.isModuleDeclaration(node) ||
		ts.isEnumDeclaration(node)
	) {
		return node.name?.text;
	}
	if (ts.isVariableStatement(node)) {
		const decl = node.declarationList.declarations[0];
		if (decl?.name && ts.isIdentifier(decl.name)) return decl.name.text;
	}
	return undefined;
}

function extractTypeSignatures(
	filePath: string,
	keywords: string[],
	maxChars = 12000,
): string {
	const source = ts.createSourceFile(
		filePath,
		readFileSync(filePath, "utf8"),
		ts.ScriptTarget.Latest,
		true,
	);
	const lowerKeywords = keywords.map((k) => k.toLowerCase());
	const matches: string[] = [];
	let totalLength = 0;

	function visit(node: ts.Node) {
		const name = declarationName(node);
		if (name) {
			const lowerName = name.toLowerCase();
			const isMatch = lowerKeywords.some((k) => lowerName.includes(k));
			if (isMatch) {
				const text = node.getFullText(source).trim();
				if (totalLength + text.length + 2 > maxChars) {
					if (totalLength === 0) matches.push(text.slice(0, maxChars));
					return;
				}
				matches.push(text);
				totalLength += text.length + 2;
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(source);
	return matches.join("\n\n");
}

function getTypeSignaturesForDoc(bunTypesRoot: string, slug: string): string {
	const sources = API_DOC_TYPE_SOURCES[slug];
	if (!sources || sources.length === 0) return "";

	const parts: string[] = [];
	for (const { file, keywords } of sources) {
		const filePath = join(bunTypesRoot, file);
		try {
			const sigs = extractTypeSignatures(filePath, keywords);
			if (sigs) parts.push(`// ${file}\n\n${sigs}`);
		} catch (err: unknown) {
			console.warn(`Failed to extract types from ${filePath}: ${err}`);
		}
	}
	return parts.join("\n\n");
}

function parseArgs(): { mode: "single"; args: Args } | { mode: "all" } {
	let slug: string | undefined;
	let name: string | undefined;
	let all = false;

	for (let i = 0; i < Bun.argv.length; i++) {
		if (Bun.argv[i] === "--slug" && Bun.argv[i + 1]) {
			slug = Bun.argv[i + 1];
			i++;
		} else if (Bun.argv[i] === "--name" && Bun.argv[i + 1]) {
			name = Bun.argv[i + 1];
			i++;
		} else if (Bun.argv[i] === "--all") {
			all = true;
		}
	}

	if (all) return { mode: "all" };
	if (!slug || !name) {
		console.error(
			"Usage: bun run api-docs --slug <bun-types-slug> --name <name>  OR  bun run api-docs --all",
		);
		process.exit(1);
	}

	return { mode: "single", args: { slug, name } };
}

function normalizeDocsRoot(path: string): string {
	const trimmed = path.replace(/\/+$/, "");
	return trimmed.endsWith("/docs") ? `${trimmed}/` : `${trimmed}/docs/`;
}

async function readPkgVersion(docsRoot: string): Promise<string> {
	const pkgPath = join(docsRoot.replace(/\/$/, ""), "..", "package.json");
	try {
		const pkg = (await Bun.file(pkgPath).json()) as { version?: string };
		return pkg.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}

async function resolveDocsRoot(): Promise<{ root: string; version: string }> {
	const explicit = process.env.BUN_TYPES_DOCS?.trim();
	if (explicit) {
		const root = normalizeDocsRoot(explicit);
		return { root, version: await readPkgVersion(root) };
	}

	let pkgPath: string;
	try {
		pkgPath = require.resolve("bun-types/package.json");
	} catch {
		console.error(
			"No bun-types package found. Run `bun add -d @types/bun` or set BUN_TYPES_DOCS.",
		);
		process.exit(1);
	}

	const root = normalizeDocsRoot(join(dirname(pkgPath), "docs"));
	if (!(await Bun.file(join(root, "index.mdx")).exists())) {
		console.error(`bun-types docs missing at ${root}`);
		process.exit(1);
	}

	return { root, version: await readPkgVersion(root) };
}

function docUrl(slug: string): string {
	return `${BUN_DOCS_BASE}/${slug}`;
}

function stripFrontmatter(raw: string): string {
	if (!raw.startsWith("---")) return raw;
	const end = raw.indexOf("\n---", 3);
	if (end === -1) return raw;
	return raw.slice(end + 4).trim();
}

function parseFrontmatterTitle(raw: string, fallback: string): string {
	if (!raw.startsWith("---")) return fallback;
	const end = raw.indexOf("\n---", 3);
	if (end === -1) return fallback;
	for (const line of raw.slice(4, end).split("\n")) {
		const m = line.match(/^title:\s*"?(.+?)"?\s*$/);
		if (m?.[1]) return m[1];
	}
	return fallback;
}

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function extractTitle(content: string, fallback: string): string {
	const match = content.match(/^#\s+(.+)$/m);
	const title = match?.[1];
	return title?.trim() ?? fallback;
}

function extractMarkdownCodeBlocks(content: string): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	const regex =
		/```(typescript|ts|javascript|js|tsx|jsx)(?:\s+[^\n]*)?\n([\s\S]*?)```/g;
	let match: RegExpExecArray | null = regex.exec(content);
	while (match !== null) {
		const language = match[1]?.toLowerCase() ?? "";
		const code = match[2]?.trim() ?? "";
		if (code && RUNNABLE_LANGUAGES.has(language)) {
			blocks.push({ language, code });
		}
		match = regex.exec(content);
	}
	return blocks;
}

function extractHtmlCodeBlocks(html: string): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	const preRegex =
		/<pre[^>]*class="shiki[^"]*"[^>]*\slanguage="([^"]+)"[^>]*>([\s\S]*?)<\/pre>/g;
	let preMatch: RegExpExecArray | null = preRegex.exec(html);
	while (preMatch !== null) {
		const language = preMatch[1]?.toLowerCase() ?? "";
		const raw = preMatch[2] ?? "";
		const text = raw
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

function loaderForLanguage(language: string): "ts" | "tsx" | "js" | "jsx" {
	if (language === "javascript" || language === "js") return "js";
	if (language === "jsx") return "jsx";
	if (language === "tsx") return "tsx";
	return "ts";
}

function transpiles(code: string, language: string): boolean {
	try {
		new Bun.Transpiler({ loader: loaderForLanguage(language) }).transformSync(
			code,
		);
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
		.map(({ code, language }, index) => {
			const escaped = escapeForTemplateLiteral(code);
			const loader = loaderForLanguage(language);
			return `
	test("${slug} example ${index + 1} transpiles without error", () => {
		const code = \`${escaped}\`;
		const transpiler = new Bun.Transpiler({ loader: "${loader}" });
		expect(() => transpiler.transformSync(code)).not.toThrow();
	});`;
		})
		.join("\n");

	return `import { expect, test } from "bun:test";

// Generated by api-docs from bun-types "${name}"
${tests}
`;
}

function generateArchSection(
	registryName: string,
	displayTitle: string,
	url: string,
	bunTypesSlug: string,
	content: string,
	codeBlocks: CodeBlock[],
	typeSignatures = "",
): string {
	const title = displayTitle || extractTitle(content, registryName);
	const slug = slugify(registryName);
	const rows = codeBlocks
		.map(({ code }, index) => {
			const firstLine = code.split("\n")[0] ?? "";
			return `| Example ${index + 1} | \`${firstLine.slice(0, 60)}\` |`;
		})
		.join("\n");

	const typeSection = typeSignatures
		? `\n#### Type signatures from bun-types\n\n\`\`\`typescript\n${typeSignatures}\n\`\`\`\n`
		: "";

	return `

<!-- api-docs:${slug} -->

### ${title}

Source: <${url}> · bun-types \`${bunTypesSlug}.mdx\`

| Example | First line |
| ------- | ---------- |
${rows}

\`\`\`typescript
${codeBlocks[0]?.code ?? "// No code examples found"}
\`\`\`
${typeSection}
<!-- /api-docs:${slug} -->
`;
}

async function loadDocContent(
	docsRoot: string,
	slug: string,
): Promise<{ raw: string; body: string } | null> {
	const path = join(docsRoot, `${slug}.mdx`);
	const file = Bun.file(path);
	if (!(await file.exists())) {
		console.error(`Missing bun-types doc: ${path}`);
		return null;
	}
	const raw = await file.text();
	return { raw, body: stripFrontmatter(raw) };
}

async function processDoc(
	{ slug, name }: ApiDoc,
	docsRoot: string,
	bunTypesRoot: string,
): Promise<number> {
	const url = docUrl(slug);
	console.log(`\nReading bun-types/${slug}.mdx...`);

	const loaded = await loadDocContent(docsRoot, slug);
	if (!loaded) return 1;

	let codeBlocks = extractCodeBlocks(loaded.body);
	console.log(`Found ${codeBlocks.length} code blocks.`);

	codeBlocks = codeBlocks.filter((block) => {
		if (transpiles(block.code, block.language)) return true;
		console.log("Skipping example that fails to transpile.");
		return false;
	});
	console.log(`Using ${codeBlocks.length} transpileable examples.`);

	if (codeBlocks.length === 0) {
		console.log("No runnable code examples found; nothing to generate.");
		return 0;
	}

	const fileSlug = slugify(name);
	const testDir = "test/bun-api";
	await mkdir(testDir, { recursive: true });
	const testPath = `${testDir}/${fileSlug}.test.ts`;
	writeFileSync(testPath, generateTestFile(name, codeBlocks));
	console.log(`Wrote ${testPath}`);

	const typeSignatures = getTypeSignaturesForDoc(bunTypesRoot, slug);
	if (typeSignatures) {
		console.log(`Augmented with type signatures for ${slug}`);
	}

	const archPath = "docs/ARCHITECTURE.md";
	let arch = readFileSync(archPath, "utf8");
	const displayTitle =
		parseFrontmatterTitle(loaded.raw, name) || extractTitle(loaded.body, name);
	const newSection = generateArchSection(
		name,
		displayTitle,
		url,
		slug,
		loaded.body,
		codeBlocks,
		typeSignatures,
	);
	const openMarker = `\n<!-- api-docs:${fileSlug} -->`;
	const closeMarker = `<!-- /api-docs:${fileSlug} -->`;
	const openIndex = arch.indexOf(openMarker);
	if (openIndex !== -1) {
		const closeIndex = arch.indexOf(closeMarker, openIndex + openMarker.length);
		if (closeIndex !== -1) {
			arch =
				arch.slice(0, openIndex) +
				newSection +
				arch.slice(closeIndex + closeMarker.length);
			console.log(`Replaced existing section in ${archPath}`);
		} else {
			arch += newSection;
			console.log(`Appended new section to ${archPath}`);
		}
	} else {
		arch += newSection;
		console.log(`Appended new section to ${archPath}`);
	}
	writeFileSync(archPath, arch);

	return 0;
}

async function main(): Promise<number> {
	const { root: docsRoot, version } = await resolveDocsRoot();
	const bunTypesRoot = dirname(docsRoot.replace(/\/$/, ""));
	console.log(`Using bun-types ${version} docs at ${docsRoot}`);
	console.log(`Type definitions at ${bunTypesRoot}`);

	const parsed = parseArgs();
	const docs = parsed.mode === "all" ? API_DOC_REGISTRY : [parsed.args];

	let exitCode = 0;
	for (const doc of docs) {
		const result = await processDoc(doc, docsRoot, bunTypesRoot);
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
