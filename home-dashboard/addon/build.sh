#!/bin/sh
# Assemble a self-contained local add-on folder: dist-addon/home_dashboard
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
out="$root/dist-addon/home_dashboard"
rm -rf "$out"
mkdir -p "$out"
for f in config.yaml Dockerfile run.sh DOCS.md; do cp "$here/$f" "$out/$f"; done
cp "$root/package.json" "$root/package-lock.json" "$root/tsconfig.json" "$out/"
cp -r "$root/src" "$out/src"
echo "built $out"
