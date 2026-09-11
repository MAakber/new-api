set -euo pipefail

mkdir release-assets
gh release download "$RELEASE_TAG" \
  --repo "$GITHUB_REPOSITORY" \
  --dir release-assets

if ! find release-assets -maxdepth 1 -type f -print -quit | grep -q .; then
  echo "::error::GitHub release has no downloadable assets"
  exit 1
fi

while IFS= read -r -d '' file; do
  directory="$(dirname "$file")"
  filename="$(basename "$file")"
  safe_filename="$(sed 's/[^A-Za-z0-9._+-]/-/g' <<< "$filename")"
  if [[ "$filename" != "$safe_filename" ]]; then
    if [[ -e "$directory/$safe_filename" ]]; then
      echo "::error::Asset filename collision after normalization: $safe_filename"
      exit 1
    fi
    mv -- "$file" "$directory/$safe_filename"
  fi
done < <(find release-assets -maxdepth 1 -type f -print0)

find release-assets -maxdepth 1 -type f -print | sort
