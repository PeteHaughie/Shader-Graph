export interface Node {
  id: string;
  typeName: string;
  params: Record<string, unknown>;
}

export interface Edge {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface GraphState {
  id: string;
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
}
