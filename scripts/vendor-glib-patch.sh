#!/usr/bin/env bash
# Regenerate src-tauri/vendor/glib from gtk-rs-core 0.18 + RUSTSEC-2024-0429 fix.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/src-tauri/vendor/glib"
TMP="$(mktemp -d)"

cleanup() {
	rm -rf "$TMP"
}
trap cleanup EXIT

git clone --depth 1 --branch 0.18 https://github.com/gtk-rs/gtk-rs-core.git "$TMP/gtk-rs-core"

rm -rf "$DEST"
cp -R "$TMP/gtk-rs-core/glib" "$DEST"

VARIANT_ITER="$DEST/src/variant_iter.rs"
sed -i.bak 's/let p: \*mut libc::c_char/let mut p: *mut libc::c_char/' "$VARIANT_ITER"
sed -i.bak 's/&p,$/\&mut p,/' "$VARIANT_ITER"
rm -f "$VARIANT_ITER.bak"

# Use crates.io for workspace siblings (we only vendor the glib crate).
perl -i -pe '
  s|glib-macros = \{ path = "\.\./glib-macros", version = "0\.18" \}|glib-macros = { version = "0.18" }|;
  s|gio_ffi = \{ package = "gio-sys", path = "\.\./gio/sys", version = "0\.18", optional = true \}|gio_ffi = { package = "gio-sys", version = "0.18", optional = true }|;
' "$DEST/Cargo.toml"

# Keep in sync with [patch.crates-io] version in src-tauri/Cargo.toml.
perl -i -pe 's/^version = "0\.18\.[0-9]+"/version = "0.18.6"/' "$DEST/Cargo.toml"

echo "Patched glib vendored at $DEST"
