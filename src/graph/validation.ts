import { GraphState } from "./types.js";
import { PortType } from "./primitives.js";
import { getPrimitive } from "./registry.js";
import { topologicalSort } from "./operations.js";

export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validateGraph(state: GraphState): ValidationResult {
  const errors: ValidationError[] = [];

  for (const node of state.nodes.values()) {
    const def = getPrimitive(node.typeName);
    if (!def) {
      errors.push({ nodeId: node.id, message: `Unknown primitive type: ${node.typeName}` });
      continue;
    }

    for (const param of def.params) {
      const value = node.params[param.name];
      if (value === undefined || value === null) {
        errors.push({ nodeId: node.id, message: `Missing required parameter: ${param.name}` });
        continue;
      }
      if (param.type === "float" && typeof value === "number") {
        if (param.min !== undefined && value < param.min) {
          errors.push({ nodeId: node.id, message: `Parameter ${param.name} = ${value} is below min ${param.min}` });
        }
        if (param.max !== undefined && value > param.max) {
          errors.push({ nodeId: node.id, message: `Parameter ${param.name} = ${value} is above max ${param.max}` });
        }
      }
    }
  }

  for (const edge of state.edges.values()) {
    const fromNode = state.nodes.get(edge.fromNode);
    const toNode = state.nodes.get(edge.toNode);
    if (!fromNode) {
      errors.push({ edgeId: edge.id, message: `Edge references non-existent source node: ${edge.fromNode}` });
      continue;
    }
    if (!toNode) {
      errors.push({ edgeId: edge.id, message: `Edge references non-existent target node: ${edge.toNode}` });
      continue;
    }

    const fromDef = getPrimitive(fromNode.typeName);
    const toDef = getPrimitive(toNode.typeName);
    if (!fromDef || !toDef) continue;

    const fromPort = fromDef.outputs.find((p) => p.name === edge.fromPort);
    const toPort = toDef.inputs.find((p) => p.name === edge.toPort);
    const toParam = toDef.params.find((p) => p.name === edge.toPort && p.isInput);
    if (!fromPort) {
      errors.push({ edgeId: edge.id, message: `Source node ${fromNode.typeName} has no output port: ${edge.fromPort}` });
    }
    if (!toPort && !toParam) {
      errors.push({ edgeId: edge.id, message: `Target node ${toNode.typeName} has no input port: ${edge.toPort}` });
    }
  }

  const outputTypes = ["Output", "VertexOutput"];
  const hasOutput = [...state.nodes.values()].some((n) => outputTypes.includes(n.typeName));
  if (!hasOutput) {
    errors.push({ message: "Graph has no Output node. An Output or VertexOutput node is required." });
  }

  const outputNode = [...state.nodes.values()].find((n) => outputTypes.includes(n.typeName));
  if (outputNode) {
    const outputEdges = [...state.edges.values()].filter((e) => e.toNode === outputNode.id);
    if (outputEdges.length === 0) {
      errors.push({ nodeId: outputNode.id, message: `Output node "${outputNode.id}" has no incoming connection` });
    }
  }

  for (const node of state.nodes.values()) {
    const def = getPrimitive(node.typeName);
    if (!def) continue;
    const paramInputNames = new Set(def.params.filter((p) => p.isInput).map((p) => p.name));
    for (const input of def.inputs) {
      if (paramInputNames.has(input.name)) continue;
      const connected = [...state.edges.values()].some((e) => e.toNode === node.id && e.toPort === input.name);
      if (!connected) {
        errors.push({ nodeId: node.id, message: `Input port "${input.name}" on ${node.typeName} is not connected` });
      }
    }
  }

  const { order, hasCycle } = topologicalSort(state);
  if (hasCycle || order.length !== state.nodes.size) {
    errors.push({ message: "Graph contains a cycle. Acyclic graphs only." });
  }

  return { valid: errors.length === 0, errors };
}
