import type { Edge, Node } from "@xyflow/react";
import { SiMqtt, SiSocketdotio } from "react-icons/si";
import { TbBrandGraphql, TbPlugConnected, TbWorld } from "react-icons/tb";
import { VscTypeHierarchySub } from "react-icons/vsc";
import { createDefaultRequest } from "../reqhelpers/rest";
import type { RequestType } from "../types/project";
import type { WorkflowNodeData } from "../types/workflow";
import { defineItemType, type ItemTypeConfig } from "./itemTypes";

export type { ItemTypeConfig } from "./itemTypes";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function generateId(): string {
	return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// request
// ---------------------------------------------------------------------------

const requestConfig = defineItemType({
	type: "request",
	label: "REST Request",
	shortLabel: "GET",
	icon: TbWorld,
	iconClassName: "text-emerald-400",
	treeIconSize: 14,
	matchRecentsByShortLabel: false,
	isCreatable: true,
	menuOrder: 0,

	createDefault({ id, name = "New Request" }) {
		return {
			id,
			type: "request",
			name,
			request: createDefaultRequest(),
			response: null,
			useInheritedAuth: true,
		};
	},

	clone(item, { id }) {
		return {
			...item,
			id,
			name: `${item.name} (copy)`,
			request: {
				...item.request,
				headers: { ...item.request.headers },
				query_params: { ...item.request.query_params },
			},
			response: null,
		};
	},

	getRecentMeta(item) {
		return { methodLabel: item.request.method, url: item.request.url };
	},
});

// ---------------------------------------------------------------------------
// websocket
// ---------------------------------------------------------------------------

const websocketConfig = defineItemType({
	type: "websocket",
	label: "WebSocket",
	shortLabel: "WS",
	icon: TbPlugConnected,
	iconClassName: "text-emerald-400",
	treeIconSize: 14,
	overviewStripeClass: "bg-emerald-400/40",
	overviewSidebarCellClass: "bg-emerald-500/10 text-emerald-400",
	isCreatable: true,
	menuOrder: 1,

	createDefault({ id, name = "New WebSocket" }) {
		return {
			id,
			type: "websocket",
			name,
			url: "",
			messages: [],
			headers: {},
			params: [],
			headerItems: [],
			cookies: [],
			auth: "None",
			useInheritedAuth: true,
		};
	},

	clone(item, { id }) {
		return {
			...item,
			id,
			name: `${item.name} (copy)`,
			headers: { ...item.headers },
			params: item.params ? JSON.parse(JSON.stringify(item.params)) : undefined,
			headerItems: item.headerItems
				? JSON.parse(JSON.stringify(item.headerItems))
				: undefined,
			cookies: item.cookies
				? JSON.parse(JSON.stringify(item.cookies))
				: undefined,
			auth: item.auth ? JSON.parse(JSON.stringify(item.auth)) : undefined,
			messages: [],
		};
	},

	getRecentMeta(item) {
		return { methodLabel: "WS", url: item.url };
	},
});

// ---------------------------------------------------------------------------
// graphql
// ---------------------------------------------------------------------------

const graphqlConfig = defineItemType({
	type: "graphql",
	label: "GraphQL",
	shortLabel: "GQL",
	icon: TbBrandGraphql,
	iconClassName: "text-fuchsia-400",
	treeIconSize: 14,
	overviewStripeClass: "bg-fuchsia-500/40",
	overviewSidebarCellClass: "bg-fuchsia-500/10 text-fuchsia-400",
	listBadgeClass:
		"text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-fuchsia-500/20",
	isCreatable: true,
	menuOrder: 2,

	createDefault({ id, name = "New GraphQL" }) {
		return {
			id,
			type: "graphql",
			name,
			url: "",
			query: "query {\n  \n}",
			variables: "{}",
			headers: { "Content-Type": "application/json" },
			headerItems: [],
			auth: "None",
			useInheritedAuth: true,
			response: null,
		};
	},

	clone(item, { id }) {
		return {
			...item,
			id,
			name: `${item.name} (copy)`,
			headers: { ...item.headers },
			headerItems: item.headerItems
				? JSON.parse(JSON.stringify(item.headerItems))
				: undefined,
			auth: item.auth ? JSON.parse(JSON.stringify(item.auth)) : undefined,
			response: null,
		};
	},

	getRecentMeta(item) {
		return { methodLabel: "GQL", url: item.url };
	},
});

// ---------------------------------------------------------------------------
// socketio
// ---------------------------------------------------------------------------

const socketioConfig = defineItemType({
	type: "socketio",
	label: "Socket.IO",
	shortLabel: "SIO",
	icon: SiSocketdotio,
	iconClassName: "text-[#25C2A0]",
	treeIconSize: 14,
	overviewStripeClass: "bg-[#25C2A0]/40",
	overviewSidebarCellClass: "bg-[#25C2A0]/15 text-[#25C2A0]",
	listBadgeClass:
		"text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#25C2A0]/20",
	isCreatable: true,
	menuOrder: 3,

	createDefault({ id, name = "New Socket.IO" }) {
		return {
			id,
			type: "socketio",
			name,
			url: "",
			namespace: "/",
			path: "/socket.io/",
			transport: "websocket",
			reconnect: true,
			reconnectOnDisconnect: false,
			reconnectDelayMinMs: 300,
			reconnectDelayMaxMs: 5000,
			maxReconnectAttempts: 20,
			messages: [],
			headers: {},
			headerItems: [],
			queryItems: [],
			auth: "None",
			useInheritedAuth: true,
		};
	},

	clone(item, { id }) {
		return {
			...item,
			id,
			name: `${item.name} (copy)`,
			headers: { ...item.headers },
			headerItems: item.headerItems
				? JSON.parse(JSON.stringify(item.headerItems))
				: undefined,
			queryItems: item.queryItems
				? JSON.parse(JSON.stringify(item.queryItems))
				: undefined,
			auth: item.auth ? JSON.parse(JSON.stringify(item.auth)) : undefined,
			messages: [],
		};
	},

	getRecentMeta(item) {
		return { methodLabel: "SIO", url: item.url };
	},
});

// ---------------------------------------------------------------------------
// mqtt
// ---------------------------------------------------------------------------

const mqttConfig = defineItemType({
	type: "mqtt",
	label: "MQTT",
	shortLabel: "MQTT",
	icon: SiMqtt,
	iconClassName: "text-orange-300",
	treeIconSize: 12,
	overviewStripeClass: "bg-orange-400/40",
	overviewSidebarCellClass: "bg-orange-500/10 text-orange-300",
	listBadgeClass:
		"text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-orange-400/20",
	isCreatable: true,
	menuOrder: 4,

	createDefault({ id, name = "New MQTT" }) {
		return {
			id,
			type: "mqtt",
			name,
			url: "mqtt://broker.emqx.io:1883",
			clientId: `mandy-${id.slice(0, 8)}`,
			cleanSession: true,
			keepAliveSecs: 30,
			subscriptions: [],
			messages: [],
		};
	},

	clone(item, { id }) {
		return {
			...item,
			id,
			clientId: `mandy-${id.slice(0, 8)}`,
			name: `${item.name} (copy)`,
			subscriptions: item.subscriptions
				? JSON.parse(JSON.stringify(item.subscriptions))
				: [],
			messages: [],
		};
	},

	getRecentMeta(item) {
		return { methodLabel: "MQTT", url: item.url };
	},
});

// ---------------------------------------------------------------------------
// workflow
// ---------------------------------------------------------------------------

const workflowConfig = defineItemType({
	type: "workflow",
	label: "Workflow",
	shortLabel: "WF",
	icon: VscTypeHierarchySub,
	iconClassName: "text-purple-400",
	treeIconSize: 14,
	overviewStripeClass: "bg-purple-400/40",
	overviewSidebarCellClass: "bg-purple-500/10 text-purple-400",
	isCreatable: false,
	menuOrder: 5,

	createDefault({ id, name = "New Workflow" }) {
		const startNodeId = generateId();
		const endNodeId = generateId();

		const startNode: Node<WorkflowNodeData> = {
			id: startNodeId,
			type: "start",
			position: { x: 250, y: 100 },
			data: { label: "Start", status: "idle", type: "start" },
		};

		const endNode: Node<WorkflowNodeData> = {
			id: endNodeId,
			type: "end",
			position: { x: 250, y: 400 },
			data: { label: "End", status: "idle", type: "end" },
		};

		const defaultEdge: Edge = {
			id: `${startNodeId}-${endNodeId}`,
			source: startNodeId,
			target: endNodeId,
		};

		return {
			id,
			type: "workflow",
			name,
			nodes: [startNode, endNode],
			edges: [defaultEdge],
		};
	},

	clone(item, { id }) {
		const nodeIdMap = new Map<string, string>();
		const nodes = item.nodes.map((node) => {
			const newNodeId = generateId();
			nodeIdMap.set(node.id, newNodeId);
			return {
				...node,
				id: newNodeId,
				position: { ...node.position },
				data: structuredClone(node.data),
			};
		});
		const edges = item.edges.flatMap((edge) => {
			const source = nodeIdMap.get(edge.source);
			const target = nodeIdMap.get(edge.target);
			if (!source || !target) return [];
			return [
				{
					...edge,
					id: generateId(),
					source,
					target,
				},
			];
		});
		return {
			...item,
			id,
			name: `${item.name} (copy)`,
			nodes,
			edges,
		};
	},

	getRecentMeta() {
		return { methodLabel: "WF", url: "" };
	},
});

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

export const itemTypeRegistry: {
	[K in RequestType]: ItemTypeConfig<K>;
} = {
	request: requestConfig,
	websocket: websocketConfig,
	graphql: graphqlConfig,
	socketio: socketioConfig,
	mqtt: mqttConfig,
	workflow: workflowConfig,
};

export function getItemConfig<T extends RequestType>(
	type: T,
): ItemTypeConfig<T> {
	return itemTypeRegistry[type] as ItemTypeConfig<T>;
}

export const allItemTypes: ItemTypeConfig<RequestType>[] = Object.values(
	itemTypeRegistry,
) as ItemTypeConfig<RequestType>[];

export const creatableItemTypes: ItemTypeConfig<RequestType>[] = allItemTypes
	.filter((c) => c.isCreatable)
	.sort((a, b) => a.menuOrder - b.menuOrder);
