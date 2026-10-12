#!/bin/sh
# Rebuild and copy dist/ into the sites that inject this package (pnpm `injected`: a copy, not a
# link, so each site resolves its own React and AI SDK). Usage: scripts/sync.sh [site dirs...]
set -e
cd "$(dirname "$0")/.."
pnpm build >/dev/null
for site in "${@:-../perxel-web-2026 ../../phucbm/folio-2026-vol2 examples/next}"; do
  for dir in $site; do
    target="$dir/node_modules/@perxel/spotlight"
    [ -e "$target" ] || continue
    real=$(cd "$target" && pwd -P)
    rsync -a --delete dist/ "$real/dist/"
    rsync -a package.json "$real/package.json"
    echo "synced $dir"
  done
done
