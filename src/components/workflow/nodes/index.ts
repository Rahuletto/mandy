import { StartNode } from "./StartNode";
import { EndNode } from "./EndNode";
import { RequestNode } from "./RequestNode";
import { ConditionNode } from "./ConditionNode";
import { LoopNode } from "./LoopNode";

export { StartNode, EndNode, RequestNode, ConditionNode, LoopNode };

export const nodeTypes = {
  start: StartNode,
  end: EndNode,
  request: RequestNode,
  condition: ConditionNode,
  loop: LoopNode,
};
