#!/usr/bin/env bun
// Report Bun version information for the project.
// https://bun.com/docs/runtime/bun

export {};

const pkg = await Bun.file("package.json").json();

console.log(`Bradley-Terry v${pkg.version}`);
console.log(`Bun runtime:    ${Bun.version}`);
console.log(`Bun revision:   ${Bun.revision}`);
console.log(`Required Bun:   ${pkg.engines?.bun ?? "unknown"}`);
console.log(`Package manager: ${pkg.packageManager ?? "unknown"}`);

// Compare running Bun against required
if (pkg.engines?.bun) {
	const min = pkg.engines.bun.replace(/^>=/, "");
	if (Bun.semver.order(Bun.version, min) < 0) {
		console.warn(`⚠️  Running Bun ${Bun.version} < required ${pkg.engines.bun}`);
		console.warn(`   Tests pass, but regeneration and build require Bun >= ${min}`);
	} else {
		console.log(`✅ Running Bun meets project requirement ${pkg.engines.bun}`);
	}
}

// Artifact info
try {
	const dyn = await Bun.file("completions/DYNAMIC_SOURCES.json").json();
	console.log(`Artifact Bun:   ${dyn.bunVersion ?? "unknown"}`);
	console.log(`Artifact hash:  ${dyn.jsonHash ?? "unknown"}`);
	console.log(`Schema version: ${dyn.schema ?? "unknown"}`);
} catch {
	console.warn("⚠️  No completion artifacts found — run bun run completions");
}
