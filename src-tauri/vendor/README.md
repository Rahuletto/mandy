# Vendored Rust patches

## `glib` (0.18.6)

Backport of [gtk-rs/gtk-rs-core#1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343) for [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) / [GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g).

Tauri 2.x pulls `gtk` 0.18 → `glib` 0.18.x from crates.io; upstream only fixed this in `glib` 0.20+. The patch is a two-line change in `glib/src/variant_iter.rs` (`&p` → `&mut p`).

Regenerate from gtk-rs-core `0.18` with:

```bash
./scripts/vendor-glib-patch.sh
```

Wired via `[patch.crates-io]` in `src-tauri/Cargo.toml`.
