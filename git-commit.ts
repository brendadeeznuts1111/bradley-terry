/**
 * Bun macro to embed the current git commit hash at build time.
 *
 * Usage:
 *   import { GIT_COMMIT } from "./git-commit";
 *
 * This value is replaced with the actual commit hash during bundling.
 * See: https://bun.com/docs/bundler/macros#embed-latest-git-commit-hash
 */
export const GIT_COMMIT = Bun.$.sync`git rev-parse HEAD`.stdout.toString().trim();