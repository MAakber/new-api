#!/usr/bin/env bash

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

if [[ "${GITHUB_REF_TYPE:-}" == "tag" && "${GITHUB_REF_NAME:-}" =~ ^v[0-9]{8}-[0-9a-f]{8}$ ]]; then
  printf '%s\n' "$GITHUB_REF_NAME"
  exit 0
fi

build_date="$(date -u +%Y%m%d)"
short_sha="$(git rev-parse --short=8 HEAD)"

printf 'v%s-%s\n' "$build_date" "$short_sha"
