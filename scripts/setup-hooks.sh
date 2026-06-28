#!/usr/bin/env bash
# Install git hooks for the repository.
# Run once after clone: bash scripts/setup-hooks.sh
set -euo pipefail

cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "✅ Pre-commit hook installed (type-check + test suite)"
