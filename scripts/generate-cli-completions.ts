#!/usr/bin/env bun
/**
 * CLI Flag Parser for Bun Commands
 *
 * This script reads the --help menu for every Bun command and generates JSON
 * containing all flag information, descriptions, and whether they support
 * positional or non-positional arguments.
 *
 * Handles complex cases like:
 * - Nested subcommands (bun pm cache rm)
 * - Command aliases (bun i = bun install, bun a = bun add)
 * - Dynamic completions (scripts, packages, files)
 * - Context-aware flags
 * - Special cases like bare 'bun' vs 'bun run'
 *
 * Output is saved to completions/bun-cli.json for use in generating
 * shell completions (fish, bash, zsh).
 */

import { spawnSync } from "bun";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from "fs";
import { join } from "path";
import os from "node:os";

interface FlagInfo {
  name: string;
  shortName?: string;
  description: string;
  hasValue: boolean;
  valueType?: string;
  defaultValue?: string;
  choices?: string[];
  required?: boolean;
  multiple?: boolean;
}

interface SubcommandInfo {
  name: string;
  description: string;
  flags?: FlagInfo[];
  subcommands?: Record<string, SubcommandInfo>;
  positionalArgs?: {
    name: string;
    description?: string;
    required: boolean;
    multiple: boolean;
    type?: string;
    completionType?: string;
  }[];
  examples?: string[];
}

interface CommandInfo {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  flags: FlagInfo[];
  positionalArgs: {
    name: string;
    description?: string;
    required: boolean;
    multiple: boolean;
    type?: string;
    completionType?: string;
  }[];
  examples: string[];
  subcommands?: Record<string, SubcommandInfo>;
  documentationUrl?: string;
  dynamicCompletions?: {
    scripts?: boolean;
    packages?: boolean;
    files?: boolean;
    binaries?: boolean;
  };
}

interface CompletionData {
  version: string;
  bunVersion?: string;
  commands: Record<string, CommandInfo>;
  globalFlags: FlagInfo[];
  specialHandling: {
    bareCommand: {
      description: string;
      canRunFiles: boolean;
      dynamicCompletions: {
        scripts: boolean;
        files: boolean;
        binaries: boolean;
      };
    };
  };
  bunGetCompletes: {
    available: boolean;
    commands?: {
      scripts: string; // "bun getcompletes s" or "bun getcompletes z"
      binaries: string; // "bun getcompletes b"
      packages: string; // "bun getcompletes a <prefix>"
      files: string; // "bun getcompletes j"
    };
  };
}

const BUN_EXECUTABLE = process.env.BUN_DEBUG_BUILD || "bun";

/**
 * Clean env for spawning Bun subprocesses — strips debug noise that would
 * pollute help output. Modeled after the Bun repo's `bunEnv` from test/harness.ts.
 */
const bunEnv: Record<string, string | undefined> = {
  ...process.env,
  NO_COLOR: "1",
  FORCE_COLOR: undefined,
  BUN_DEBUG_QUIET_LOGS: "1",
  BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
  TZ: "Etc/UTC",
};

// Strip undefined keys (Bun.spawnSync inherits them otherwise)
for (const key of Object.keys(bunEnv)) {
  if (bunEnv[key] === undefined) delete bunEnv[key];
}

/**
 * Resolve the Bun executable path. On Windows, normalize backslashes.
 * Modeled after the Bun repo's `bunExe()` from test/harness.ts.
 */
function bunExe(): string {
  if (process.platform === "win32") return process.execPath.replaceAll("\\", "/");
  return BUN_EXECUTABLE;
}

/**
 * A temporary directory that auto-cleans via `Symbol.dispose`.
 * Usage: `using dir = createTempPackageDir();`
 * Modeled after the Bun repo's `DisposableString` from test/harness.ts.
 */
class DisposableTempDir extends String {
  [Symbol.dispose]() {
    rmSync(this + "", { recursive: true, force: true });
  }
  [Symbol.asyncDispose]() {
    return import("fs/promises").then(m => m.rm(this + "", { recursive: true, force: true }));
  }
}

/**
 * Create a temp directory under os.tmpdir() (not CWD) with a dummy
 * package.json, so `bun run --help` doesn't pick up real repo scripts.
 * Returns a DisposableTempDir — use with `using` for auto-cleanup.
 */
function createTempPackageDir(): DisposableTempDir {
  const base = mkdtempSync(join(realpathSync(os.tmpdir()), "bun-completions-"));
  writeFileSync(
    join(base, "package.json"),
    JSON.stringify({ name: "test", version: "1.0.0", scripts: {} }),
  );
  return new DisposableTempDir(base);
}

/**
 * Parse flag line from help output.
 * Tries strict patterns first, then falls back to a flexible parser
 * that tolerates spacing/separator variations.
 */
function parseFlag(line: string): FlagInfo | null {
  // Match patterns like:
  // -h, --help                          Display this menu and exit
  // --timeout=<val>              Set the per-test timeout in milliseconds, default is 5000.
  // -r, --preload=<val>                 Import a module before other modules are loaded
  // --watch                         Automatically restart the process on file change

  const patterns = [
    // Long flag with short flag and value: -r, --preload=<val>
    /^\s*(-[a-zA-Z]),\s+(--[a-zA-Z-]+)=(<[^>]+>)\s+(.+)$/,
    // Long flag with short flag: -h, --help
    /^\s*(-[a-zA-Z]),\s+(--[a-zA-Z-]+)\s+(.+)$/,
    // Long flag with value: --timeout=<val>
    /^\s+(--[a-zA-Z-]+)=(<[^>]+>)\s+(.+)$/,
    // Long flag without value: --watch
    /^\s+(--[a-zA-Z-]+)\s+(.+)$/,
    // Short flag only: -i
    /^\s+(-[a-zA-Z])\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return extractFlagFromMatch(match, line);
    }
  }

  // Flexible fallback: split on 2+ spaces to separate flags from description
  const flexibleMatch = line.match(/^\s*(.+?)\s{2,}(.+)$/);
  if (flexibleMatch) {
    const flagPart = flexibleMatch[1].trim();
    const description = flexibleMatch[2].trim();

    // Parse the flag part: could be "-h, --help", "--flag=<val>", "--flag", "-h"
    const tokens = flagPart.split(/[,\s]+/).filter(Boolean);
    let shortName: string | undefined;
    let longName: string | undefined;
    let valueSpec: string | undefined;

    for (const token of tokens) {
      if (token.startsWith("--")) {
        const eqIdx = token.indexOf("=");
        if (eqIdx > 0) {
          longName = token.slice(0, eqIdx);
          valueSpec = token.slice(eqIdx + 1);
        } else {
          longName = token;
        }
      } else if (token.startsWith("-") && token.length === 2) {
        shortName = token;
      } else if (token.startsWith("<") && token.endsWith(">")) {
        valueSpec = token;
      }
    }

    if (longName || shortName) {
      return buildFlagInfo(longName, shortName, valueSpec, description);
    }
  }

  return null;
}

/**
 * Extract FlagInfo from a regex match array.
 */
function extractFlagFromMatch(match: RegExpMatchArray, _line: string): FlagInfo | null {
  let shortName: string | undefined;
  let longName: string;
  let valueSpec: string | undefined;
  let description: string;

  if (match.length === 5) {
    [, shortName, longName, valueSpec, description] = match;
  } else if (match.length === 4) {
    if (match[1].startsWith("-") && match[1].length === 2) {
      [, shortName, longName, description] = match;
    } else if (match[2].startsWith("<")) {
      [, longName, valueSpec, description] = match;
    } else {
      [, longName, description] = match;
    }
  } else if (match.length === 3) {
    if (match[1].length === 2) {
      [, shortName, description] = match;
      longName = shortName.replace("-", "--");
    } else {
      [, longName, description] = match;
    }
  } else {
    return null;
  }

  return buildFlagInfo(longName, shortName, valueSpec, description);
}

/**
 * Build a FlagInfo object from parsed components.
 */
function buildFlagInfo(
  longName: string | undefined,
  shortName: string | undefined,
  valueSpec: string | undefined,
  description: string
): FlagInfo | null {
  if (!longName && !shortName) return null;
  const name = (longName ?? shortName!).replace(/^--?/, "");

  // Extract additional info from description
  const hasValue = !!valueSpec;
  let valueType: string | undefined;
  let defaultValue: string | undefined;
  let choices: string[] | undefined;

  if (valueSpec) {
    // Normalize value type: <val> -> string, <NUM> -> number, <path> -> string
    const rawType = valueSpec.replace(/[<>]/g, "");
    if (rawType === "val" || rawType === "path" || rawType === "file" || rawType === "dir") {
      valueType = "string";
    } else if (rawType === "NUM" || rawType === "num" || rawType === "number" || rawType === "N") {
      valueType = "number";
    } else {
      valueType = rawType;
    }
  }

  // Look for default values in description
  const defaultMatch = description.match(/[Dd]efault(?:s?)\s*(?:is|to|:)\s*"?([^".\s,]+)"?/);
  if (defaultMatch) {
    defaultValue = defaultMatch[1];
  }

  // Look for choices/enums
  const choicesMatch = description.match(/(?:One of|Valid (?:orders?|values?|options?)):?\s*"?([^"]+)"?/);
  if (choicesMatch) {
    choices = choicesMatch[1]
      .split(/[,\s]+/)
      .map(s => s.replace(/[",]/g, "").trim())
      .filter(Boolean);
  }

  return {
    name,
    shortName: shortName?.replace(/^-/, ""),
    description: description.trim(),
    hasValue,
    valueType,
    defaultValue,
    choices,
    required: false,
    multiple: description.toLowerCase().includes("multiple") || description.includes("[]"),
  };
}

/**
 * Parse usage line to extract positional arguments
 */
function parseUsage(usage: string): {
  name: string;
  description?: string;
  required: boolean;
  multiple: boolean;
  type?: string;
  completionType?: string;
}[] {
  const args: {
    name: string;
    description?: string;
    required: boolean;
    multiple: boolean;
    type?: string;
    completionType?: string;
  }[] = [];

  // Extract parts after command name
  const parts = usage.split(/\s+/).slice(2); // Skip "Usage:" and command name

  for (const part of parts) {
    if (part.startsWith("[") || part.startsWith("<") || part.includes("...")) {
      let name = part;
      let required = false;
      let multiple = false;
      let completionType: string | undefined;

      // Clean up the argument name
      name = name.replace(/[\[\]<>]/g, "");

      if (part.startsWith("<")) {
        required = true;
      }

      if (part.includes("...") || name.includes("...")) {
        multiple = true;
        name = name.replace(/\.{3}/g, "");
      }

      // Skip flags
      if (!name.startsWith("-") && name.length > 0) {
        // Determine completion type based on argument name
        if (name.toLowerCase().includes("package")) {
          completionType = "package";
        } else if (name.toLowerCase().includes("script")) {
          completionType = "script";
        } else if (name.toLowerCase().includes("file") || name.includes(".")) {
          completionType = "file";
        }

        args.push({
          name,
          required,
          multiple,
          type: "string", // Default type
          completionType,
        });
      }
    }
  }

  return args;
}

/**
 * Execute bun command and get help output synchronously via spawnSync.
 * Retries once on empty output and logs a warning if still empty.
 */
function getHelpOutput(command: string[], cwd: string): string {
  const label = command.length === 0 ? "bun" : `bun ${command.join(" ")}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = spawnSync({
        cmd: [bunExe(), ...command, "--help"],
        stdout: "pipe",
        stderr: "pipe",
        cwd,
        env: bunEnv,
      });

      const stdout = result.stdout?.toString() ?? "";
      const stderr = result.stderr?.toString() ?? "";
      const output = stdout || stderr || "";

      if (output.trim()) {
        return output;
      }

      // Empty output — retry once before giving up
      if (attempt === 1) {
        console.warn(`⚠️  Empty help output for "${label}", retrying...`);
        continue;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt === 1) {
        console.warn(`⚠️  Spawn failed for "${label}" (attempt 1): ${msg} — retrying...`);
        continue;
      }
      console.warn(`⚠️  Spawn failed for "${label}" (attempt 2): ${msg}`);
    }

    console.warn(`⚠️  No help output for "${label}" after retry — skipping.`);
    return "";
  }

  return "";
}

/**
 * Check whether `bun getcompletes` is available and which subcommands work.
 * Probes --help and each of the known subcommands (s, b, j, a) via spawnSync.
 * Returns the bunGetCompletes section for CompletionData, with
 * available=false and no commands map if the feature is absent.
 */
function checkGetCompletes(cwd: string): CompletionData["bunGetCompletes"] {
  const subcommands: Record<string, string> = {
    scripts: "bun getcompletes s",
    binaries: "bun getcompletes b",
    packages: "bun getcompletes a",
    files: "bun getcompletes j",
  };

  // First probe: does `bun getcompletes --help` exist at all?
  try {
    const result = spawnSync({
      cmd: [bunExe(), "getcompletes", "--help"],
      stdout: "pipe",
      stderr: "pipe",
      cwd,
      env: bunEnv,
    });

    const output = ((result.stdout?.toString() ?? "") + (result.stderr?.toString() ?? "")).trim();
    if (!output) {
      console.warn("⚠️  `bun getcompletes` returned no output — marking as unavailable.");
      return { available: false };
    }

    if (output.toLowerCase().includes("error") && !output.toLowerCase().includes("usage")) {
      console.warn("⚠️  `bun getcompletes` reported an error — marking as unavailable.");
      return { available: false };
    }
  } catch (error) {
    console.warn("⚠️  `bun getcompletes` could not be spawned — marking as unavailable:", error);
    return { available: false };
  }

  // Probe each subcommand to confirm it works
  const working: string[] = [];
  for (const [key, _label] of Object.entries(subcommands)) {
    try {
      const result = spawnSync({
        cmd: [bunExe(), "getcompletes", key === "packages" ? "a" : key[0]],
        stdout: "pipe",
        stderr: "pipe",
        cwd,
        env: bunEnv,
      });
      if (result.exitCode === 0 || (result.stdout?.toString() ?? "").length > 0) {
        working.push(key);
      }
    } catch {
      console.warn(`⚠️  \`bun getcompletes ${key[0]}\` failed — omitting from completions.`);
    }
  }

  if (working.length === 0) {
    console.warn("⚠️  No `bun getcompletes` subcommands responded — marking as unavailable.");
    return { available: false };
  }

  // Only include subcommands that actually worked
  const commands: Record<string, string> = {};
  for (const key of working) {
    commands[key] = subcommands[key];
  }

  console.log(`✅ \`bun getcompletes\` available (${working.length}/${Object.keys(subcommands).length} subcommands: ${working.join(", ")})`);
  return { available: true, commands: commands as CompletionData["bunGetCompletes"]["commands"] };
}

/**
 * Parse PM subcommands from help output.
 *
 * The `bun pm --help` output uses a tree format with ├/└ characters to
 * show nested subcommands and flags inline:
 *
 *   bun pm pack                 create a tarball of the current workspace
 *   ├ --dry-run                 do everything except for writing the tarball to disk
 *   └ --quiet                   only output the tarball filename
 *   bun pm pkg                  manage data in package.json
 *   ├ get [key ...]
 *   ├ set key=value ...
 *   ├ delete key ...
 *
 * This function parses both the top-level subcommands and their inline
 * nested subcommands/flags in a single pass — no recursive --help calls
 * needed.
 */
function parsePmSubcommands(helpText: string): Record<string, SubcommandInfo> {
  const lines = helpText.split("\n");
  const subcommands: Record<string, SubcommandInfo> = {};

  let inCommands = false;
  let currentSub: SubcommandInfo | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "Commands:") {
      inCommands = true;
      continue;
    }

    if (inCommands && trimmed.startsWith("Learn more")) {
      break;
    }

    if (!inCommands) continue;

    // Top-level subcommand: "  bun pm pack                 create a tarball..."
    // Also handles "  bun list                  list the dependency tree..."
    // Also handles nested-as-top-level: "  bun pm cache rm             clear the cache"
    if (!line.includes("├") && !line.includes("└")) {
      // Try to match "bun pm <sub> <nested>  <desc>" (2+ spaces before desc)
      const nestedTopMatch = line.match(/^\s+bun pm (\S+)\s+(\S+)\s{2,}(.+)$/);
      if (nestedTopMatch) {
        const [, parentName, nestedName, nestedDesc] = nestedTopMatch;
        if (!parentName.startsWith("-") && parentName !== "pm") {
          // Ensure parent exists
          if (!subcommands[parentName]) {
            subcommands[parentName] = {
              name: parentName,
              description: "",
              flags: [],
              positionalArgs: [],
              subcommands: {},
              examples: [],
            };
          }
          const parent = subcommands[parentName]!;

          // If nestedName looks like a positional arg ([arg], <arg>, or name[arg]),
          // store it as a positionalArg instead of a subcommand
          if (nestedName.startsWith("[") || nestedName.startsWith("<") || nestedName.includes("[")) {
            parent.positionalArgs = parent.positionalArgs || [];
            parent.positionalArgs.push({
              name: nestedName.replace(/[\[\]<>]/g, ""),
              description: nestedDesc.trim(),
              required: nestedName.startsWith("<"),
              multiple: false,
            });
          } else {
            parent.subcommands = parent.subcommands || {};
            parent.subcommands[nestedName] = {
              name: nestedName,
              description: nestedDesc.trim(),
              flags: [],
              positionalArgs: [],
              subcommands: {},
              examples: [],
            };
          }
          currentSub = parent;
        }
        continue;
      }

      const topMatch = line.match(/^\s+bun (?:pm )?(\S+)(?:\s+(.+))?$/);
      if (topMatch) {
        const [, name, description = ""] = topMatch;
        if (name.startsWith("-") || name === "pm") continue;

        // Don't overwrite if already created by a nested-top-level match
        if (!subcommands[name]) {
          subcommands[name] = {
            name,
            description: description.trim(),
            flags: [],
            positionalArgs: [],
            subcommands: {},
            examples: [],
          };
        }
        currentSub = subcommands[name];
      }
      continue;
    }

    // Nested subcommand or flag: "  ├ --dry-run                 do everything..."
    // or "  ├ get [key ...]"
    // or "  └ -g                        print the global path to bin folder"
    const nestedMatch = line.match(/^\s*[├└]\s+(.+)$/);
    if (nestedMatch && currentSub) {
      const nestedContent = nestedMatch[1];
      // Split on 2+ spaces to separate name from description
      const parts = nestedContent.split(/\s{2,}/);
      const namePart = parts[0].trim();
      const descPart = parts.slice(1).join("  ").trim();

      if (namePart.startsWith("--")) {
        // Long flag
        const flagName = namePart.replace(/^--/, "").split("=")[0];
        currentSub.flags = currentSub.flags || [];
        currentSub.flags.push({
          name: flagName,
          description: descPart,
          hasValue: namePart.includes("="),
        });
      } else if (namePart.startsWith("-")) {
        // Short flag
        const flagName = namePart.replace(/^-/, "");
        currentSub.flags = currentSub.flags || [];
        currentSub.flags.push({
          name: flagName,
          shortName: flagName,
          description: descPart,
          hasValue: false,
        });
      } else {
        // Nested subcommand (e.g., "get [key ...]")
        const nestedName = namePart.split(/\s/)[0];

        // Skip if this is a duplicate of an existing positional arg
        // (e.g., "increment" appears as both [increment] positional and ├ increment)
        const existingArgs = currentSub.positionalArgs || [];
        if (existingArgs.some(a => a.name === nestedName)) {
          continue;
        }

        currentSub.subcommands = currentSub.subcommands || {};
        currentSub.subcommands[nestedName] = {
          name: nestedName,
          description: descPart || namePart,
          flags: [],
          positionalArgs: [],
          subcommands: {},
          examples: [],
        };
      }
    }
  }

  // Standardize "list" -> "ls" (bun list is the alias, bun pm ls is canonical)
  if (!subcommands["ls"] && subcommands["list"]) {
    subcommands["ls"] = subcommands["list"];
    subcommands["ls"].name = "ls";
    subcommands["ls"].description += " (alias: bun list)";
    delete subcommands["list"];
  } else if (!subcommands["ls"]) {
    subcommands["ls"] = {
      name: "ls",
      description: "List installed dependencies and their versions (alias: bun list)",
      flags: [],
      positionalArgs: [],
      subcommands: {},
      examples: [],
    };
  }

  return subcommands;
}

/**
 * Parse help output into CommandInfo
 */
function parseHelpOutput(helpText: string, commandName: string): CommandInfo {
  const lines = helpText.split("\n");
  const command: CommandInfo = {
    name: commandName,
    description: "",
    flags: [],
    positionalArgs: [],
    subcommands: {},
    examples: [],
  };

  let currentSection = "";
  let inFlags = false;
  let inExamples = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Extract command description (usually the first non-usage line)
    if (
      !command.description &&
      trimmed &&
      !trimmed.startsWith("Usage:") &&
      !trimmed.startsWith("Alias:") &&
      currentSection === ""
    ) {
      command.description = trimmed;
      continue;
    }

    // Extract aliases
    if (trimmed.startsWith("Alias:")) {
      const aliasMatch = trimmed.match(/Alias:\s*(.+)/);
      if (aliasMatch) {
        command.aliases = aliasMatch[1]
          .split(/[,\s]+/)
          .map(a => a.trim())
          .filter(Boolean);
      }
      continue;
    }

    // Extract usage and positional args
    if (trimmed.startsWith("Usage:")) {
      console.log(`📝 Parsing usage for command: ${commandName}`);
      command.usage = trimmed;
      console.log(`✅ Parsed usage: ${command.usage}`);
      command.positionalArgs = parseUsage(trimmed);
      console.log(`✅ Parsed positional args: ${JSON.stringify(command.positionalArgs)}`);
      continue;
    }

    // Track sections
    if (trimmed === "Flags:" || trimmed === "Options:") {
      console.log(`📝 Parsing ${trimmed} section for command: ${commandName}`);
      inFlags = true;
      currentSection = "flags";
      continue;
    } else if (trimmed === "Examples:") {
      console.log(`📝 Parsing examples section for command: ${commandName}`);
      inExamples = true;
      inFlags = false;
      currentSection = "examples";
      continue;
    } else if (
      trimmed.startsWith("Full documentation") ||
      trimmed.startsWith("Learn more") ||
      trimmed.startsWith("A full list")
    ) {
      const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        command.documentationUrl = urlMatch[0];
      }
      inFlags = false;
      inExamples = false;
      continue;
    }

    // Parse flags
    if (inFlags && line.match(/^\s+(-|\s+--)/)) {
      const flag = parseFlag(line);
      if (flag) {
        command.flags.push(flag);
      } else {
        // Flag-looking line that didn't match any parser pattern
        console.warn(`⚠️  Unparsed flag line in "${commandName}": ${line.trim()}`);
      }
    }

    // Parse examples
    if (inExamples && trimmed && !trimmed.startsWith("Full documentation")) {
      if (trimmed.startsWith("bun ") || trimmed.startsWith("./") || trimmed.startsWith("Bundle")) {
        command.examples.push(trimmed);
      }
    }
  }

  // Special case for pm command
  if (commandName === "pm") {
    command.subcommands = parsePmSubcommands(helpText);
  }

  // Add dynamic completion info based on command
  command.dynamicCompletions = {};
  if (commandName === "run") {
    command.dynamicCompletions.scripts = true;
    command.dynamicCompletions.files = true;
    command.dynamicCompletions.binaries = true;
    // Also add file type info for positional args
    for (const arg of command.positionalArgs) {
      if (arg.name.includes("file") || arg.name.includes("script")) {
        arg.completionType = "javascript_files";
      }
    }
  } else if (commandName === "add") {
    command.dynamicCompletions.packages = true;
    // Mark package args
    for (const arg of command.positionalArgs) {
      if (arg.name.includes("package") || arg.name === "name") {
        arg.completionType = "package";
      }
    }
  } else if (commandName === "remove") {
    command.dynamicCompletions.packages = true; // installed packages
    for (const arg of command.positionalArgs) {
      if (arg.name.includes("package") || arg.name === "name") {
        arg.completionType = "installed_package";
      }
    }
  } else if (["test"].includes(commandName)) {
    command.dynamicCompletions.files = true;
    for (const arg of command.positionalArgs) {
      if (arg.name.includes("pattern") || arg.name.includes("file")) {
        arg.completionType = "test_files";
      }
    }
  } else if (["build"].includes(commandName)) {
    command.dynamicCompletions.files = true;
    for (const arg of command.positionalArgs) {
      if (arg.name === "entrypoint" || arg.name.includes("file")) {
        arg.completionType = "javascript_files";
      }
    }
  } else if (commandName === "create") {
    // Create has special template completions
    for (const arg of command.positionalArgs) {
      if (arg.name.includes("template")) {
        arg.completionType = "create_template";
      }
    }
  }

  return command;
}

/**
 * Get list of main commands from bun --help
 */
function getMainCommands(cwd: string): string[] {
  const helpText = getHelpOutput([], cwd);
  const lines = helpText.split("\n");
  const commands: string[] = [];

  let inCommands = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "Commands:") {
      inCommands = true;
      continue;
    }

    // Stop when we hit the "Flags:" section
    if (inCommands && trimmed === "Flags:") {
      break;
    }

    if (inCommands && line.match(/^\s+\w+/)) {
      // Extract command name (first word after whitespace)
      const match = line.match(/^\s+(\w+)/);
      if (match) {
        commands.push(match[1]);
      }
    }
  }

  const commandsToRemove = ["lint"];

  return commands.filter(a => {
    if (commandsToRemove.includes(a)) {
      return false;
    }
    return true;
  });
}

/**
 * Extract global flags from main help
 */
function parseGlobalFlags(helpText: string): FlagInfo[] {
  const lines = helpText.split("\n");
  const flags: FlagInfo[] = [];

  let inFlags = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "Flags:") {
      inFlags = true;
      continue;
    }

    if (inFlags && (trimmed === "" || trimmed.startsWith("("))) {
      break;
    }

    if (inFlags && line.match(/^\s+(-|\s+--)/)) {
      const flag = parseFlag(line);
      if (flag) {
        flags.push(flag);
      }
    }
  }

  return flags;
}

/**
 * Add fallback aliases for commands that don't have an "Alias:" line in help.
 * Aliases parsed from help text (in parseHelpOutput) take priority.
 */
function addCommandAliases(commands: Record<string, CommandInfo>): void {
  const fallbackAliases: Record<string, string[]> = {
    "install": ["i"],
    "add": ["a"],
    "remove": ["rm"],
    "create": ["c"],
    "x": ["bunx"], // bunx is an alias for bun x
  };

  for (const [command, aliases] of Object.entries(fallbackAliases)) {
    if (commands[command] && !commands[command].aliases) {
      commands[command].aliases = aliases;
    }
  }
}

/**
 * Add documented flags that don't appear in --help output.
 *
 * Some flags are documented on bun.com/docs but not yet exposed in the
 * command's --help output. We add them here as a fallback so the
 * completion JSON is at parity with the documentation.
 *
 * Source: https://bun.com/docs/pm/cli/<command>.md
 */
function addDocumentedFlags(commands: Record<string, CommandInfo>): void {
  // Flags documented on bun.com/docs but not in --help output
  const documentedFlags: Record<string, Array<{ name: string; shortName?: string; description: string; hasValue?: boolean }>> = {
    "audit": [
      { name: "production", shortName: "p", description: "Audit only production dependencies (excludes devDependencies)", hasValue: false },
    ],
    "init": [
      { name: "cwd", description: "Run bun init as if started in a different working directory", hasValue: true },
    ],
    "create": [
      { name: "force", description: "Overwrite existing files", hasValue: false },
      { name: "no-install", description: "Skip installing node_modules & tasks", hasValue: false },
      { name: "no-git", description: "Don't initialize a git repository", hasValue: false },
      { name: "open", description: "Start & open in-browser after finish", hasValue: false },
    ],
    "upgrade": [
      { name: "canary", description: "Upgrade to the latest canary build", hasValue: false },
      { name: "stable", description: "Switch from canary back to the latest stable release", hasValue: false },
    ],
  };

  // Documented defaults not always present in --help text
  const documentedDefaults: Record<string, Record<string, string>> = {
    "install": {
      "backend": "clonefile",
      "concurrent-scripts": "5",
      "network-concurrency": "48",
      "save": "true",
    },
    "add": {
      "backend": "clonefile",
      "concurrent-scripts": "5",
      "network-concurrency": "48",
      "save": "true",
    },
  };

  for (const [cmd, flags] of Object.entries(documentedFlags)) {
    if (!commands[cmd]) continue;
    const existingNames = new Set(commands[cmd].flags.map(f => f.name));
    for (const flag of flags) {
      if (!existingNames.has(flag.name)) {
        commands[cmd].flags.push({
          name: flag.name,
          shortName: flag.shortName,
          description: flag.description,
          hasValue: flag.hasValue ?? false,
          valueType: flag.hasValue ? "string" : undefined,
        });
        console.log(`📝 Adding documented flag not in --help: ${cmd} --${flag.name}`);
      }
    }
  }

  // Apply documented defaults to existing flags.
  // Documented defaults from bun.com/docs override --help defaults since
  // --help sometimes shows dynamic values (e.g. "2x cpu count") instead of
  // the static default.
  for (const [cmd, defaults] of Object.entries(documentedDefaults)) {
    if (!commands[cmd]) continue;
    for (const flag of commands[cmd].flags) {
      if (defaults[flag.name]) {
        flag.defaultValue = defaults[flag.name];
      }
    }
  }
}

/**
 * Get the Bun version string for embedding in the JSON output.
 */
function getBunVersion(cwd: string): string | undefined {
  try {
    const result = spawnSync({
      cmd: [bunExe(), "--version"],
      stdout: "pipe",
      stderr: "pipe",
      cwd,
      env: bunEnv,
    });
    return (result.stdout?.toString() ?? "").trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse CLI args for this script.
 * Supported flags:
 *   --dry-run       Parse and print stats without writing the JSON file
 *   --skip-nested   Skip recursive pm subcommand discovery (faster)
 *   -o <path>       Custom output path (default: completions/bun-cli.json)
 */
interface CliArgs {
  dryRun: boolean;
  skipNested: boolean;
  outputPath: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    skipNested: false,
    outputPath: join(process.cwd(), "completions", "bun-cli.json"),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "--dryrun" || arg === "-n") {
      args.dryRun = true;
    } else if (arg === "--skip-nested") {
      args.skipNested = true;
    } else if (arg === "-o" || arg === "--output") {
      const next = argv[i + 1];
      if (next) {
        args.outputPath = next;
        i++;
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: bun run scripts/generate-cli-completions.ts [options]

Options:
  --dry-run, -n    Parse and print stats without writing the JSON file
  --skip-nested    Skip recursive pm subcommand discovery (faster)
  -o <path>        Custom output path (default: completions/bun-cli.json)
  -h, --help       Show this help message
`);
      process.exit(0);
    }
  }

  return args;
}

/**
 * Main function to generate completion data.
 * Uses `using` for automatic temp dir cleanup (Symbol.dispose).
 */
function generateCompletions(cliArgs: CliArgs): void {
  using tempDir = createTempPackageDir();
  const cwd = String(tempDir);

  if (cliArgs.dryRun) {
    console.log("🔍 Discovering Bun commands (dry-run, no file will be written)...");
  } else {
    console.log("🔍 Discovering Bun commands...");
  }

  // Get Bun version for the JSON output
  const bunVersion = getBunVersion(cwd);
  if (bunVersion) {
    console.log(`📌 Bun version: ${bunVersion}`);
  }

  // Get main help and extract commands
  const mainHelpText = getHelpOutput([], cwd);
  const mainCommands = getMainCommands(cwd);
  const globalFlags = parseGlobalFlags(mainHelpText);

  console.log(`📋 Found ${mainCommands.length} main commands: ${mainCommands.join(", ")}`);

  // Probe getcompletes
  const bunGetCompletes = checkGetCompletes(cwd);

  const completionData: CompletionData = {
    version: "1.1.0",
    bunVersion,
    commands: {},
    globalFlags,
    specialHandling: {
      bareCommand: {
        description: "Run JavaScript/TypeScript files directly or access package scripts and binaries",
        canRunFiles: true,
        dynamicCompletions: {
          scripts: true,
          files: true,
          binaries: true,
        },
      },
    },
    bunGetCompletes,
  };

  // Parse each command — spawnSync is fast enough to run sequentially
  console.log(`📖 Fetching help for ${mainCommands.length} commands...`);
  for (const commandName of mainCommands) {
    const helpText = getHelpOutput([commandName], cwd);
    if (helpText.trim()) {
      const commandInfo = parseHelpOutput(helpText, commandName);
      completionData.commands[commandName] = commandInfo;
    } else {
      console.warn(`⚠️  No help output for "${commandName}" — skipping (command may be internal or undocumented).`);
    }
  }

  // Add fallback aliases (only for commands without a parsed "Alias:" line)
  addCommandAliases(completionData.commands);

  // Also check some common subcommands that might have their own help
  const additionalCommands = ["pm"];
  for (const commandName of additionalCommands) {
    if (!completionData.commands[commandName]) {
      console.log(`📖 Parsing help for additional command: ${commandName}`);

      const helpText = getHelpOutput([commandName], cwd);
      if (helpText.trim() && !helpText.includes("error:") && !helpText.includes("Error:")) {
        const commandInfo = parseHelpOutput(helpText, commandName);
        completionData.commands[commandName] = commandInfo;
      } else if (!helpText.trim()) {
        console.warn(`⚠️  No help output for additional command "${commandName}" — skipping.`);
      }
    }
  }

  // pm subcommands and their nested subcommands/flags are parsed inline
  // from the ├/└ tree format in `bun pm --help` — no recursive discovery needed.

  // Add documented flags that don't appear in --help output.
  // These are flags documented on bun.com/docs but not yet in the CLI --help.
  addDocumentedFlags(completionData.commands);

  // Write the JSON file (unless --dry-run)
  if (!cliArgs.dryRun) {
    const outputDir = join(cliArgs.outputPath, "..");
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    const jsonData = JSON.stringify(completionData, null, 2);
    writeFileSync(cliArgs.outputPath, jsonData, "utf8");
    console.log(`✅ Generated CLI completion data at: ${cliArgs.outputPath}`);
  } else {
    console.log(`⏭️  Dry-run — skipping file write`);
  }
  console.log(`📊 Statistics:`);
  console.log(`   - Commands: ${Object.keys(completionData.commands).length}`);
  console.log(`   - Global flags: ${completionData.globalFlags.length}`);
  if (bunVersion) {
    console.log(`   - Bun version: ${bunVersion}`);
  }

  let totalFlags = 0;
  let totalExamples = 0;
  let totalSubcommands = 0;
  for (const [name, cmd] of Object.entries(completionData.commands)) {
    totalFlags += cmd.flags.length;
    totalExamples += cmd.examples.length;
    const subcommandCount = cmd.subcommands ? Object.keys(cmd.subcommands).length : 0;
    totalSubcommands += subcommandCount;

    const aliasInfo = cmd.aliases ? ` (aliases: ${cmd.aliases.join(", ")})` : "";
    const subcommandInfo = subcommandCount > 0 ? `, ${subcommandCount} subcommands` : "";
    const dynamicInfo = cmd.dynamicCompletions ? ` [dynamic: ${Object.keys(cmd.dynamicCompletions).join(", ")}]` : "";

    console.log(
      `   - ${name}${aliasInfo}: ${cmd.flags.length} flags, ${cmd.positionalArgs.length} positional args, ${cmd.examples.length} examples${subcommandInfo}${dynamicInfo}`,
    );
  }

  console.log(`   - Total command flags: ${totalFlags}`);
  console.log(`   - Total examples: ${totalExamples}`);
  console.log(`   - Total subcommands: ${totalSubcommands}`);
  // tempDir auto-cleans here via Symbol.dispose
}

// Run the script
if (import.meta.main) {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  try {
    generateCompletions(cliArgs);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}
