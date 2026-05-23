#!/usr/bin/env bash
# Validates the vendored glib security patch before push (no full Linux GTK build required).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="$ROOT/src-tauri/Cargo.lock"
VENDOR_CARGO="$ROOT/src-tauri/vendor/glib/Cargo.toml"
VARIANT_ITER="$ROOT/src-tauri/vendor/glib/src/variant_iter.rs"

fail() {
	echo "verify-glib-patch: $*" >&2
	exit 1
}

[[ -f "$LOCK" ]] || fail "missing Cargo.lock"
[[ -f "$VENDOR_CARGO" ]] || fail "missing vendor/glib (run scripts/vendor-glib-patch.sh)"

# RUSTSEC-2024-0429 fix must be present.
rg -q 'let mut p: \*mut libc::c_char' "$VARIANT_ITER" || fail "variant_iter.rs missing mut p fix"
rg -q '&mut p,' "$VARIANT_ITER" || fail "variant_iter.rs missing &mut p fix"
rg -q '&p,' "$VARIANT_ITER" && fail "variant_iter.rs still has unsound &p"

# Must not vendor duplicate -sys crates (breaks gio on Linux).
rg -q 'path = "sys"' "$VENDOR_CARGO" && fail "vendor/glib still path-pins glib-sys"
rg -q 'path = "gobject-sys"' "$VENDOR_CARGO" && fail "vendor/glib still path-pins gobject-sys"
[[ ! -d "$ROOT/src-tauri/vendor/glib/sys" ]] || fail "remove vendor/glib/sys"
[[ ! -d "$ROOT/src-tauri/vendor/glib/gobject-sys" ]] || fail "remove vendor/glib/gobject-sys"

# Cargo.lock must unify on a single glib-sys package entry.
count=$(rg -c '^name = "glib-sys"$' "$LOCK" || true)
[[ "$count" == "1" ]] || fail "expected 1 glib-sys in Cargo.lock, found $count"

# Patched glib must depend on unified registry glib-sys (no "glib-sys 0.18.x" version pin).
glib_deps=$(awk '/^\[\[package\]\]/{p=0} /^name = "glib"$/{p=1} p && /^ \"/{print}' "$LOCK" | head -20)
echo "$glib_deps" | rg -q '"glib-sys"' || fail "glib package missing glib-sys dep"
echo "$glib_deps" | rg -q '"glib-sys 0\.' && \
	fail "glib must not pin a second glib-sys version (breaks gio)"

echo "verify-glib-patch: OK"
