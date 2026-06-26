import { envString } from "../env.js";

const packageFile = Bun.file(new URL("../../package.json", import.meta.url));

export const APP_VERSION: string = await packageFile
	.json()
	.then((pkg: { version?: string }) => pkg.version ?? "0.0.0")
	.catch(() => "0.0.0");

export const GIT_COMMIT: string =
	envString("GIT_COMMIT") ??
	(() => {
		try {
			return Bun.spawnSync({
				cmd: ["git", "rev-parse", "--short", "HEAD"],
				stdout: "pipe",
			})
				.stdout.toString()
				.trim();
		} catch {
			return "unknown";
		}
	})();

/** Bun CLI version — https://bun.com/docs/runtime/utils#bun-version */
export const RUNTIME_VERSION = Bun.version;

/** Bun build git revision — https://bun.com/docs/runtime/utils#bun-revision */
export const RUNTIME_REVISION = Bun.revision;
