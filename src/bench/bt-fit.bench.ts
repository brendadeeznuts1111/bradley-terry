import { Effect } from "effect";
import { BradleyTerry, BradleyTerryLive } from "../bradley-terry";
import { getGitCommitHash } from "../utils/git-commit.ts" with { type: "macro" };
import { runBench } from "./benchmark-loader";

const teams = ["A", "B", "C", "D", "E"];
const bt = BradleyTerryLive;
const commit = getGitCommitHash();
const commitUrl = `https://github.com/brendadeeznuts1111/bradley-terry/commit/${commit}`;

console.log(`HEAD: ${commit}`);
console.log(`Commit: ${commitUrl}`);

const r1 = await runBench(
	"fit-5k",
	async () => {
		const matches: Array<{ winner: string; loser: string; weight: number; date: Date }> = [];
		for (let i = 0; i < 5000; i++) {
			const w = teams[Math.floor(Math.random() * 5)] ?? "A";
			let l = teams[Math.floor(Math.random() * 5)] ?? "B";
			while (l === w) l = teams[Math.floor(Math.random() * 5)] ?? "A";
			matches.push({ winner: w, loser: l, weight: 1, date: new Date() });
		}
		await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const b = yield* BradleyTerry;
					return yield* b.fit(matches);
				}),
				bt,
			),
		);
	},
	3,
);

const r2 = await runBench(
	"fit-25k",
	async () => {
		const matches: Array<{ winner: string; loser: string; weight: number; date: Date }> = [];
		for (let i = 0; i < 25000; i++) {
			const w = teams[Math.floor(Math.random() * 5)] ?? "A";
			let l = teams[Math.floor(Math.random() * 5)] ?? "B";
			while (l === w) l = teams[Math.floor(Math.random() * 5)] ?? "A";
			matches.push({ winner: w, loser: l, weight: 1, date: new Date() });
		}
		await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const b = yield* BradleyTerry;
					return yield* b.fit(matches);
				}),
				bt,
			),
		);
	},
	3,
);

console.log(r1);
console.log(r2);
