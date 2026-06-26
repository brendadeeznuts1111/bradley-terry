/**
 * One-liner cookbook tests.
 *
 * Each entry in one-liners.json is executed via `bun -e "<command>"`
 * and its stdout is validated against expected key=value patterns.
 * This makes every one-liner a living specification that must pass
 * against the installed Bun runtime.
 */
import { describe, expect, test } from "bun:test";
import oneLiners from "../../one-liners.json";

interface OneLiner {
	name: string;
	command: string;
	expect: Record<string, string>;
	spawnFlags?: string[];
	stdin?: string;
}

function parseKeyValue(stdout: string): Map<string, string> {
	const map = new Map<string, string>();
	for (const line of stdout.trim().split("\n")) {
		const idx = line.indexOf(" ");
		if (idx === -1) continue;
		const key = line.substring(0, idx);
		const value = line.substring(idx + 1);
		map.set(key, value);
	}
	return map;
}

describe("One-liner cookbook", () => {
	for (const entry of oneLiners as unknown as OneLiner[]) {
		test(entry.name, async () => {
			const flags = entry.spawnFlags ?? [];
			const proc = Bun.spawn(["bun", ...flags, "-e", entry.command], {
				stdout: "pipe",
				stderr: "pipe",
				stdin: entry.stdin ? "pipe" : undefined,
			});
			if (entry.stdin && proc.stdin) {
				proc.stdin.write(entry.stdin);
				proc.stdin.end();
			}
			const stdout = await Bun.readableStreamToText(proc.stdout);
			const stderr = await Bun.readableStreamToText(proc.stderr);
			await proc.exited;

			if (proc.exitCode !== 0) {
				throw new Error(`One-liner failed (exit ${proc.exitCode}):\n${stderr}`);
			}

			const values = parseKeyValue(stdout);

			for (const [key, pattern] of Object.entries(entry.expect)) {
				const actual = values.get(key);
				expect(actual).toBeDefined();
				expect(actual).toMatch(new RegExp(`^${pattern}$`));
			}
		});
	}
});
