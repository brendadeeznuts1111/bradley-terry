#!/usr/bin/env bun
// test/completions/shell-completions.unit.test.ts
// Contracts for generated shell completion scripts

import { describe, expect, test } from "bun:test";

const SHELL_DIR = "completions/shell";
const GENERATOR = "scripts/generate-shell-completions.ts";

describe("Shell completion generator", () => {
	test("generates bash, zsh, and fish completion files", async () => {
		const proc = Bun.spawn(["bun", "run", GENERATOR], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const { stdout, stderr, success } = await proc.exited.then((exitCode) => ({
			stdout: proc.stdout,
			stderr: proc.stderr,
			success: exitCode === 0,
		}));

		const out = await new Response(stdout).text();
		const err = await new Response(stderr).text();

		expect(success).toBe(true);
		expect(err).toBe("");
		expect(out).toContain("Shell completions written to");

		for (const file of ["bun.bash", "bun.zsh", "bun.fish"]) {
			expect(await Bun.file(`${SHELL_DIR}/${file}`).exists()).toBe(true);
		}
	});

	test("bash completions contain core commands and flags", async () => {
		const bash = await Bun.file(`${SHELL_DIR}/bun.bash`).text();
		expect(bash).toContain("_bun()");
		expect(bash).toContain("complete -F _bun -o default bun");
		expect(bash).toContain("run");
		expect(bash).toContain("test");
		expect(bash).toContain("install");
		expect(bash).toContain("--help");
	});

	test("bash completions include choice values as --flag=value entries", async () => {
		const bash = await Bun.file(`${SHELL_DIR}/bun.bash`).text();
		expect(bash).toContain("--target=browser");
		expect(bash).toContain("--target=bun");
		expect(bash).toContain("--target=node");
		expect(bash).toContain("--backend=clonefile");
		expect(bash).toContain("--linker=isolated");
	});

	test("zsh completions contain compdef and command descriptions", async () => {
		const zsh = await Bun.file(`${SHELL_DIR}/bun.zsh`).text();
		expect(zsh).toContain("#compdef bun");
		expect(zsh).toContain("_arguments");
		expect(zsh).toContain("run:");
		expect(zsh).toContain("test:");
		expect(zsh).toContain("install:");
	});

	test("zsh completions expose choice values for enum-like flags", async () => {
		const zsh = await Bun.file(`${SHELL_DIR}/bun.zsh`).text();
		expect(zsh).toContain(
			'--target[The intended execution environment for the bundle. "browser", "bun" or "node"]:target:(browser bun node)',
		);
		expect(zsh).toContain(
			'--backend[Platform-specific optimizations for installing dependencies. Possible values: "clonefile" (default), "hardlink", "symlink", "copyfile"]:backend:(clonefile hardlink symlink copyfile)',
		);
	});

	test("fish completions contain subcommand and flag completions", async () => {
		const fish = await Bun.file(`${SHELL_DIR}/bun.fish`).text();
		expect(fish).toContain("complete -c bun -f");
		expect(fish).toContain("__fish_use_subcommand");
		expect(fish).toContain("-a 'run'");
		expect(fish).toContain("-a 'test'");
		expect(fish).toContain("__fish_seen_subcommand_from");
	});

	test("fish completions expose choice values for enum-like flags", async () => {
		const fish = await Bun.file(`${SHELL_DIR}/bun.fish`).text();
		expect(fish).toContain("-l target -a 'browser bun node'");
		expect(fish).toContain(
			"-l backend -a 'clonefile hardlink symlink copyfile'",
		);
		expect(fish).toContain("-l linker -a 'isolated hoisted'");
	});

	test("fish completions add dynamic bun getcompletes for run, test, and build", async () => {
		const fish = await Bun.file(`${SHELL_DIR}/bun.fish`).text();
		expect(fish).toContain(
			"__fish_seen_subcommand_from run' -a '(bun getcompletes scripts)'",
		);
		expect(fish).toContain(
			"__fish_seen_subcommand_from test' -a '(bun getcompletes files)'",
		);
		expect(fish).toContain(
			"__fish_seen_subcommand_from build' -a '(bun getcompletes files)'",
		);
	});

	test("fish completions mark value flags with -r", async () => {
		const fish = await Bun.file(`${SHELL_DIR}/bun.fish`).text();
		expect(fish).toContain("-l timeout -r -d");
		expect(fish).toContain("-l outdir -r -d");
	});
});
