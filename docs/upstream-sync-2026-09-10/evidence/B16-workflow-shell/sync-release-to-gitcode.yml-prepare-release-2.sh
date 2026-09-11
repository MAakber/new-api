set -euo pipefail

local_assets="$(
  find release-assets -maxdepth 1 -type f -printf '%s\t%f\n' \
    | sort -n -k1,1 \
    | cut -f2- \
    | jq -Rsc 'split("\n") | map(select(length > 0))'
)"

gitcode_release_json="$(mktemp)"
gitcode_release_status="$(
  curl -L -sS -o "$gitcode_release_json" -w "%{http_code}" \
    -H "PRIVATE-TOKEN: $GITCODE_TOKEN" \
    -H "Accept: application/json" \
    "https://api.gitcode.com/api/v5/repos/$GITCODE_REPOSITORY/releases/tags/$RELEASE_TAG"
)"
if [[ "$gitcode_release_status" != "200" ]]; then
  echo "::error::Failed to inspect GitCode release assets. Response code: $gitcode_release_status"
  cat "$gitcode_release_json"
  exit 1
fi

existing_assets="$(jq -c '[.assets[]?.name]' "$gitcode_release_json")"
missing_assets="$(
  jq -cn \
    --argjson local_assets "$local_assets" \
    --argjson existing_assets "$existing_assets" \
    '$local_assets - $existing_assets'
)"
jq -rn \
  --argjson local_assets "$local_assets" \
  --argjson missing_assets "$missing_assets" \
  '$local_assets - $missing_assets | .[] | "Skipping existing GitCode asset: \(.)"'

echo "matrix=$missing_assets" >> "$GITHUB_OUTPUT"
echo "has_assets=$(jq -r 'length > 0' <<< "$missing_assets")" >> "$GITHUB_OUTPUT"
