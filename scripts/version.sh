#!/usr/bin/env bash

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

if [[ -f "$root_dir/.git" ]]; then
  git_dir="$(sed -n 's/^gitdir: //p' "$root_dir/.git")"
  if [[ "$git_dir" =~ ^[A-Za-z]:[\\/].* ]]; then
    git_dir="${git_dir//\\//}"
    if [[ -n "${WSL_DISTRO_NAME:-}" || -n "${WSL_INTEROP:-}" ]]; then
      drive="${git_dir:0:1}"
      git_dir="${git_dir:2}"
      git_dir="/mnt/${drive,,}/${git_dir#/}"
    fi
  fi
  export GIT_DIR="$git_dir"
  export GIT_WORK_TREE="$root_dir"
fi

if [[ "${GITHUB_REF:-}" == refs/tags/* ]]; then
  printf '%s\n' "${GITHUB_REF#refs/tags/}"
  exit 0
fi

if [[ "${GITHUB_REF_TYPE:-}" == "tag" && -n "${GITHUB_REF_NAME:-}" ]]; then
  printf '%s\n' "$GITHUB_REF_NAME"
  exit 0
fi

build_date="$(date -u +%Y%m%d)"
short_sha="$(git rev-parse --short=8 HEAD)"

printf 'v%s-%s\n' "$build_date" "$short_sha"
