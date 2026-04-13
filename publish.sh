#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLISH_SCRIPT="${REPO_DIR}/scripts/publish_npm.sh"

echo "=> Checking working tree status..."
if [[ -n "$(git -C "${REPO_DIR}" status --porcelain=v1 --untracked-files=normal)" ]]; then
  echo "Error: Working tree is not clean. Please commit your changes before publishing."
  exit 1
fi

if [[ ! -f "${PUBLISH_SCRIPT}" ]]; then
  echo "Error: Missing publish helper: ${PUBLISH_SCRIPT}"
  exit 1
fi

if [[ "${1:-}" == "--publish" ]]; then
  echo "=> Publishing @dhf-hermes/grix to NPM (Public)..."
  echo "=> Using the npm credentials already configured on this machine."
  exec bash "${PUBLISH_SCRIPT}" "$@"
fi

echo "=> Running preview for @dhf-hermes/grix..."
echo "=> This only verifies tests, pack output, and final tarball identity."
exec bash "${PUBLISH_SCRIPT}" "$@"
