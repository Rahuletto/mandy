import type { WorkflowNodeStatus } from "../../../types/workflow";

export const getNodeStyles = (status: WorkflowNodeStatus = "idle") => {
	const styles = {
		running: "border-accent bg-accent/5",
		completed: "border-green bg-green/5",
		error: "border-red bg-red/5",
		idle: "border-white/5 bg-card",
	};
	return styles[status] || styles.idle;
};

export const getIconColor = (status: WorkflowNodeStatus = "idle") => {
	const colors = {
		running: "text-accent",
		completed: "text-green",
		error: "text-red",
		idle: "text-white/80",
	};
	return colors[status] || colors.idle;
};

export const handleClass = "!w-2 !h-2 !bg-white/40 !border-none";
