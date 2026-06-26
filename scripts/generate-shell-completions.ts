#!/usr/bin/env bun
/**
 * Shell completion generator for Bun CLI.
 *
 * Reads completions/bun-cli.json and emits:
 *   - completions/shell/bun.bash
 *   - completions/shell/bun.zsh
 *   - completions/shell/bun.fish
 *
 * The generated scripts are static, version-locked snapshots. They can be
 * sourced directly or installed by the user into their shell configuration.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
	CompletionData,
	FlagEntry,
} from "../src/completions/completion-matrix";

const ROOT = join(import.meta.dirname, "..");
const JSON_PATH = join(ROOT, "completions/bun-cli.json");
const SHELL_DIR = join(ROOT, "completions/shell");

const data: CompletionData = JSON.parse(await Bun.file(JSON_PATH).text());
const commands = Object.entries(data.commands);

function escapeShell(str: string): string {
	return str.replace(/'/g, "'\\''");
}

function flagNames(flag: FlagEntry): string[] {
	const names: string[] = [];
	if (flag.shortName) names.push(`-${flag.shortName}`);
	names.push(`--${flag.name}`);
	return names;
}

function generateBash(): string {
	const commandNames = commands.map(([name]) => name).join(" ");
	const globalFlags = data.globalFlags.flatMap(flagNames).join(" ");

	let script = `#!/usr/bin/env bash
# Bun CLI bash completions (generated from completions/bun-cli.json)
# Source this file or place it in /etc/bash_completion.d/ or ~/.bash_completion

_bun() {
	local cur prev words cword
	if type _init_completion >/dev/null 2>&1; then
		_init_completion || return
	else
		cur="\${COMP_WORDS[COMP_CWORD]}"
		prev="\${COMP_WORDS[COMP_CWORD-1]}"
	fi

	local commands="${commandNames}"
	local global_flags="${globalFlags}"

	# First argument after 'bun' is the command
	if [[ COMP_CWORD -eq 1 ]]; then
		COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
		return 0
	fi

	local cmd="\${COMP_WORDS[1]}"
	local cmd_flags=""
	case "$cmd" in
`;

	for (const [name, cmd] of commands) {
		const flags = cmd.flags.flatMap(flagNames).join(" ");
		script += `\t\t${name})\n`;
		script += `\t\t\tcmd_flags="${escapeShell(flags)}"\n`;
		script += `\t\t\t;;\n`;
	}

	script += `\tesac

	COMPREPLY=( $(compgen -W "$cmd_flags $global_flags" -- "$cur") )
	return 0
}

complete -F _bun bun
`;
	return script;
}

function generateZsh(): string {
	let script = `#!/usr/bin/env zsh
#compdef bun
# Bun CLI zsh completions (generated from completions/bun-cli.json)

local -a commands
commands=(
`;

	for (const [name, cmd] of commands) {
		const desc = escapeShell(cmd.description?.split("\n")[0] ?? name);
		script += `\t'${name}:${desc}'\n`;
	}

	script += `)\n\n`;

	script += `local -a global_flags\nglobal_flags=(\n`;
	for (const flag of data.globalFlags) {
		for (const f of flagNames(flag)) {
			const desc = escapeShell(flag.description?.split("\n")[0] ?? "");
			script += `\t'${f}[${desc}]'\n`;
		}
	}
	script += `)\n\n`;

	script += `_arguments -C \\
\t"1: :->command" \\
\t"*: :->args"\n\n`;

	script += `case "$state" in\n\tcommand)\n\t\t_describe -t commands 'bun command' commands\n\t\t;;\n\targs)\n\t\tlocal cmd="\${line[1]}"\n\t\tlocal -a cmd_flags\n\t\tcase "$cmd" in\n`;

	for (const [name, cmd] of commands) {
		script += `\t\t\t(${name})\n`;
		script += `\t\t\t\tcmd_flags=(\n`;
		for (const flag of cmd.flags) {
			for (const f of flagNames(flag)) {
				const desc = escapeShell(flag.description?.split("\n")[0] ?? "");
				script += `\t\t\t\t\t'${f}[${desc}]'\n`;
			}
		}
		script += `\t\t\t\t)\n`;
		script += `\t\t\t\t_describe -t flags 'bun ${name} flags' cmd_flags\n`;
		script += `\t\t\t\t_describe -t flags 'global flags' global_flags\n`;
		script += `\t\t\t\t;;\n`;
	}

	script += `\t\tesac\n\t\t;;\nesac\n`;
	return script;
}

function generateFish(): string {
	let script = `# Bun CLI fish completions (generated from completions/bun-cli.json)
# Source this file or place it in ~/.config/fish/completions/bun.fish

complete -c bun -f

`;

	for (const [name, cmd] of commands) {
		const desc = escapeShell(cmd.description?.split("\n")[0] ?? "");
		script += `complete -c bun -n '__fish_use_subcommand' -a '${name}' -d '${desc}'\n`;
	}

	script += "\n";

	for (const flag of data.globalFlags) {
		const desc = escapeShell(flag.description?.split("\n")[0] ?? "");
		if (flag.shortName) {
			script += `complete -c bun -s ${flag.shortName} -l ${flag.name} -d '${desc}'\n`;
		} else {
			script += `complete -c bun -l ${flag.name} -d '${desc}'\n`;
		}
	}

	script += "\n";

	for (const [name, cmd] of commands) {
		for (const flag of cmd.flags) {
			const desc = escapeShell(flag.description?.split("\n")[0] ?? "");
			const condition = `__fish_seen_subcommand_from ${name}`;
			if (flag.shortName) {
				script += `complete -c bun -n '${condition}' -s ${flag.shortName} -l ${flag.name} -d '${desc}'\n`;
			} else {
				script += `complete -c bun -n '${condition}' -l ${flag.name} -d '${desc}'\n`;
			}
		}
	}

	return script;
}

mkdirSync(SHELL_DIR, { recursive: true });

await Bun.write(join(SHELL_DIR, "bun.bash"), generateBash());
await Bun.write(join(SHELL_DIR, "bun.zsh"), generateZsh());
await Bun.write(join(SHELL_DIR, "bun.fish"), generateFish());

console.log(`✅ Shell completions written to ${SHELL_DIR}`);
