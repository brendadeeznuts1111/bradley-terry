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
		expect(bash).toContain("complete -F _bun bun");
		expect(bash).toContain("run");
		expect(bash).toContain("test");
		expect(bash).toContain("install");
		expect(bash).toContain("--help");
	});

	test("zsh completions contain compdef and command descriptions", async () => {
		const zsh = await Bun.file(`${SHELL_DIR}/bun.zsh`).text();
		expect(zsh).toContain("#compdef bun");
		expect(zsh).toContain("_arguments");
		expect(zsh).toContain("run:");
		expect(zsh).toContain("test:");
		expect(zsh).toContain("install:");
	});

	test("fish completions contain subcommand and flag completions", async () => {
		const fish = await Bun.file(`${SHELL_DIR}/bun.fish`).text();
		expect(fish).toContain("complete -c bun -f");
		expect(fish).toContain("__fish_use_subcommand");
		expect(fish).toContain("-a 'run'");
		expect(fish).toContain("-a 'test'");
		expect(fish).toContain("__fish_seen_subcommand_from");
	});
});
