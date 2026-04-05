import type { ReactNode } from "react";
import { WebSocketEditor } from "../components/editors/WebSocketEditor";
import { GraphQLEditor } from "../components/editors/GraphQLEditor";
import { SocketIOEditor } from "../components/editors/SocketIOEditor";
import { MQTTEditor } from "../components/editors/MQTTEditor";
import type {
  Project,
  RequestType,
  ItemOfType,
  WebSocketFile,
  GraphQLFile,
  SocketIOFile,
  MQTTFile,
} from "../types/project";

type UpdateItemFn = <T extends RequestType>(
  id: string,
  type: T,
  updater: (item: ItemOfType<T>) => ItemOfType<T>,
) => void;

/** Shared wiring for realtime / GraphQL / MQTT editors (not REST or workflow). */
export interface ProtocolEditorContext {
  activeProject: Project | null;
  getEnvKeys: () => string[];
  resolveVariables: (text: string) => string;
  updateItem: UpdateItemFn;
  startLoading: (id: string) => void;
  stopLoading: (id: string) => void;
  onOpenProjectSettings: () => void;
  onSendGraphQL: () => void | Promise<void>;
  loadingItems: Set<string>;
}

export type ProtocolRequestItem =
  | WebSocketFile
  | GraphQLFile
  | SocketIOFile
  | MQTTFile;

/**
 * Maps each non-REST, non-workflow request type to its editor.
 * REST uses {@link ../components/editors/RestRequestEditor} with a ref for Cmd+Enter / overview run.
 */
export const editorByProtocolType = {
  websocket: WebSocketEditor,
  graphql: GraphQLEditor,
  socketio: SocketIOEditor,
  mqtt: MQTTEditor,
} as const;

export function renderProtocolEditor(
  item: ProtocolRequestItem,
  ctx: ProtocolEditorContext,
): ReactNode {
  const {
    activeProject,
    getEnvKeys,
    resolveVariables,
    updateItem,
    startLoading,
    stopLoading,
    onOpenProjectSettings,
    onSendGraphQL,
    loadingItems,
  } = ctx;

  switch (item.type) {
    case "websocket":
      return (
        <WebSocketEditor
          key={item.id}
          ws={item}
          onUpdate={(updater) => updateItem(item.id, "websocket", updater)}
          availableVariables={getEnvKeys()}
          projectAuth={activeProject?.authorization}
          onOpenProjectSettings={onOpenProjectSettings}
          onStartLoading={startLoading}
          onStopLoading={stopLoading}
          resolveVariables={resolveVariables}
        />
      );
    case "graphql":
      return (
        <GraphQLEditor
          key={item.id}
          gql={item}
          onUpdate={(updater) => updateItem(item.id, "graphql", updater)}
          onSendQuery={onSendGraphQL}
          loading={loadingItems.has(item.id)}
          onStartLoading={startLoading}
          onStopLoading={stopLoading}
          availableVariables={getEnvKeys()}
          projectAuth={activeProject?.authorization}
          onOpenProjectSettings={onOpenProjectSettings}
        />
      );
    case "socketio":
      return (
        <SocketIOEditor
          key={item.id}
          sio={item}
          onUpdate={(updater) => updateItem(item.id, "socketio", updater)}
          availableVariables={getEnvKeys()}
          resolveVariables={resolveVariables}
          onStartLoading={startLoading}
          onStopLoading={stopLoading}
        />
      );
    case "mqtt":
      return (
        <MQTTEditor
          key={item.id}
          mqtt={item}
          onUpdate={(updater) => updateItem(item.id, "mqtt", updater)}
          resolveVariables={resolveVariables}
          onStartLoading={startLoading}
          onStopLoading={stopLoading}
        />
      );
  }
}

export function isProtocolRequestItem(
  item: ItemOfType<RequestType> | null | undefined,
): item is ProtocolRequestItem {
  const t = item?.type;
  return (
    t === "websocket" ||
    t === "graphql" ||
    t === "socketio" ||
    t === "mqtt"
  );
}
