import { GraphState } from "./types.js";
import { GraphType } from "./primitives.js";
import { serializeGraph } from "./operations.js";
import { primitiveRegistryInfo } from "./registry.js";

export const GRAPH_SCHEMA = 1;
export const GRAPH_PAYLOAD_SCHEMA = "shader-graph.graph";

export interface GraphExport {
  schema: number;
  schemaName: string;
  graphType: GraphType;
  target?: string;
  id: string;
  nodes: ReturnType<typeof serializeGraph>["nodes"];
  edges: ReturnType<typeof serializeGraph>["edges"];
  primitives: ReturnType<typeof primitiveRegistryInfo>;
  stages: string[];
}

export function buildGraphDocument(state: GraphState, target?: string, graphType?: GraphType): GraphExport {
  const { nodes, edges } = serializeGraph(state);
  return {
    schema: GRAPH_SCHEMA,
    schemaName: GRAPH_PAYLOAD_SCHEMA,
    graphType: graphType ?? state.graphType ?? GraphType.Fragment,
    target,
    id: state.id,
    nodes,
    edges,
    primitives: primitiveRegistryInfo(),
    stages: [GraphType.Fragment, GraphType.Vertex],
  };
}
