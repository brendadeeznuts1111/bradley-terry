import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "bun";

const deepObject = {
	level1: {
		level2: {
			level3: {
				level4: "leaf",
			},
		},
	},
};

const script = `console.log(${JSON.stringify(deepObject)});`;

function runBun(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
	const result = spawnSync({
		cmd: ["bun", ...args],
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, NO_COLOR: "1" },
	});
	return {
		stdout: result.stdout?.toString() ?? "",
		stderr: result.stderr?.toString() ?? "",
		exitCode: result.exitCode ?? 1,
	};
}

function tempDir(name: string, files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), `bt-${name}-`));
	for (const [file, content] of Object.entries(files)) {
		writeFileSync(join(dir, file), content);
	}
	return dir;
}

describe("console-depth (upstream test/cli parity)", () => {
	test("default depth is 2", () => {
		const dir = tempDir("default", { "test.js": script });
		const { stdout, stderr, exitCode } = runBun(["test.js"], dir);
		expect(exitCode).toBe(0);
		expect(stderr).toBe("");
		expect(stdout).toContain("level3: [Object");
		rmSync(dir, { recursive: true, force: true });
	});

	test("--console-depth CLI flag", () => {
		const dir = tempDir("cli", { "test.js": script });
		const { stdout, exitCode } = runBun(["--console-depth", "3", "test.js"], dir);
		expect(exitCode).toBe(0);
		expect(stdout).toContain('level4: "leaf"');
		rmSync(dir, { recursive: true, force: true });
	});

	test("bunfig [console] depth", () => {
		const dir = tempDir("bunfig", {
			"test.js": script,
			"bunfig.toml": "[console]\ndepth = 4",
		});
		const { stdout, exitCode } = runBun(["test.js"], dir);
		expect(exitCode).toBe(0);
		expect(stdout).toContain('level4: "leaf"');
		rmSync(dir, { recursive: true, force: true });
	});

	test("CLI overrides bunfig", () => {
		const dir = tempDir("override", {
			"test.js": script,
			"bunfig.toml": "[console]\ndepth = 6",
		});
		const { stdout, exitCode } = runBun(["--console-depth", "2", "test.js"], dir);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("level3: [Object");
		rmSync(dir, { recursive: true, force: true });
	});
});
