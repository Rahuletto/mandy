import { StartNode } from "./StartNode";
import { EndNode } from "./EndNode";
import { RequestNode } from "./RequestNode";
import { ScriptNode } from "./ScriptNode";
import { ConditionNode } from "./ConditionNode";
import { LoopNode } from "./LoopNode";

export { StartNode, EndNode, RequestNode, ScriptNode, ConditionNode, LoopNode };

export const nodeTypes = {
  start: StartNode,
  end: EndNode,
  request: RequestNode,
  script: ScriptNode,
  condition: ConditionNode,
  loop: LoopNode,
};
