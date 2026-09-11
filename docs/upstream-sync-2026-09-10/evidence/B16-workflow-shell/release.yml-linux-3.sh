cd web
bun install --frozen-lockfile
DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$VERSION bun run build
cd ..
