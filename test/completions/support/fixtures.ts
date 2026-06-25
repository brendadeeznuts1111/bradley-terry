import type { CompletionData } from "../../../src/completions/completion-matrix";

export function makeMockCompletionData(): CompletionData {
	return {
		version: "1.1.0",
		bunVersion: "1.4.0",
		commands: {
			install: {
				name: "install",
				aliases: ["i"],
				description: "Install dependencies",
				flags: [
					{ name: "save", hasValue: true, defaultValue: "true" },
					{
						name: "backend",
						hasValue: true,
						choices: ["clonefile", "hardlink"],
					},
					{ name: "watch", hasValue: false },
					{ name: "frozen-lockfile", hasValue: false },
				],
				positionalArgs: [{ name: "packages", required: false, multiple: true }],
				examples: ["bun install"],
			},
			pm: {
				name: "pm",
				aliases: ["bun"],
				description: "Package manager subcommands",
				flags: [],
				positionalArgs: [],
				examples: [],
				subcommands: {
					scan: {
						name: "scan",
						description: "Scan for issues",
						flags: [],
						positionalArgs: [],
						examples: [],
					},
				},
			},
		},
		globalFlags: [
			{ name: "watch", hasValue: false },
			{ name: "hot", hasValue: false },
			{ name: "env-file", hasValue: true },
			{ name: "preload", hasValue: true },
		],
		bunGetCompletes: {
			available: true,
			commands: {
				scripts: "bun getcompletes s",
				binaries: "bun getcompletes b",
				packages: "bun getcompletes a",
				files: "bun getcompletes j",
			},
		},
		specialHandling: {
			bareCommand: {
				description: "Run files, scripts, and binaries",
				canRunFiles: true,
				dynamicCompletions: {
					scripts: true,
					files: true,
					binaries: true,
				},
			},
		},
	};
}
