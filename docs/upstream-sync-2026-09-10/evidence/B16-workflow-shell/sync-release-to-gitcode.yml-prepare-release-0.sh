set -euo pipefail

release_json="$(
  gh release view "$RELEASE_TAG" \
    --repo "$GITHUB_REPOSITORY" \
    --json body,isPrerelease
)"
release_body="$(jq -r '.body // ""' <<< "$release_json" | sed "s/'/’/g")"
release_prerelease="$(jq -r '.isPrerelease' <<< "$release_json")"
if [[ "$release_prerelease" == "true" ]]; then
  release_status=pre
else
  release_status=latest
fi

gitcode_release_json="$(mktemp)"
gitcode_release_status="$(
  curl -L -sS -o "$gitcode_release_json" -w "%{http_code}" \
    -H "PRIVATE-TOKEN: $GITCODE_TOKEN" \
    -H "Accept: application/json" \
    "https://api.gitcode.com/api/v5/repos/$GITCODE_REPOSITORY/releases/tags/$RELEASE_TAG"
)"

request_json="$(mktemp)"
case "$gitcode_release_status" in
  200)
    request_method=PATCH
    request_url="https://api.gitcode.com/api/v5/repos/$GITCODE_REPOSITORY/releases/$RELEASE_TAG"
    request_action=update
    success_action=updated
    jq -n \
      --arg tag_name "$RELEASE_TAG" \
      --arg name "$RELEASE_TAG" \
      --arg body "$release_body" \
      --arg release_status "$release_status" \
      '{
        tag_name: $tag_name,
        name: $name,
        body: $body,
        release_status: $release_status
      }' > "$request_json"
    ;;
  404)
    if ! git ls-remote --exit-code --tags \
      "https://gitcode.com/$GITCODE_REPOSITORY.git" \
      "refs/tags/$RELEASE_TAG" > /dev/null; then
      echo "::error::Tag $RELEASE_TAG has not been mirrored to GitCode yet. Retry this workflow after the tag appears on GitCode."
      exit 1
    fi

    request_method=POST
    request_url="https://api.gitcode.com/api/v5/repos/$GITCODE_REPOSITORY/releases"
    request_action=create
    success_action=created
    jq -n \
      --arg tag_name "$RELEASE_TAG" \
      --arg name "$RELEASE_TAG" \
      --arg body "$release_body" \
      --arg release_status "$release_status" \
      '{
        tag_name: $tag_name,
        name: $name,
        body: $body,
        release_status: $release_status
      }' > "$request_json"
    ;;
  *)
    echo "::error::Failed to inspect GitCode release. Response code: $gitcode_release_status"
    cat "$gitcode_release_json"
    exit 1
    ;;
esac

gitcode_response_json="$(mktemp)"
request_status="$(
  curl -L -sS -o "$gitcode_response_json" -w "%{http_code}" \
    -X "$request_method" \
    -H "PRIVATE-TOKEN: $GITCODE_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    --data-binary "@$request_json" \
    "$request_url"
)"
if [[ "$request_status" != "200" ]]; then
  echo "::error::Failed to $request_action GitCode release. Response code: $request_status"
  cat "$gitcode_response_json"
  exit 1
fi
echo "GitCode release $success_action successfully"

delimiter="release-body-$(openssl rand -hex 16)"
{
  echo "tag=$RELEASE_TAG"
  echo "body<<$delimiter"
  echo "$release_body"
  echo "$delimiter"
  echo "prerelease=$release_prerelease"
} >> "$GITHUB_OUTPUT"
