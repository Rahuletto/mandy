import { ConditionNode } from "./ConditionNode";
import { EndNode } from "./EndNode";
import { LoopNode } from "./LoopNode";
import { RequestNode } from "./RequestNode";
import { StartNode } from "./StartNode";

export { ConditionNode, EndNode, LoopNode, RequestNode, StartNode };

export const nodeTypes = {
	start: StartNode,
	end: EndNode,
	request: RequestNode,
	condition: ConditionNode,
	loop: LoopNode,
};
