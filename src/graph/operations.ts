import { Node, Edge, GraphState } from "./types.js";
import { GraphType } from "./primitives.js";
import { shortHash } from "./hash.js";

export interface SerializedNode {
  id?: string;
  type: string;
  params: Record<string, unknown>;
}

export interface SerializedEdge {
  id?: string;
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}

export interface GraphDocument {
  schema?: number;
  graphType?: GraphType;
  target?: string;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  primitives?: unknown;
  vertex?: GraphDocument;
  fragment?: GraphDocument;
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export function serializeGraph(state: GraphState): { nodes: SerializedNode[]; edges: SerializedEdge[] } {
  const nodes = [...state.nodes.values()]
    .map((n) => ({ id: n.id, type: n.typeName, params: n.params }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = [...state.edges.values()]
    .map((e) => ({ id: e.id, from: e.fromNode, fromPort: e.fromPort, to: e.toNode, toPort: e.toPort }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { nodes, edges };
}

export function computeGraphId(state: GraphState): string {
  const { nodes, edges } = serializeGraph(state);
  return shortHash(canonicalize({ graphType: state.graphType ?? GraphType.Fragment, nodes, edges }));
}

export function createGraph(graphType: GraphType = GraphType.Fragment): GraphState {
  const state: GraphState = { id: "", graphType, nodes: new Map(), edges: new Map() };
  state.id = computeGraphId(state);
  return state;
}

function nextId(existing: Iterable<string>, prefix: string): string {
  const used = new Set(existing);
  let i = 0;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function addNode(state: GraphState, typeName: string, params: Record<string, unknown>, id?: string): GraphState {
  const node: Node = { id: id ?? nextId(state.nodes.keys(), "n"), typeName, params };
  const nodes = new Map(state.nodes);
  nodes.set(node.id, node);
  const next = { ...state, nodes };
  next.id = computeGraphId(next);
  return next;
}

export function removeNode(state: GraphState, nodeId: string): GraphState {
  const nodes = new Map(state.nodes);
  nodes.delete(nodeId);
  const edges = new Map(state.edges);
  for (const [id, edge] of edges) {
    if (edge.fromNode === nodeId || edge.toNode === nodeId) {
      edges.delete(id);
    }
  }
  const next = { ...state, nodes, edges };
  next.id = computeGraphId(next);
  return next;
}

export function connect(
  state: GraphState,
  fromNode: string,
  fromPort: string,
  toNode: string,
  toPort: string,
  id?: string,
): GraphState {
  const edge: Edge = { id: id ?? nextId(state.edges.keys(), "e"), fromNode, fromPort, toNode, toPort };
  const edges = new Map(state.edges);
  edges.set(edge.id, edge);
  const next = { ...state, edges };
  next.id = computeGraphId(next);
  return next;
}

export function disconnect(state: GraphState, edgeId: string): GraphState {
  const edges = new Map(state.edges);
  edges.delete(edgeId);
  const next = { ...state, edges };
  next.id = computeGraphId(next);
  return next;
}

export function setParameter(state: GraphState, nodeId: string, name: string, value: unknown): GraphState {
  const node = state.nodes.get(nodeId);
  if (!node) return state;
  const newNode: Node = { ...node, params: { ...node.params, [name]: value } };
  const nodes = new Map(state.nodes);
  nodes.set(nodeId, newNode);
  const next = { ...state, nodes };
  next.id = computeGraphId(next);
  return next;
}

export interface LoadResult {
  state: GraphState;
  errors: string[];
}

export function loadGraph(doc: GraphDocument, graphType: GraphType = GraphType.Fragment): LoadResult {
  const errors: string[] = [];
  const kind = doc.graphType ?? graphType;
  const nodes = new Map<string, Node>();
  const edges = new Map<string, Edge>();

  const nodeIdMap = new Map<string, string>();
  const rawNodes = Array.isArray(doc.nodes) ? doc.nodes : [];
  rawNodes.forEach((n, i) => {
    if (!n || typeof n.type !== "string") {
      errors.push(`Node ${i} is missing a "type"`);
      return;
    }
    const id = n.id && n.id.length > 0 ? n.id : `n${i}`;
    if (nodes.has(id)) {
      errors.push(`Duplicate node id "${id}"`);
      return;
    }
    nodeIdMap.set(n.id ?? id, id);
    nodes.set(id, { id, typeName: n.type, params: n.params ?? {} });
  });

  const rawEdges = Array.isArray(doc.edges) ? doc.edges : [];
  rawEdges.forEach((e, i) => {
    const id = e.id && e.id.length > 0 ? e.id : `e${i}`;
    const fromNode = nodeIdMap.get(e.from) ?? e.from;
    const toNode = nodeIdMap.get(e.to) ?? e.to;
    if (!nodes.has(fromNode)) errors.push(`Edge ${id} references unknown source node "${e.from}"`);
    if (!nodes.has(toNode)) errors.push(`Edge ${id} references unknown target node "${e.to}"`);
    if (edges.has(id)) {
      errors.push(`Duplicate edge id "${id}"`);
      return;
    }
    edges.set(id, { id, fromNode, fromPort: e.fromPort, toNode, toPort: e.toPort });
  });

  const state: GraphState = { id: "", graphType: kind, nodes, edges };
  state.id = computeGraphId(state);
  return { state, errors };
}

export function getConnectedInputs(state: GraphState, nodeId: string): Map<string, Edge> {
  const result = new Map<string, Edge>();
  for (const edge of state.edges.values()) {
    if (edge.toNode === nodeId) {
      result.set(edge.toPort, edge);
    }
  }
  return result;
}

export function topologicalSort(state: GraphState): { order: string[]; hasCycle: boolean } {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];
  let hasCycle = false;

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      hasCycle = true;
      return;
    }
    visiting.add(nodeId);
    for (const edge of state.edges.values()) {
      if (edge.toNode === nodeId) {
        visit(edge.fromNode);
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    order.push(nodeId);
  }

  for (const nodeId of state.nodes.keys()) {
    visit(nodeId);
  }

  return { order, hasCycle };
}

export function topologicalSortSubset(state: GraphState, ids: Set<string>): { order: string[]; hasCycle: boolean } {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];
  let hasCycle = false;

  function visit(nodeId: string): void {
    if (!ids.has(nodeId)) return;
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      hasCycle = true;
      return;
    }
    visiting.add(nodeId);
    for (const edge of state.edges.values()) {
      if (edge.toNode === nodeId) {
        visit(edge.fromNode);
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    order.push(nodeId);
  }

  for (const nodeId of ids) {
    visit(nodeId);
  }

  return { order, hasCycle };
}
