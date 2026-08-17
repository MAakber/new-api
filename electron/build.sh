#!/bin/bash

set -e

echo "Building New API Electron App..."

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(bash "$ROOT_DIR/scripts/version.sh")"

echo "Step 1: Building frontend..."
cd "$ROOT_DIR/web"
bun install --frozen-lockfile
DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION="$VERSION" bun run build
cd "$ROOT_DIR/electron"

echo "Step 2: Building Go backend..."
ELECTRON_VERSION="${VERSION#v}"
if [[ $ELECTRON_VERSION =~ ^([0-9]{4})([0-9]{2})([0-9]{2})-([0-9a-f]+)$ ]]; then
    YEAR=${BASH_REMATCH[1]}
    MONTH=${BASH_REMATCH[2]#0}
    DAY=${BASH_REMATCH[3]#0}
    SHA=${BASH_REMATCH[4]}
    ELECTRON_VERSION="$YEAR.$MONTH.$DAY-g$SHA"
fi

npm --prefix "$ROOT_DIR/electron" version "$ELECTRON_VERSION" --no-git-tag-version --allow-same-version

cd "$ROOT_DIR"

if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Building for macOS..."
    CGO_ENABLED=1 go build -ldflags="-s -w -X github.com/QuantumNous/new-api/common.Version=$VERSION" -o new-api
    cd electron
    npm install
    npm run build:mac
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Building for Linux..."
    CGO_ENABLED=1 go build -ldflags="-s -w -X github.com/QuantumNous/new-api/common.Version=$VERSION" -o new-api
    cd electron
    npm install
    npm run build:linux
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    echo "Building for Windows..."
    CGO_ENABLED=1 go build -ldflags="-s -w -X github.com/QuantumNous/new-api/common.Version=$VERSION" -o new-api.exe
    cd electron
    npm install
    npm run build:win
else
    echo "Unknown OS, building for current platform..."
    CGO_ENABLED=1 go build -ldflags="-s -w -X github.com/QuantumNous/new-api/common.Version=$VERSION" -o new-api
    cd electron
    npm install
    npm run build
fi

echo "Build complete! Check electron/dist/ for output."
