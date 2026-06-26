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

function bashFlagWords(flag: FlagEntry): string[] {
	const words = flagNames(flag);
	if (flag.choices?.length) {
		for (const choice of flag.choices) {
			words.push(`--${flag.name}=${choice}`);
		}
	}
	return words;
}

function zshFlagSpec(flag: FlagEntry, name: string): string {
	const desc = escapeShell(flag.description?.split("\n")[0] ?? "");
	let spec = `'${name}[${desc}]'`;
	if (flag.choices?.length) {
		spec = spec.slice(0, -1); // remove closing quote
		spec += `:${flag.name}:(${flag.choices.map(escapeShell).join(" ")})'`;
	} else if (flag.hasValue) {
		spec = spec.slice(0, -1); // remove closing quote
		const defaultHint = flag.defaultValue
			? ` [default: ${escapeShell(flag.defaultValue)}]`
			: "";
		spec += `:${flag.name}${defaultHint}:'`;
	}
	return spec;
}

function fishDynamicCompletion(type: string): string | undefined {
	switch (type) {
		case "package":
			return "(bun getcompletes packages)";
		case "script":
			return "(bun getcompletes scripts)";
		case "binary":
			return "(bun getcompletes binaries)";
		case "file":
		case "javascript_files":
			return "(bun getcompletes files)";
		case "test_files":
			return "(__bun_complete_test_files)";
		case "directory":
			return "(__fish_complete_directories)";
		case "path":
			return "(__fish_complete_path)";
		default:
			return undefined;
	}
}

function generateBash(): string {
	const commandNames = commands.map(([name]) => name).join(" ");
	const globalFlags = data.globalFlags.flatMap(bashFlagWords).join(" ");

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
		const flags = cmd.flags.flatMap(bashFlagWords).join(" ");
		script += `\t\t${name})\n`;
		script += `\t\t\tcmd_flags="${escapeShell(flags)}"\n`;
		script += `\t\t\t;;\n`;
	}

	script += `\tesac

	COMPREPLY=( $(compgen -W "$cmd_flags $global_flags" -- "$cur") )
	return 0
}

complete -F _bun -o default bun
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
			script += `\t${zshFlagSpec(flag, f)}\n`;
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
				script += `\t\t\t\t\t${zshFlagSpec(flag, f)}\n`;
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

# Helper for test file pattern completion (bun test <patterns>)
function __bun_complete_test_files
	set -l candidates (find . -maxdepth 3 \\( \
		-name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test.js' -o -name '*.test.jsx' \
		-o -name '*.spec.ts' -o -name '*.spec.tsx' -o -name '*.spec.js' -o -name '*.spec.jsx' \
	\\) 2>/dev/null | sed 's|^\\./||')
	for c in $candidates
		echo $c
	end
end

complete -c bun -f

`;

	for (const [name, cmd] of commands) {
		const desc = escapeShell(cmd.description?.split("\n")[0] ?? "");
		script += `complete -c bun -n '__fish_use_subcommand' -a '${name}' -d '${desc}'\n`;
	}

	script += "\n";

	for (const flag of data.globalFlags) {
		const desc = escapeShell(flag.description?.split("\n")[0] ?? "");
		let line = `complete -c bun`;
		if (flag.shortName) line += ` -s ${flag.shortName}`;
		line += ` -l ${flag.name}`;
		if (flag.choices?.length) {
			line += ` -a '${flag.choices.map(escapeShell).join(" ")}'`;
		} else if (flag.hasValue) {
			line += " -r";
		}
		line += ` -d '${desc}'\n`;
		script += line;
	}

	script += "\n";

	for (const [name, cmd] of commands) {
		for (const flag of cmd.flags) {
			const desc = escapeShell(flag.description?.split("\n")[0] ?? "");
			const condition = `__fish_seen_subcommand_from ${name}`;
			let line = `complete -c bun -n '${condition}'`;
			if (flag.shortName) line += ` -s ${flag.shortName}`;
			line += ` -l ${flag.name}`;
			if (flag.choices?.length) {
				line += ` -a '${flag.choices.map(escapeShell).join(" ")}'`;
			} else if (flag.hasValue) {
				line += " -r";
			}
			line += ` -d '${desc}'\n`;
			script += line;
		}

		// Dynamic positional arg completions based on completionType.
		const addedDynamic = new Set<string>();
		for (const arg of cmd.positionalArgs) {
			if (arg.completionType) {
				const dynamic = fishDynamicCompletion(arg.completionType);
				if (dynamic && !addedDynamic.has(dynamic)) {
					const argDesc = escapeShell(
						arg.description?.split("\n")[0] ?? arg.name,
					);
					script += `complete -c bun -n '__fish_seen_subcommand_from ${name}' -a '${dynamic}' -d '${argDesc}'\n`;
					addedDynamic.add(dynamic);
				}
			}
		}

		// Command-level dynamic completions from bun getcompletes.
		if (cmd.dynamicCompletions) {
			if (
				cmd.dynamicCompletions.scripts &&
				!addedDynamic.has("(bun getcompletes scripts)")
			) {
				script += `complete -c bun -n '__fish_seen_subcommand_from ${name}' -a '(bun getcompletes scripts)' -d 'Script'\n`;
				addedDynamic.add("(bun getcompletes scripts)");
			}
			if (
				cmd.dynamicCompletions.files &&
				!addedDynamic.has("(bun getcompletes files)")
			) {
				script += `complete -c bun -n '__fish_seen_subcommand_from ${name}' -a '(bun getcompletes files)' -d 'File'\n`;
				addedDynamic.add("(bun getcompletes files)");
			}
			if (
				cmd.dynamicCompletions.binaries &&
				!addedDynamic.has("(bun getcompletes binaries)")
			) {
				script += `complete -c bun -n '__fish_seen_subcommand_from ${name}' -a '(bun getcompletes binaries)' -d 'Binary'\n`;
				addedDynamic.add("(bun getcompletes binaries)");
			}
			if (
				cmd.dynamicCompletions.packages &&
				!addedDynamic.has("(bun getcompletes packages)")
			) {
				script += `complete -c bun -n '__fish_seen_subcommand_from ${name}' -a '(bun getcompletes packages)' -d 'Package'\n`;
				addedDynamic.add("(bun getcompletes packages)");
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
