cd electron
ELECTRON_VERSION=${VERSION#v}
if [[ $ELECTRON_VERSION =~ ^([0-9]{4})([0-9]{2})([0-9]{2})-([0-9a-f]+)$ ]]; then
  YEAR=${BASH_REMATCH[1]}
  MONTH=${BASH_REMATCH[2]#0}
  DAY=${BASH_REMATCH[3]#0}
  SHA=${BASH_REMATCH[4]}
  ELECTRON_VERSION="$YEAR.$MONTH.$DAY-g$SHA"
fi
npm version "$ELECTRON_VERSION" --no-git-tag-version --allow-same-version
