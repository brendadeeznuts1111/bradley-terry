import { afterAll, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { spawnSync } from "bun";

// ============================================
// Helpers — modeled after test/harness.ts patterns
// ============================================

const bunEnv: Record<string, string | undefined> = {
	...process.env,
	NO_COLOR: "1",
	FORCE_COLOR: undefined,
	BUN_DEBUG_QUIET_LOGS: "1",
};
for (const key of Object.keys(bunEnv)) {
	if (bunEnv[key] === undefined) delete bunEnv[key];
}

function bunExe(): string {
	return process.platform === "win32"
		? process.execPath.replaceAll("\\", "/")
		: "bun";
}

function createTempPackageDir(): string {
	const base = mkdtempSync(
		join(realpathSync(os.tmpdir()), "bt-completions-test-"),
	);
	writeFileSync(
		join(base, "package.json"),
		JSON.stringify({ name: "test", version: "1.0.0" }),
	);
	return base;
}

interface CompletionData {
	version: string;
	bunVersion?: string;
	commands: Record<
		string,
		{ flags: unknown[]; positionalArgs: unknown[]; examples: unknown[] }
	>;
	globalFlags: unknown[];
	bunGetCompletes: { available: boolean; commands?: Record<string, string> };
}

function runScript(cwd: string, outputDir: string): CompletionData {
	const outputPath = join(outputDir, "bun-cli.json");
	const result = spawnSync({
		cmd: [
			bunExe(),
			"run",
			join(process.cwd(), "scripts/generate-cli-completions.ts"),
			"--skip-nested",
			"-o",
			outputPath,
		],
		stdout: "pipe",
		stderr: "pipe",
		cwd,
		env: bunEnv,
	});

	if (result.exitCode !== 0) {
		throw new Error(
			`Script failed (exit ${result.exitCode}): ${result.stderr?.toString()}`,
		);
	}

	if (!existsSync(outputPath)) {
		throw new Error(`Output file not created at ${outputPath}`);
	}

	return JSON.parse(readFileSync(outputPath, "utf8")) as CompletionData;
}

// ============================================
// Tests
// ============================================

describe("cli-completions generator", () => {
	const tempDirs: string[] = [];

	it("generates valid JSON with expected core commands", () => {
		const scriptCwd = createTempPackageDir();
		tempDirs.push(scriptCwd);
		const outputDir = createTempPackageDir();
		tempDirs.push(outputDir);

		const data = runScript(scriptCwd, outputDir);

		// Core commands must be present
		const requiredCommands = ["install", "add", "run", "test", "build", "pm"];
		for (const cmd of requiredCommands) {
			expect(data.commands[cmd], `missing core command: ${cmd}`).toBeDefined();
		}

		// Global flags section must be non-empty
		expect(data.globalFlags.length).toBeGreaterThan(0);

		// Each core command must have a flags array (even if empty for some)
		for (const commandName of requiredCommands) {
			const cmdEntry = data.commands[commandName];
			if (!cmdEntry) throw new Error(`missing command: ${commandName}`);
			expect(Array.isArray(cmdEntry.flags)).toBe(true);
		}

		// Version metadata
		expect(data.version).toBe("1.1.0");
		expect(data.bunVersion).toBeTruthy();
	});

	it("includes bunVersion matching the running Bun", () => {
		const scriptCwd = createTempPackageDir();
		tempDirs.push(scriptCwd);
		const outputDir = createTempPackageDir();
		tempDirs.push(outputDir);

		const data = runScript(scriptCwd, outputDir);

		const versionResult = spawnSync({
			cmd: [bunExe(), "--version"],
			stdout: "pipe",
			stderr: "pipe",
			cwd: scriptCwd,
			env: bunEnv,
		});
		const expectedVersion = (versionResult.stdout?.toString() ?? "").trim();

		expect(data.bunVersion).toBe(expectedVersion);
	});

	it("validates bunGetCompletes availability", () => {
		const scriptCwd = createTempPackageDir();
		tempDirs.push(scriptCwd);
		const outputDir = createTempPackageDir();
		tempDirs.push(outputDir);

		const data = runScript(scriptCwd, outputDir);

		// bun getcompletes is available on Bun >= 1.1.0.
		// On older or minimal installs it may not be available.
		expect(typeof data.bunGetCompletes.available).toBe("boolean");
		if (data.bunGetCompletes.available) {
			expect(data.bunGetCompletes.commands).toBeDefined();
			expect(data.bunGetCompletes.commands?.["scripts"]).toContain("getcompletes");
		}
	});

	it("--dry-run does not write a file", () => {
		const scriptCwd = createTempPackageDir();
		tempDirs.push(scriptCwd);
		const outputDir = createTempPackageDir();
		tempDirs.push(outputDir);
		const outputPath = join(outputDir, "bun-cli.json");

		const result = spawnSync({
			cmd: [
				bunExe(),
				"run",
				join(process.cwd(), "scripts/generate-cli-completions.ts"),
				"--dry-run",
				"--skip-nested",
				"-o",
				outputPath,
			],
			stdout: "pipe",
			stderr: "pipe",
			cwd: scriptCwd,
			env: bunEnv,
		});

		expect(result.exitCode).toBe(0);
		expect(existsSync(outputPath)).toBe(false);
	});

	it("install command has aliases and flags", () => {
		const scriptCwd = createTempPackageDir();
		tempDirs.push(scriptCwd);
		const outputDir = createTempPackageDir();
		tempDirs.push(outputDir);

		const data = runScript(scriptCwd, outputDir);

		const install = data.commands["install"] as {
			flags: unknown[];
			aliases?: string[];
		};
		expect(install.flags.length).toBeGreaterThan(0);
		// install should have at least the "i" alias
		const installCmd = data.commands["install"] as { aliases?: string[] };
		expect(installCmd.aliases).toBeDefined();
		expect(installCmd.aliases?.length).toBeGreaterThan(0);
	});

	it("add, run, test, and build commands include documented examples", () => {
		const scriptCwd = createTempPackageDir();
		tempDirs.push(scriptCwd);
		const outputDir = createTempPackageDir();
		tempDirs.push(outputDir);

		const data = runScript(scriptCwd, outputDir);

		const add = data.commands["add"];
		const run = data.commands["run"];
		const testCmd = data.commands["test"];
		const build = data.commands["build"];
		if (!add || !run || !testCmd || !build) throw new Error("missing command");
		expect(add.examples).toContain("bun add preact");
		expect(add.examples).toContain("bun add --dev @types/react");
		expect(run.examples).toContain("bun run index.js");
		expect(run.examples).toContain("bun run --bun vite");
		expect(testCmd.examples).toContain("bun test --timeout 20");
		expect(testCmd.examples).toContain("bun test --dots");
		expect(testCmd.examples).toContain(
			"bun test --preload ./test-setup.ts",
		);
		expect(build.examples).toContain(
			"bun build ./index.tsx --outdir ./out",
		);
	});

	it("default values are stored without surrounding quotes", () => {
		const scriptCwd = createTempPackageDir();
		tempDirs.push(scriptCwd);
		const outputDir = createTempPackageDir();
		tempDirs.push(outputDir);

		const data = runScript(scriptCwd, outputDir);

		const testCmd2 = data.commands["test"];
		if (!testCmd2) throw new Error("missing test command");
		const testFlags = testCmd2.flags as Array<{
			name: string;
			defaultValue?: string;
		}>;
		const coverageDir = testFlags.find((f) => f.name === "coverage-dir");
		const coverageReporter = testFlags.find(
			(f) => f.name === "coverage-reporter",
		);
		expect(coverageDir?.defaultValue).toBe("coverage");
		expect(coverageReporter?.defaultValue).toBe("text");
	});

	// Cleanup all temp dirs after all tests
	afterAll(() => {
		for (const dir of tempDirs) {
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {
				// already gone
			}
		}
	});
});
