# Mandy — agent & developer guide

This document is the **canonical map** of the frontend architecture. Follow it when adding features, new request/file types, or debugging routing and registries.

---

## Commands

| Task | Command |
|------|---------|
| Dev (Vite + Tauri as in `package.json`) | `bun run dev` |
| Production build | `bun run build` |
| Typecheck | `bunx tsc --noEmit` |

Fix any TypeScript issues your change introduces, even if the repo has pre-existing warnings elsewhere.

## Rust ↔ frontend (Tauri + tauri-specta)

- **Source of truth for commands:** `src-tauri/src/lib.rs` — `collect_commands![...]` registers every `#[tauri::command]` handler. Names are snake_case in Rust (`rest_request`, `mqtt_connect`, …).
- **Generated client:** `src/bindings.ts` is **auto-generated** in **debug** builds (`builder.export(..., "../src/bindings.ts")` in `lib.rs`). The `commands` object wraps `invoke` with camelCase methods (`restRequest`, `mqttConnect`, …) and shared types (`ApiRequest`, `MqttConnectRequest`, events, etc.).
- **Adding a command:** Implement `#[tauri::command] fn your_command(...)` under `src-tauri/src/helpers/`, register it in `lib.rs`’s `collect_commands!`, add/extend types in `src-tauri/src/types` as needed, run a **debug** Tauri build so `bindings.ts` regenerates, then call `commands.yourCommand(...)` from the React layer.
- **Consistency check:** Every `commands.*` used in `src/` should have a matching entry in `collect_commands!`; the inverse should also hold for public API commands (no orphan Rust handlers without TS stubs after export).

---

## High-level architecture

- **Shell:** `src/App.tsx` owns layout: collapsible sidebar, main editor area, modals, migration gate, toasts.
- **State:** `src/stores/projectStore.ts` (Zustand + persist) holds projects, tree, selection, environments, clipboard, etc.
- **Routing (in-app):** There is no Next.js router for the editor. The **main panel** picks one view from: project overview, workflow editor, protocol editors (WebSocket / GraphQL / Socket.IO / MQTT), REST editor, or welcome/empty state—based on `showProjectOverview`, `activeItemId`, and `activeItem.type`.
- **Backend integration:** Tauri `commands` in `src/bindings.ts` (and generated types) for HTTP, WS, GraphQL, Socket.IO, MQTT, etc.


---

## Data model: projects and tree items

**File:** `src/types/project.ts`

- **`RequestType`** — string union of all non-folder item kinds: `"request" | "websocket" | "graphql" | "socketio" | "mqtt" | "workflow"`.
- **`RequestItem`** — discriminated union: each `type` has a matching interface (`RequestFile`, `WebSocketFile`, …).
- **`RequestItemMap` / `ItemOfType<T>`** — use these for generic helpers keyed by `RequestType`.
- **`TreeItem`** — `Folder | RequestItem`.
- **`Project`** — metadata, `root: Folder`, `environments`, `recentRequests`, optional `schemaVersion`.

Adding a new kind always starts by extending these types so TypeScript forces you to update switches and registries.

---

## Registry system

The registry is split so **data/config stays free of heavy UI cycles** and **editors stay in one place**.

### Barrel: `src/registry/index.ts`

```ts
export * from "./registryCore";
export { RequestTypeIcon, RequestTypeListBadge } from "./requestTypeIcon";
```

Import from `"../registry"` or `"./registry"` for types, `getItemConfig`, `creatableItemTypes`, and icons. **`defineItemType`** lives in `itemTypes.ts` and is only used inside `registryCore.ts` (not re-exported from the barrel).

### Core data: `src/registry/registryCore.ts`

- **`itemTypeRegistry`** — map `RequestType → ItemTypeConfig`.
- **`getItemConfig(type)`** — typed accessor.
- **`allItemTypes`** — all entries; used where non-creatable types matter (e.g. workflow in recents).
- **`creatableItemTypes`** — `isCreatable === true`, sorted by `menuOrder`; drives **Sidebar** “new request” menu, **Welcome** dropdown, and **FileTree** folder context menu (plus separate “New Workflow” / “New Folder” entries).

Each type is defined with **`defineItemType({ ... })`** (see `itemTypes.ts`).

### `ItemTypeConfig` (`src/registry/itemTypes.ts`)

| Field | Purpose |
|-------|---------|
| `type`, `label`, `shortLabel` | Identity; `shortLabel` is used in UI badges and **must not collide** with real HTTP methods for recents unless you set `matchRecentsByShortLabel` (see below). |
| `icon`, `iconClassName` | React icon component and Tailwind color classes — **single source** for that type’s icon everywhere. |
| `treeIconSize` | Default pixel size in tree / list badge when not overridden. |
| `overviewStripeClass`, `overviewSidebarCellClass` | Optional: project overview **card** chrome (workflow / WebSocket columns). |
| `listBadgeClass` | Optional: pill wrapper for compact rows (GraphQL / Socket.IO / MQTT in `ProjectOverview`). |
| `matchRecentsByShortLabel` | Default `true`. Set **`false` on `request`**: recents store real HTTP verbs (`GET`, `POST`, …); REST’s `shortLabel` is only a menu default (`GET`) and must not steal recents resolution. |
| `createDefault({ id, name? })` | Factory for **new** items; used by `addItem` in the store. |
| `clone(item, { id })` | Deep clone for duplicate; used by `duplicateItem`. |
| `getRecentMeta(item)` | `{ methodLabel, url }` for persisted **recentRequests** rows. |
| `isCreatable` | If `false`, type is omitted from creatable menus (e.g. workflow). |
| `menuOrder` | Sort order in “new” menus. |

### Icons in UI: `src/registry/requestTypeIcon.tsx`

- **`RequestTypeIcon`** — Renders `getItemConfig(type).icon` with `iconClassName` and optional `size` / `className`. **`variant="treeColumn"`** applies the fixed-width file-tree column layout.
- **`RequestTypeListBadge`** — Icon inside `listBadgeClass` pill (overview list rows).

**Rule:** Do not import per-type icons in feature components for types that already exist in the registry—use `RequestTypeIcon` so changing MQTT (or any type) is one edit in `registryCore.ts`.

### Protocol editors: `src/registry/editorViews.tsx`

- **`ProtocolRequestItem`** — union of `WebSocketFile | GraphQLFile | SocketIOFile | MQTTFile`.
- **`renderProtocolEditor(item, ctx)`** — **single switch** that mounts the correct editor with shared props (`updateItem`, `resolveVariables`, loading hooks, etc.). Add a new `case` here when introducing a protocol editor.
- **`isProtocolRequestItem(item)`** — type guard used in `App.tsx`.

REST and workflow are **not** here; they are special-cased in `App.tsx`.

---

## Main panel routing (`App.tsx`)

Evaluated **top to bottom** (simplified):

1. **`showProjectOverview && activeProject`** → `ProjectOverview` (`initialTab` from `projectOverviewTab` state: `"overview" | "configuration" | "variables"`).
2. **`activeWorkflow && !showProjectOverview`** → `WorkflowEditor`.
3. **`isProtocolRequestItem(activeItem) && !showProjectOverview`** → `renderProtocolEditor(...)`.
4. **`!showProjectOverview && activeItem` is none of `request`, `workflow`, `websocket`, `graphql`, `socketio`, `mqtt`** → `WelcomePage` (empty / odd state).
5. **`activeRequest`** → `RestRequestEditor` (with `ref` for imperative `send()`).
6. Else → `WelcomePage`.

**Implication for new types:** If you add e.g. `"grpc"` with a full editor, you must:

- Extend the protocol union and `renderProtocolEditor` **or** add another explicit branch like workflow/REST.
- Update the **long `activeItem?.type !== ...` chain** before `WelcomePage`, or that type will incorrectly show the welcome screen when selected.

`activeItem` is resolved by walking the tree from `activeItemId` (can be a folder in edge cases; then you fall through to welcome).

---

## Project overview (`ProjectOverview.tsx`)

**Tabs** (internal state synced from `initialTab` prop):

| Tab id | Label | Role |
|--------|-------|------|
| `overview` | Overview | Folder tree of the project: REST cards (`RequestDetails`), workflow/WebSocket cards, GraphQL/Socket.IO/MQTT rows with `RequestTypeListBadge`, nested folders via `FolderSection`. |
| `configuration` | Config | Project name (header), description, base URL, default authorization (`AuthEditor`), snippet language selector, export entry points. |
| `variables` | Variables | Environments and variables CRUD. |

**Header:** Icon picker, project title, sticky snippet language dropdown, Export button.

**Opening a specific tab from elsewhere:** Editors call `onOpenProjectSettings` → `App` sets `projectOverviewTab` to `"configuration"` and `showProjectOverview` true.

**Registry usage:** Workflow/WebSocket cards use `getItemConfig(...).overviewStripeClass` / `overviewSidebarCellClass` and `RequestTypeIcon` so stripes/sidebars stay aligned with the type registry.

---

## Per-request editor UI patterns

### REST — `RestRequestEditor.tsx`

- **Top bar:** Method selector + URL + Send (uses `RestRequestEditorHandle.send()` for shortcuts / overview “Run”).
- **Sub-tabs:** `overview`, `params`, `authorization`, `body` (hidden for GET), `headers`, `cookies`. Implemented as a **local button row**, not `TabView`.
- **Overview tab content:** Often composed with `RequestOverview` / rich layout; uses project env and auth.

### Protocol editors (WebSocket, GraphQL, Socket.IO, MQTT)

- **Top bar:** Type icon via `RequestTypeIcon`, URL/input, connect/send/disconnect pattern varies by protocol.
- **Internal structure:** Each editor defines its own **tab state** (e.g. overview / messages / connection) with local buttons or shared UI primitives.
- **GraphQL:** `onSendQuery` and `loadingItems` wired from `App` / store patterns.

### Workflow — `WorkflowEditor` (under `components/workflow/`)

- React Flow–based; `onExecuteRequest` implemented in `App` to run REST nodes with variable resolution.

### “Overview” pages inside an editor (not project overview)

Files like `WebSocketOverview.tsx`, `MQTTOverview.tsx`, etc. should use **`OverviewLayout`** (`components/editors/OverviewLayout.tsx`) for consistency:

- Left: editable name, description, optional **`leftFooter`** (params, tables).
- Right: sticky snippet panel with **`panelBadge`**, language dropdown, **`action`** (Connect, etc.), optional **`snippetPanelBody`** instead of raw code.

---

## Store conventions (`projectStore.ts`)

- **`activeItemId`** — Which tree item is “open” in the main editor. **`setActiveItem(id)`** also pushes to **recents** (non-folder items).
- **`selectedItemId`** — Tree focus (can differ conceptually from active item in some flows).
- **`addItem(type, parentFolderId, name?)`** — Uses **`getItemConfig(type).createDefault`**, inserts into tree, sets `activeItemId`, adds recent.
- **`updateItem(id, type, updater)`** — Immutable-style updater on the item; marks unsaved.
- **`duplicateItem` / `pasteItem` / import paths** — Use **`getItemConfig(type).clone`** where applicable.

**Persistence:**

- **Zustand persist** (`mandy-projects`, version **`ZUSTAND_PERSIST_VERSION`** in `src/migration/index.ts`) — workspace slice (active project, active item id, etc.). Bump **only** when the persisted envelope shape changes; use `migratePersistedZustandState`.
- **Project JSON schema** — `Project.schemaVersion` vs **`CURRENT_PROJECT_SCHEMA_VERSION`**. Legacy projects trigger migration UI and yellow dots in the tree. Bump when on-disk/exported **project** shape changes; implement in `migrateProjectToCurrent` / `verifyProject` / import helpers in the same module.

---

## Sidebar, file tree, welcome

- **Creatable menus** should always be built from **`creatableItemTypes`** (and hardcoded extras: workflow, folder) — do not duplicate type lists.
- **File tree** uses **`RequestTypeIcon`** for non-REST, non-folder rows; REST rows show **HTTP method** via `methodConstants`, not the registry icon.
- **Welcome recents** resolve icons via **`allItemTypes`** and `shortLabel`, respecting **`matchRecentsByShortLabel`** so `GET` stays a REST method row, not a false match to the REST type’s default label.

---

## Adding a new request type (checklist)

Work in roughly this order so TypeScript guides missing steps.

1. **`src/types/project.ts`**
   - Add literal to `RequestType`.
   - Define `YourFile` interface with `type: "yourtype"`.
   - Extend `RequestItemMap` and ensure `RequestItem` picks it up.

2. **`src/registry/registryCore.ts`**
   - Add `yourtypeConfig = defineItemType({ ... })` with icon, labels, `createDefault`, `clone`, `getRecentMeta`, `isCreatable`, `menuOrder`, and any optional display fields (`treeIconSize`, `listBadgeClass`, overview classes, `matchRecentsByShortLabel` if needed).
   - Register on **`itemTypeRegistry`**.

3. **`src/registry/editorViews.tsx`** (if it behaves like WS/GQL/MQTT)
   - Extend **`ProtocolRequestItem`**.
   - Add a **`case`** in **`renderProtocolEditor`** (and update **`isProtocolRequestItem`**).

4. **`src/App.tsx`**
   - Ensure the new type is **routed** (protocol branch or new branch).
   - Extend the **`activeItem?.type !== ...`** list before `WelcomePage` if the type is not `request` or `workflow` and not covered by `isProtocolRequestItem`.

5. **`src/components/FileTree.tsx`**
   - If the type is not covered by the generic **`RequestTypeIcon`** branch (folder vs request vs “other protocol types”), extend the condition or default handling.

6. **`src/components/ProjectOverview.tsx`**
   - Add rendering in **`FolderSection`** (card, row, or reuse `RequestTypeListBadge`) and wire `onSelectYourType` props from `App` like existing types.

7. **Implement editor** under `components/editors/` (+ optional `YourTypeOverview.tsx` with **`OverviewLayout`**).

8. **Store / migration / import**
   - `findItem`, `addItem`, `updateItem`, `duplicateItem`, clipboard, and **`src/migration/index.ts`** (if serialized shape needs upgrading).

9. **Run** `bun run build` and `bunx tsc --noEmit`.

---

## Design rules for agents

- Prefer **registry-driven** menus and icons over duplicated lists.
- Keep **`registryCore.ts`** free of imports from editor components (avoid circular deps); editors may import **`../registry`**.
- REST is unique: **imperative send** via `RestRequestEditor` ref for global shortcuts and overview run.
- When extending overview or tabs, match existing **Tailwind / layout** patterns (`OverviewLayout`, `TabView` in project overview).

---

## Further reading in repo

- **`src/migration/index.ts`** — `parseMandyJsonWithMigration`, `exportToMandyJSON`, backup behavior for legacy files.
- **`src/components/ui/TabView.tsx`** — Used by project overview tabs (`variant="pill"`).

If this file drifts from the code, update **this document** in the same PR as architectural changes.
