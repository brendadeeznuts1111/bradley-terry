import { describe, expect, it } from "bun:test";
import { spawnSync } from "bun";
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync, realpathSync } from "fs";
import { join } from "path";
import os from "node:os";

// ============================================
// Helpers — modeled after test/harness.ts patterns
// ============================================

const bunEnv: Record<string, string | undefined> = {
  ...process.env,
  NO_COLOR: "1",
  FORCE_COLOR: undefined,
  BUN_DEBUG_QUIET_LOGS: "1",
};
for (const key of Object.keys(bunEnv)) {
  if (bunEnv[key] === undefined) delete bunEnv[key];
}

function bunExe(): string {
  return process.platform === "win32" ? process.execPath.replaceAll("\\", "/") : "bun";
}

function createTempPackageDir(): string {
  const base = mkdtempSync(join(realpathSync(os.tmpdir()), "bt-completions-test-"));
  writeFileSync(join(base, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
  return base;
}

interface CompletionData {
  version: string;
  bunVersion?: string;
  commands: Record<string, { flags: unknown[]; positionalArgs: unknown[]; examples: unknown[] }>;
  globalFlags: unknown[];
  bunGetCompletes: { available: boolean; commands?: Record<string, string> };
}

function runScript(cwd: string, outputDir: string): CompletionData {
  const outputPath = join(outputDir, "bun-cli.json");
  const result = spawnSync({
    cmd: [bunExe(), "run", join(process.cwd(), "scripts/generate-cli-completions.ts"), "--skip-nested", "-o", outputPath],
    stdout: "pipe",
    stderr: "pipe",
    cwd,
    env: bunEnv,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Script failed (exit ${result.exitCode}): ${result.stderr?.toString()}`);
  }

  if (!existsSync(outputPath)) {
    throw new Error(`Output file not created at ${outputPath}`);
  }

  return JSON.parse(readFileSync(outputPath, "utf8")) as CompletionData;
}

// ============================================
// Tests
// ============================================

describe("cli-completions generator", () => {
  const tempDirs: string[] = [];

  it("generates valid JSON with expected core commands", () => {
    const scriptCwd = createTempPackageDir();
    tempDirs.push(scriptCwd);
    const outputDir = createTempPackageDir();
    tempDirs.push(outputDir);

    const data = runScript(scriptCwd, outputDir);

    // Core commands must be present
    const requiredCommands = ["install", "add", "run", "test", "build", "pm"];
    for (const cmd of requiredCommands) {
      expect(data.commands[cmd], `missing core command: ${cmd}`).toBeDefined();
    }

    // Global flags section must be non-empty
    expect(data.globalFlags.length).toBeGreaterThan(0);

    // Each core command must have a flags array (even if empty for some)
    for (const cmd of requiredCommands) {
      expect(Array.isArray(data.commands[cmd].flags)).toBe(true);
    }

    // Version metadata
    expect(data.version).toBe("1.1.0");
    expect(data.bunVersion).toBeTruthy();
  });

  it("includes bunVersion matching the running Bun", () => {
    const scriptCwd = createTempPackageDir();
    tempDirs.push(scriptCwd);
    const outputDir = createTempPackageDir();
    tempDirs.push(outputDir);

    const data = runScript(scriptCwd, outputDir);

    const versionResult = spawnSync({
      cmd: [bunExe(), "--version"],
      stdout: "pipe",
      stderr: "pipe",
      cwd: scriptCwd,
      env: bunEnv,
    });
    const expectedVersion = (versionResult.stdout?.toString() ?? "").trim();

    expect(data.bunVersion).toBe(expectedVersion);
  });

  it("validates bunGetCompletes availability", () => {
    const scriptCwd = createTempPackageDir();
    tempDirs.push(scriptCwd);
    const outputDir = createTempPackageDir();
    tempDirs.push(outputDir);

    const data = runScript(scriptCwd, outputDir);

    // bun getcompletes should be available on modern Bun
    expect(data.bunGetCompletes.available).toBe(true);
    expect(data.bunGetCompletes.commands).toBeDefined();
    expect(data.bunGetCompletes.commands?.scripts).toContain("getcompletes");
  });

  it("--dry-run does not write a file", () => {
    const scriptCwd = createTempPackageDir();
    tempDirs.push(scriptCwd);
    const outputDir = createTempPackageDir();
    tempDirs.push(outputDir);
    const outputPath = join(outputDir, "bun-cli.json");

    const result = spawnSync({
      cmd: [bunExe(), "run", join(process.cwd(), "scripts/generate-cli-completions.ts"), "--dry-run", "--skip-nested", "-o", outputPath],
      stdout: "pipe",
      stderr: "pipe",
      cwd: scriptCwd,
      env: bunEnv,
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("install command has aliases and flags", () => {
    const scriptCwd = createTempPackageDir();
    tempDirs.push(scriptCwd);
    const outputDir = createTempPackageDir();
    tempDirs.push(outputDir);

    const data = runScript(scriptCwd, outputDir);

    const install = data.commands["install"] as { flags: unknown[]; aliases?: string[] };
    expect(install.flags.length).toBeGreaterThan(0);
    // install should have at least the "i" alias
    const installCmd = data.commands["install"] as { aliases?: string[] };
    expect(installCmd.aliases).toBeDefined();
    expect(installCmd.aliases?.length).toBeGreaterThan(0);
  });

  // Cleanup all temp dirs after all tests
  it.cleanup = () => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // already gone
      }
    }
  };
});
