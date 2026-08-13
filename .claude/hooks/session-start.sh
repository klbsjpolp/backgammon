#!/bin/bash
# Installs the workspace's dependencies so a Claude Code on the web session can
# run pnpm test / lint / typecheck straight away. Local sessions already have a
# node_modules and manage it themselves, so this only runs on the remote.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# corepack ships with Node and reads packageManager from package.json, so the
# pnpm version here always matches the one the lockfile was written with.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

# install, not --frozen-lockfile: the container state is cached after this runs,
# and a lockfile drifting mid-branch should not fail the session before it starts.
pnpm install
