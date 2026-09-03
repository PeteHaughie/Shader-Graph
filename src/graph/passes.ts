import { GraphState } from "./types.js";

export interface PassInfo {
  index: number;
  sinkNodeId: string;
  sinkType: "Output" | "PassTarget";
  target?: string;
  persistent: boolean;
  float: boolean;
  width: string;
  height: string;
  nodes: string[];
}

export interface BufferInfo {
  name: string;
  persistent: boolean;
  float: boolean;
  width: string;
  height: string;
  writerSinkId: string;
}

export interface PassAnalysis {
  passes: PassInfo[];
  buffers: BufferInfo[];
  errors: string[];
}

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidSizeEquation(expr: string): boolean {
  if (!expr) return false;
  const stripped = expr.replace(/\$WIDTH|\$HEIGHT/g, "");
  return /^[0-9.+\-*/() \t]*$/.test(stripped);
}

function upstreamNodes(state: GraphState, sinkId: string): Set<string> {
  const result = new Set<string>();
  const stack = [sinkId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const edge of state.edges.values()) {
      if (edge.toNode === id) {
        stack.push(edge.fromNode);
      }
    }
  }
  return result;
}

export function analyzePasses(state: GraphState): PassAnalysis {
  const errors: string[] = [];
  const nodes = [...state.nodes.values()];

  const outputNodes = nodes.filter((n) => n.typeName === "Output");
  if (outputNodes.length > 1) {
    errors.push("Graph has more than one Output node");
  }

  const passTargets = nodes.filter((n) => n.typeName === "PassTarget");
  const readBuffers = nodes.filter((n) => n.typeName === "ReadBuffer");
  if (passTargets.length === 0 && readBuffers.length === 0) {
    return { passes: [], buffers: [], errors };
  }

  const seenNames = new Set<string>();
  for (const pt of passTargets) {
    const name = (pt.params.name as string) ?? "";
    if (!IDENTIFIER_RE.test(name)) {
      errors.push(`PassTarget buffer name "${name}" is not a valid GLSL identifier`);
      continue;
    }
    if (seenNames.has(name)) {
      errors.push(`Duplicate PassTarget buffer name "${name}"`);
    }
    seenNames.add(name);
  }

  for (const rb of readBuffers) {
    const name = (rb.params.name as string) ?? "";
    if (!IDENTIFIER_RE.test(name)) {
      errors.push(`ReadBuffer name "${name}" is not a valid GLSL identifier`);
      continue;
    }
    if (!seenNames.has(name)) {
      errors.push(`ReadBuffer "${name}" has no matching PassTarget`);
    }
  }

  for (const pt of passTargets) {
    const name = (pt.params.name as string) ?? "";
    if (!IDENTIFIER_RE.test(name)) continue;
    const width = (pt.params.width as string) ?? "$WIDTH";
    const height = (pt.params.height as string) ?? "$HEIGHT";
    if (!isValidSizeEquation(width)) {
      errors.push(`Invalid width equation "${width}" for buffer "${name}"`);
    }
    if (!isValidSizeEquation(height)) {
      errors.push(`Invalid height equation "${height}" for buffer "${name}"`);
    }
  }

  const sinks = [...passTargets, ...outputNodes];
  const passById = new Map<string, PassInfo>();
  const passes: PassInfo[] = [];
  for (const sink of sinks) {
    const isTarget = sink.typeName === "PassTarget";
    const closure = upstreamNodes(state, sink.id);
    const pass: PassInfo = {
      index: -1,
      sinkNodeId: sink.id,
      sinkType: isTarget ? "PassTarget" : "Output",
      target: isTarget ? ((sink.params.name as string) ?? "") : undefined,
      persistent: isTarget ? ((sink.params.persistent as number) ?? 0) === 1 : false,
      float: isTarget ? ((sink.params.float as number) ?? 0) === 1 : false,
      width: isTarget ? ((sink.params.width as string) ?? "$WIDTH") : "$WIDTH",
      height: isTarget ? ((sink.params.height as string) ?? "$HEIGHT") : "$HEIGHT",
      nodes: [...closure],
    };
    passes.push(pass);
    passById.set(sink.id, pass);
  }

  for (const pass of passes) {
    if (pass.sinkType !== "PassTarget") continue;
    const name = pass.target!;
    const readsOwn = pass.nodes.some((nid) => {
      const n = state.nodes.get(nid);
      return n?.typeName === "ReadBuffer" && (n.params.name as string) === name;
    });
    if (readsOwn && !pass.persistent) {
      errors.push(`Buffer "${name}" is read inside the pass that writes it but is not persistent`);
    }
  }

  const writerByBuffer = new Map<string, PassInfo>();
  for (const pass of passes) {
    if (pass.target) writerByBuffer.set(pass.target, pass);
  }

  const deps = new Map<string, Set<string>>();
  for (const pass of passes) {
    for (const nid of pass.nodes) {
      const n = state.nodes.get(nid);
      if (n?.typeName !== "ReadBuffer") continue;
      const name = n.params.name as string;
      const writer = writerByBuffer.get(name);
      if (!writer || writer.sinkNodeId === pass.sinkNodeId) continue;
      if (!deps.has(pass.sinkNodeId)) deps.set(pass.sinkNodeId, new Set());
      deps.get(pass.sinkNodeId)!.add(writer.sinkNodeId);
    }
  }

  const ordered: PassInfo[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  let cycle = false;
  function visit(pass: PassInfo): void {
    if (visited.has(pass.sinkNodeId)) return;
    if (visiting.has(pass.sinkNodeId)) {
      cycle = true;
      return;
    }
    visiting.add(pass.sinkNodeId);
    for (const dep of deps.get(pass.sinkNodeId) ?? []) {
      const depPass = passById.get(dep);
      if (depPass) visit(depPass);
    }
    visiting.delete(pass.sinkNodeId);
    visited.add(pass.sinkNodeId);
    ordered.push(pass);
  }
  for (const pass of passes) {
    visit(pass);
  }
  if (cycle) {
    errors.push("Pass ordering cycle: buffers are written and read in a circular dependency");
  }

  const finalOrder = [...ordered.filter((p) => p.sinkType !== "Output"), ...ordered.filter((p) => p.sinkType === "Output")];
  finalOrder.forEach((p, i) => (p.index = i));

  const buffers: BufferInfo[] = passTargets
    .filter((pt) => IDENTIFIER_RE.test((pt.params.name as string) ?? ""))
    .map((pt) => ({
      name: pt.params.name as string,
      persistent: ((pt.params.persistent as number) ?? 0) === 1,
      float: ((pt.params.float as number) ?? 0) === 1,
      width: (pt.params.width as string) ?? "$WIDTH",
      height: (pt.params.height as string) ?? "$HEIGHT",
      writerSinkId: pt.id,
    }));

  return { passes: finalOrder, buffers, errors };
}