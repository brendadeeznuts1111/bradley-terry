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

import { spawn } from "bun";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";

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
    valueType = valueSpec.replace(/[<>]/g, "");
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

let temppackagejson: string;

/**
 * Create a temporary directory with a dummy package.json so that
 * `bun run --help` doesn't pick up scripts from the real repo.
 */
function setupTempEnv(): string {
  temppackagejson = mkdtempSync("package");
  writeFileSync(
    join(temppackagejson, "package.json"),
    JSON.stringify({
      name: "test",
      version: "1.0.0",
      scripts: {},
    }),
  );
  return temppackagejson;
}

/**
 * Remove the temporary directory, ignoring errors if it's already gone.
 */
function cleanupTempEnv(): void {
  if (temppackagejson) {
    try {
      rmSync(temppackagejson, { recursive: true, force: true });
    } catch {
      // already gone — fine
    }
  }
}

/**
 * Execute bun command and get help output.
 * Retries once on empty output and logs a warning if still empty.
 */
async function getHelpOutput(command: string[]): Promise<string> {
  const label = command.length === 0 ? "bun" : `bun ${command.join(" ")}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const proc = spawn({
        cmd: [BUN_EXECUTABLE, ...command, "--help"],
        stdout: "pipe",
        stderr: "pipe",
        cwd: temppackagejson,
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      await proc.exited;

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
      // Bun spawn throws on ENOENT — log a concise warning without the full stack
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
 * Probes --help and each of the known subcommands (s, b, j, a).
 * Returns the bunGetCompletes section for CompletionData, with
 * available=false and no commands map if the feature is absent.
 */
async function checkGetCompletes(): Promise<CompletionData["bunGetCompletes"]> {
  const subcommands: Record<string, string> = {
    scripts: "bun getcompletes s",
    binaries: "bun getcompletes b",
    packages: "bun getcompletes a",
    files: "bun getcompletes j",
  };

  // First probe: does `bun getcompletes --help` exist at all?
  try {
    const proc = spawn({
      cmd: [BUN_EXECUTABLE, "getcompletes", "--help"],
      stdout: "pipe",
      stderr: "pipe",
      cwd: temppackagejson,
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;

    const output = (stdout || stderr || "").trim();
    if (!output) {
      console.warn("⚠️  `bun getcompletes` returned no output — marking as unavailable.");
      return { available: false };
    }

    // Some Bun versions print "Usage: bun getcompletes" or "error:" if unknown
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
  for (const [key, label] of Object.entries(subcommands)) {
    try {
      const proc = spawn({
        cmd: [BUN_EXECUTABLE, "getcompletes", key === "packages" ? "a" : key[0]],
        stdout: "pipe",
        stderr: "pipe",
        cwd: temppackagejson,
      });
      await proc.exited;
      working.push(key);
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
 * Recursively discovers nested subcommands by running their --help too.
 */
function parsePmSubcommands(helpText: string): Record<string, SubcommandInfo> {
  const lines = helpText.split("\n");
  const subcommands: Record<string, SubcommandInfo> = {};

  let inCommands = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "Commands:") {
      inCommands = true;
      continue;
    }

    if (inCommands && trimmed.startsWith("Learn more")) {
      break;
    }

    if (inCommands && line.match(/^\s+bun pm \w+/)) {
      // Parse lines like: "bun pm pack                 create a tarball of the current workspace"
      const match = line.match(/^\s+bun pm (\S+)(?:\s+(.+))?$/);
      if (match) {
        const [, name, description = ""] = match;
        subcommands[name] = {
          name,
          description: description.trim(),
          flags: [],
          positionalArgs: [],
        };
      }
    }
  }

  return subcommands;
}

/**
 * Recursively discover nested subcommands by running --help on each.
 * E.g., `bun pm pkg --help` reveals get/set/delete/fix.
 */
async function discoverNestedSubcommands(
  parentPath: string[],
  subcommands: Record<string, SubcommandInfo>
): Promise<void> {
  for (const [name, sub] of Object.entries(subcommands)) {
    // Heuristic: short-named subcommands like "pkg", "cache" often have
    // their own subcommands. Probe each one.
    const helpText = await getHelpOutput([...parentPath, name]);
    if (helpText.trim()) {
      const nested = parsePmSubcommands(helpText);
      if (Object.keys(nested).length > 0) {
        sub.subcommands = nested;
        // Recurse one more level
        await discoverNestedSubcommands([...parentPath, name], nested);
      }
    }
  }
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
      command.usage = trimmed;
      command.positionalArgs = parseUsage(trimmed);
      continue;
    }

    // Track sections
    if (trimmed === "Flags:") {
      inFlags = true;
      currentSection = "flags";
      continue;
    } else if (trimmed === "Examples:") {
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
async function getMainCommands(): Promise<string[]> {
  const helpText = await getHelpOutput([]);
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
 * Get the Bun version string for embedding in the JSON output.
 */
async function getBunVersion(): Promise<string | undefined> {
  try {
    const proc = spawn({
      cmd: [BUN_EXECUTABLE, "--version"],
      stdout: "pipe",
      stderr: "pipe",
      cwd: temppackagejson,
    });
    const [stdout] = await Promise.all([new Response(proc.stdout).text()]);
    await proc.exited;
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Main function to generate completion data
 */
async function generateCompletions(): Promise<void> {
  setupTempEnv();

  // Ensure cleanup on SIGINT/SIGTERM as well as normal exit
  const cleanup = () => {
    cleanupTempEnv();
    process.exit(130);
  };
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  try {
    console.log("🔍 Discovering Bun commands...");

    // Get Bun version for the JSON output
    const bunVersion = await getBunVersion();
    if (bunVersion) {
      console.log(`📌 Bun version: ${bunVersion}`);
    }

    // Get main help and extract commands
    const mainHelpText = await getHelpOutput([]);
    const mainCommands = await getMainCommands();
    const globalFlags = parseGlobalFlags(mainHelpText);

    console.log(`📋 Found ${mainCommands.length} main commands: ${mainCommands.join(", ")}`);

    // Probe getcompletes in parallel with version
    const [bunGetCompletes] = await Promise.all([
      checkGetCompletes(),
    ]);

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

    // Parse each command — fetch all help texts in parallel
    console.log(`📖 Fetching help for ${mainCommands.length} commands in parallel...`);
    const helpResults = await Promise.all(
      mainCommands.map(async (name) => ({
        name,
        helpText: await getHelpOutput([name]),
      }))
    );

    for (const { name, helpText } of helpResults) {
      if (helpText.trim()) {
        const commandInfo = parseHelpOutput(helpText, name);
        completionData.commands[name] = commandInfo;
      } else {
        console.warn(`⚠️  No help output for "${name}" — skipping (command may be internal or undocumented).`);
      }
    }

    // Add fallback aliases (only for commands without a parsed "Alias:" line)
    addCommandAliases(completionData.commands);

    // Also check some common subcommands that might have their own help
    const additionalCommands = ["pm"];
    for (const commandName of additionalCommands) {
      if (!completionData.commands[commandName]) {
        console.log(`📖 Parsing help for additional command: ${commandName}`);

        try {
          const helpText = await getHelpOutput([commandName]);
          if (helpText.trim() && !helpText.includes("error:") && !helpText.includes("Error:")) {
            const commandInfo = parseHelpOutput(helpText, commandName);
            completionData.commands[commandName] = commandInfo;
          } else if (!helpText.trim()) {
            console.warn(`⚠️  No help output for additional command "${commandName}" — skipping.`);
          }
        } catch (error) {
          console.error(`❌ Failed to parse ${commandName}:`, error);
        }
      }
    }

    // Recursively discover nested pm subcommands
    if (completionData.commands["pm"]?.subcommands) {
      console.log(`📖 Discovering nested pm subcommands...`);
      await discoverNestedSubcommands(["pm"], completionData.commands["pm"].subcommands);
    }

    // Ensure completions directory exists
    const completionsDir = join(process.cwd(), "completions");
    try {
      mkdirSync(completionsDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Write the JSON file
    const outputPath = join(completionsDir, "bun-cli.json");
    const jsonData = JSON.stringify(completionData, null, 2);

    writeFileSync(outputPath, jsonData, "utf8");

    console.log(`✅ Generated CLI completion data at: ${outputPath}`);
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
  } finally {
    cleanupTempEnv();
    process.removeListener("SIGINT", cleanup);
    process.removeListener("SIGTERM", cleanup);
  }
}

// Run the script
if (import.meta.main) {
  generateCompletions().catch((error) => {
    console.error("Fatal error:", error);
    cleanupTempEnv();
    process.exit(1);
  });
}
