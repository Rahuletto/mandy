import { createContext } from "react";
import type { NodeOutput } from "../../types/workflow";

/** Latest execution output per workflow node id (canvas + panel). */
export const WorkflowNodeOutputsContext = createContext<
	Record<string, NodeOutput>
>({});
