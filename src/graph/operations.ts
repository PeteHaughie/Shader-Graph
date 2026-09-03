import { v4 as uuid } from "uuid";
import { Node, Edge, GraphState } from "./types.js";
import { PrimitiveDefinition } from "./primitives.js";

export function createGraph(): GraphState {
  return { id: uuid(), nodes: new Map(), edges: new Map() };
}

export function addNode(state: GraphState, typeName: string, params: Record<string, unknown>): GraphState {
  const node: Node = { id: uuid(), typeName, params };
  const nodes = new Map(state.nodes);
  nodes.set(node.id, node);
  return { ...state, id: uuid(), nodes };
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
  return { ...state, id: uuid(), nodes, edges };
}

export function connect(state: GraphState, fromNode: string, fromPort: string, toNode: string, toPort: string): GraphState {
  const edge: Edge = { id: uuid(), fromNode, fromPort, toNode, toPort };
  const edges = new Map(state.edges);
  edges.set(edge.id, edge);
  return { ...state, id: uuid(), edges };
}

export function disconnect(state: GraphState, edgeId: string): GraphState {
  const edges = new Map(state.edges);
  edges.delete(edgeId);
  return { ...state, id: uuid(), edges };
}

export function setParameter(state: GraphState, nodeId: string, name: string, value: unknown): GraphState {
  const node = state.nodes.get(nodeId);
  if (!node) return state;
  const newNode: Node = { ...node, params: { ...node.params, [name]: value } };
  const nodes = new Map(state.nodes);
  nodes.set(nodeId, newNode);
  return { ...state, id: uuid(), nodes };
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
