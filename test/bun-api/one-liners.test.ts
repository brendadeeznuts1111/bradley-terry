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

function validateOneLiners(raw: unknown): OneLiner[] {
	if (!Array.isArray(raw)) throw new Error("one-liners.json must be an array");
	return raw.map((entry, i) => {
		if (!entry || typeof entry !== "object")
			throw new Error(`one-liner[${i}] not an object`);
		const e = entry as Record<string, unknown>;
		const name = e.name;
		const command = e.command;
		if (typeof name !== "string")
			throw new Error(`one-liner[${i}].name missing`);
		if (typeof command !== "string")
			throw new Error(`one-liner[${i}].command missing`);
		if (!e.expect || typeof e.expect !== "object")
			throw new Error(`one-liner[${i}].expect missing`);
		const expect: Record<string, string> = {};
		for (const [k, v] of Object.entries(e.expect as Record<string, unknown>)) {
			if (typeof v !== "string")
				throw new Error(`one-liner[${i}].expect.${k} not a string`);
			expect[k] = v;
		}
		const entryResult: OneLiner = { name, command, expect };
		if (e.stdin !== undefined && e.stdin !== null) {
			if (typeof e.stdin !== "string")
				throw new Error(`one-liner[${i}].stdin not a string`);
			entryResult.stdin = e.stdin;
		}
		if (e.spawnFlags !== undefined && e.spawnFlags !== null) {
			if (
				!Array.isArray(e.spawnFlags) ||
				!e.spawnFlags.every((f: unknown) => typeof f === "string")
			)
				throw new Error(`one-liner[${i}].spawnFlags not string[]`);
			entryResult.spawnFlags = e.spawnFlags;
		}
		return entryResult;
	});
}

describe("One-liner cookbook", () => {
	const entries = validateOneLiners(oneLiners);
	for (const entry of entries) {
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
