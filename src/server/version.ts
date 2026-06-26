import { readFileSync } from "node:fs";
import { join } from "node:path";

const packagePath = join(import.meta.dir, "../../package.json");

export const APP_VERSION: string = (() => {
	try {
		const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };
		return pkg.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
})();

export const GIT_COMMIT: string = (() => {
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

export const RUNTIME_VERSION = Bun.version;
