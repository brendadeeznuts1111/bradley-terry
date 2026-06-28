#!/usr/bin/env bun
/**
 * Generate completions/bunfig-settings.json from canonical bunfig.toml docs.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildBunfigCompletionData } from "./bunfig-settings.js";

const outputPath = join(process.cwd(), "completions/bunfig-settings.json");
const data = buildBunfigCompletionData();

mkdirSync(join(outputPath, ".."), { recursive: true });
await Bun.write(outputPath, `${JSON.stringify(data, null, 2)}\n`);

console.log(`✅ Generated bunfig settings at ${outputPath} (${data.settings.length} entries)`);
