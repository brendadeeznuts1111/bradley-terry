#!/usr/bin/env bash
# Pre-commit gate: enforce strict type-checking and test suite.
# Fails if any non-TS2339 type errors exist or any test fails.
set -euo pipefail

echo "🔒 Gate: type-check (strict flags)..."
bun run check:types

echo "🧪 Gate: test suite..."
bun test

echo "✅ All gates passed."
