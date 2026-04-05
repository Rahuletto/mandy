# Mandy — agent / developer guide

## Commands

- **Dev:** `bun run dev` (Vite + Tauri as configured in `package.json`).
- **Production build:** `bun run build`.
- **Typecheck:** `bunx tsc --noEmit` (may report issues outside files you touch; fix anything your change introduces).

## Adding a new request type

1. **`src/types/project.ts`**
   - Extend `RequestType` with the new literal.
   - Add a file interface (e.g. `MyProtocolFile`) and wire it into `RequestItemMap` and `RequestItem`.

2. **`src/registry/index.ts` (`itemTypeRegistry`)**
   - Add a config entry: label, icon, defaults, cloning, `getRecentMeta`, `isCreatable`, etc.
   - This drives Sidebar / FileTree / Welcome “New …” menus via `creatableItemTypes`.

3. **Editor UI**
   - Implement `src/components/editors/MyProtocolEditor.tsx` (and optional `MyProtocolOverview.tsx` using `OverviewLayout`).
   - **REST** is special: `RestRequestEditor` uses an imperative `ref.send()` so global shortcuts and project overview can trigger send.
   - **WebSocket / GraphQL / Socket.IO / MQTT:** register the editor in `src/registry/editorViews.tsx` — add the type to `ProtocolRequestItem`, extend `renderProtocolEditor`’s `switch`, and update `isProtocolRequestItem`. Optionally export a component from `editorByProtocolType` for discoverability.

4. **App shell**
   - If the type is protocol-sized (like MQTT), `App.tsx` already routes through `renderProtocolEditor` when `isProtocolRequestItem(activeItem)`.
   - Workflow and REST stay as explicit branches next to that.

5. **Store**
   - Ensure `findItem`, `addItem`, `updateItem`, `deleteItem`, and any import/migration paths handle the new `type`. `addItem(type, folderId)` dispatches through the registry.

## Store conventions

- **Active item:** `activeItemId: string | null` — use `setActiveItem(id | null)`; it updates recents when opening a real item.
- **Mutations:** `addItem<T extends RequestType>(type, parentFolderId, name?)` and `updateItem<T>(id, type, updater)` are the main APIs; avoid duplicating per-type setters.
- **Persistence:** Zustand persist name `mandy-projects`, `version: 2`, `migrate` maps legacy per-protocol `active*Id` fields into `activeItemId`. Bump `version` and extend `migrate` if you change persisted shape.

## UI patterns

- **Overview pages:** Prefer `src/components/editors/OverviewLayout.tsx` for shared title, description, snippet panel, and primary action. Use `leftFooter` (or similar slots) for type-specific blocks (e.g. REST object definitions).
- **Welcome / tree:** Build “new item” entries from `creatableItemTypes` in `src/registry/index.ts` rather than hardcoding lists in Sidebar / Welcome.

## Layout of registries

- **`src/registry/index.ts`** — data/config only (no heavy UI imports); safe from circular deps with editors.
- **`src/registry/editorViews.tsx`** — React editors for protocol items; imports editor components but not the main store index.
