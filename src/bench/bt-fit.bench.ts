import { Effect, Schema } from "effect";
import { BradleyTerry, BradleyTerryLive } from "../bradley-terry";
import { EntityId, type Match } from "../schema";
import { getGitCommitHash } from "../utils/git-commit.ts" with {
	type: "macro",
};
import { runBench } from "./benchmark-loader";

const teams = ["A", "B", "C", "D", "E"];
const teamIds = teams.map((team) => Schema.decodeSync(EntityId)(team));

function randomTeamId(): EntityId {
	const id = teamIds[Math.floor(Math.random() * teamIds.length)];
	if (!id) throw new Error("teamIds array unexpectedly empty");
	return id;
}

const bt = BradleyTerryLive;
const commit = getGitCommitHash();
const commitUrl = `https://github.com/brendadeeznuts1111/bradley-terry/commit/${commit}`;

console.log(`HEAD: ${commit}`);
console.log(`Commit: ${commitUrl}`);

const r1 = await runBench(
	"fit-5k",
	async () => {
		const matches: Match[] = [];
		for (let i = 0; i < 5000; i++) {
			const w = randomTeamId();
			let l = randomTeamId();
			while (l === w) l = randomTeamId();
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
		const matches: Match[] = [];
		for (let i = 0; i < 25000; i++) {
			const w = randomTeamId();
			let l = randomTeamId();
			while (l === w) l = randomTeamId();
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
