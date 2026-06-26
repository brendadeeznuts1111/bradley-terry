/**
 * Bun macros to embed the current git commit hash at build time.
 *
 * Usage:
 *   import { GIT_COMMIT } from "./git-commit";
 *   import { getGitCommitHash } from "./git-commit" with { type: "macro" };
 *
 * `GIT_COMMIT` is replaced with the actual commit hash during bundling.
 * `getGitCommitHash()` is a macro function that returns the hash at build time.
 *
 * See: https://bun.com/docs/bundler/macros#embed-latest-git-commit-hash
 */
export const GIT_COMMIT = Bun.spawnSync({
	cmd: ["git", "rev-parse", "HEAD"],
	stdout: "pipe",
})
	.stdout.toString()
	.trim();

export function getGitCommitHash() {
	const { stdout } = Bun.spawnSync({
		cmd: ["git", "rev-parse", "HEAD"],
		stdout: "pipe",
	});

	return stdout.toString().trim();
}
