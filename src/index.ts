import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { listPrimitives } from "./graph/registry.js";
import { createGraph, addNode, removeNode, connect, disconnect, setParameter } from "./graph/operations.js";
import { validateGraph } from "./graph/validation.js";
import { compileGraph, validateGLSL, describeFragmentGraph, VaryingInfo as FragVarying } from "./compiler/compile.js";
import { compileVertexGraph, validateGLSL as validateGLSLVert, describeVertexGraph } from "./compiler/vertex.js";
import { isValidTarget } from "./compiler/targets.js";
import { z } from "zod";

const server = new McpServer({
  name: "semantic-shader-graph",
  version: "0.1.0",
});

let graph = createGraph();
let vtxGraph = createGraph();
let currentTarget = "es100";

server.registerTool(
  "set_target",
  {
    description: "Set the GLSL target version (es100, es300, gl150)",
    inputSchema: z.object({
      target: z.string().describe("Target version: es100, es300, or gl150"),
    }),
  },
  async ({ target }) => {
    if (!isValidTarget(target)) {
      return { content: [{ type: "text", text: `Invalid target "${target}". Use es100, es300, or gl150.` }], isError: true };
    }
    currentTarget = target;
    return { content: [{ type: "text", text: `Target set to ${target}` }] };
  },
);

server.registerTool(
  "list_primitives",
  {
    description: "List available shader primitive types and their signatures",
  },
  async () => {
    return {
      content: [{ type: "text", text: JSON.stringify(listPrimitives(), null, 2) }],
    };
  },
);

server.registerTool(
  "inspect_graph",
  {
    description: "View the current graph state (nodes, edges, parameters)",
  },
  async () => {
    const nodes = [...graph.nodes.values()].map((n) => ({
      id: n.id,
      type: n.typeName,
      params: n.params,
    }));
    const edges = [...graph.edges.values()].map((e) => ({
      id: e.id,
      from: `${e.fromNode}:${e.fromPort}`,
      to: `${e.toNode}:${e.toPort}`,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify({ id: graph.id, nodes, edges }, null, 2) }],
    };
  },
);

server.registerTool(
  "add_node",
  {
    description: "Add a new primitive node to the graph",
    inputSchema: z.object({
      typeName: z.string().describe("Primitive type name"),
      params: z.record(z.string(), z.unknown()).default({}).describe("Node parameters"),
    }),
  },
  async ({ typeName, params }) => {
    graph = addNode(graph, typeName, params);
    return {
      content: [{ type: "text", text: JSON.stringify({ id: graph.id, nodeId: [...graph.nodes.keys()].pop() }, null, 2) }],
    };
  },
);

server.registerTool(
  "remove_node",
  {
    description: "Remove a node and its connections",
    inputSchema: z.object({
      nodeId: z.string().describe("ID of the node to remove"),
    }),
  },
  async ({ nodeId }) => {
    graph = removeNode(graph, nodeId);
    return { content: [{ type: "text", text: `Removed node ${nodeId}` }] };
  },
);

server.registerTool(
  "connect",
  {
    description: "Connect two nodes (output port to input port)",
    inputSchema: z.object({
      fromNode: z.string().describe("Source node ID"),
      fromPort: z.string().describe("Source output port name"),
      toNode: z.string().describe("Target node ID"),
      toPort: z.string().describe("Target input port name"),
    }),
  },
  async ({ fromNode, fromPort, toNode, toPort }) => {
    graph = connect(graph, fromNode, fromPort, toNode, toPort);
    return { content: [{ type: "text", text: `Connected ${fromNode}:${fromPort} → ${toNode}:${toPort}` }] };
  },
);

server.registerTool(
  "disconnect",
  {
    description: "Remove a connection by edge ID",
    inputSchema: z.object({
      edgeId: z.string().describe("ID of the edge to remove"),
    }),
  },
  async ({ edgeId }) => {
    graph = disconnect(graph, edgeId);
    return { content: [{ type: "text", text: `Removed edge ${edgeId}` }] };
  },
);

server.registerTool(
  "clear_graph",
  {
    description: "Reset the fragment graph to an empty state (removes all nodes and edges)",
  },
  async () => {
    graph = createGraph();
    return { content: [{ type: "text", text: "Fragment graph cleared" }] };
  },
);

server.registerTool(
  "set_parameter",
  {
    description: "Change a node's parameter value",
    inputSchema: z.object({
      nodeId: z.string().describe("Node ID"),
      name: z.string().describe("Parameter name"),
      value: z.union([z.number(), z.string()]).describe("New parameter value"),
    }),
  },
  async ({ nodeId, name, value }) => {
    graph = setParameter(graph, nodeId, name, value);
    return { content: [{ type: "text", text: `Set ${nodeId}:${name} = ${value}` }] };
  },
);

server.registerTool(
  "validate",
  {
    description: "Validate the current graph (type-checking, completeness, DAG, parameter ranges)",
  },
  async () => {
    const result = validateGraph(graph);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "compile",
  {
    description: "Compile the current graph to GLSL and validate the output",
  },
  async () => {
    const compiled = compileGraph(graph, undefined, currentTarget);
    if (!compiled.valid) {
      return {
        content: [{ type: "text", text: compiled.errors ?? "Unknown compilation error" }],
        isError: true,
      };
    }
    const validation = await validateGLSL(compiled.source);
    const response = `// Target: ${currentTarget}\n// GLSL compilation result:\n// Valid: ${validation.valid}\n${validation.valid ? "" : `// Errors: ${validation.output}\n`}\n${compiled.source}`;
    return { content: [{ type: "text", text: response }] };
  },
);

server.registerTool(
  "compile_pair",
  {
    description: "Compile both vertex and fragment graphs as a matched shader pair with varying passthrough",
  },
  async () => {
    const vtxResult = compileVertexGraph(vtxGraph, undefined, currentTarget);
    if (!vtxResult.valid) {
      return { content: [{ type: "text", text: `Vertex graph: ${vtxResult.errors}` }], isError: true };
    }
    const fragResult = compileGraph(graph, vtxResult.varyings, currentTarget);
    if (!fragResult.valid) {
      return { content: [{ type: "text", text: `Fragment graph: ${fragResult.errors}` }], isError: true };
    }
    const vtxVal = await validateGLSLVert(vtxResult.source);
    const fragVal = await validateGLSL(fragResult.source);
    const response = `=== Vertex Shader ===\n// Valid: ${vtxVal.valid}\n${vtxResult.source}\n\n=== Fragment Shader ===\n// Valid: ${fragVal.valid}\n${fragResult.source}`;
    return { content: [{ type: "text", text: response }] };
  },
);

server.registerTool(
  "describe",
  {
    description: "Describe the current fragment graph — returns uniform/attribute/varying metadata",
  },
  async () => {
    const meta = describeFragmentGraph(graph);
    return { content: [{ type: "text", text: JSON.stringify({ target: currentTarget, ...meta }, null, 2) }] };
  },
);

server.registerTool(
  "vtx_describe",
  {
    description: "Describe the current vertex graph — returns uniform/attribute/varying metadata",
  },
  async () => {
    const meta = describeVertexGraph(vtxGraph);
    return { content: [{ type: "text", text: JSON.stringify({ target: currentTarget, ...meta }, null, 2) }] };
  },
);

server.registerTool(
  "describe_pair",
  {
    description: "Describe both graphs as a matched pair — returns combined metadata",
  },
  async () => {
    const vtxMeta = describeVertexGraph(vtxGraph);
    const fragMeta = describeFragmentGraph(graph, vtxMeta.varyings);
    return { content: [{ type: "text", text: JSON.stringify({ target: currentTarget, vertex: vtxMeta, fragment: fragMeta }, null, 2) }] };
  },
);

server.registerTool(
  "compile_depth_pass",
  {
    description: "Compile a depth-only vertex shader for shadow map rendering",
  },
  async () => {
    const vtxResult = compileVertexGraph(vtxGraph, undefined, currentTarget);
    if (!vtxResult.valid) return { content: [{ type: "text", text: `Vertex graph: ${vtxResult.errors}` }], isError: true };
    const { isValidTarget, getTarget } = await import("./compiler/targets.js");
    const tgt = getTarget(isValidTarget(currentTarget) ? currentTarget : "es100");
    const attrKw = tgt.attribKeyword;
    const vertSrc = `${tgt.version}\n${tgt.precision}${attrKw} vec3 aPosition;\nuniform mat4 uLightMVP;\nvoid main() {\n  gl_Position = uLightMVP * vec4(aPosition, 1.0);\n}`;
    const fragSrc = `${tgt.version}\n${tgt.precision}void main() {\n  gl_FragColor = vec4(1.0);\n}`;
    const vtxVal = await validateGLSLVert(vertSrc);
    const fragVal = await validateGLSL(fragSrc);
    const response = `=== Depth Vertex ===\n// Valid: ${vtxVal.valid}\n${vertSrc}\n\n=== Depth Fragment ===\n// Valid: ${fragVal.valid}\n${fragSrc}`;
    return { content: [{ type: "text", text: response }] };
  },
);

// --- Vertex graph tools ---

server.registerTool(
  "vtx_list_primitives",
  {
    description: "List available vertex shader primitive types",
  },
  async () => {
    return {
      content: [{ type: "text", text: JSON.stringify(listPrimitives().filter((p) => p.graphType === "vertex"), null, 2) }],
    };
  },
);

server.registerTool(
  "vtx_inspect_graph",
  {
    description: "View the current vertex graph state",
  },
  async () => {
    const nodes = [...vtxGraph.nodes.values()].map((n) => ({ id: n.id, type: n.typeName, params: n.params }));
    const edges = [...vtxGraph.edges.values()].map((e) => ({ id: e.id, from: `${e.fromNode}:${e.fromPort}`, to: `${e.toNode}:${e.toPort}` }));
    return { content: [{ type: "text", text: JSON.stringify({ id: vtxGraph.id, nodes, edges }, null, 2) }] };
  },
);

server.registerTool(
  "vtx_add_node",
  {
    description: "Add a vertex primitive node",
    inputSchema: z.object({
      typeName: z.string().describe("Vertex primitive type name"),
      params: z.record(z.string(), z.unknown()).default({}).describe("Node parameters"),
    }),
  },
  async ({ typeName, params }) => {
    vtxGraph = addNode(vtxGraph, typeName, params);
    return { content: [{ type: "text", text: JSON.stringify({ id: vtxGraph.id, nodeId: [...vtxGraph.nodes.keys()].pop() }, null, 2) }] };
  },
);

server.registerTool(
  "vtx_remove_node",
  {
    description: "Remove a vertex node and its connections",
    inputSchema: z.object({ nodeId: z.string().describe("Node ID to remove") }),
  },
  async ({ nodeId }) => {
    vtxGraph = removeNode(vtxGraph, nodeId);
    return { content: [{ type: "text", text: `Removed vertex node ${nodeId}` }] };
  },
);

server.registerTool(
  "vtx_connect",
  {
    description: "Connect two vertex nodes",
    inputSchema: z.object({
      fromNode: z.string(), fromPort: z.string(), toNode: z.string(), toPort: z.string(),
    }),
  },
  async ({ fromNode, fromPort, toNode, toPort }) => {
    vtxGraph = connect(vtxGraph, fromNode, fromPort, toNode, toPort);
    return { content: [{ type: "text", text: `Connected ${fromNode}:${fromPort} → ${toNode}:${toPort}` }] };
  },
);

server.registerTool(
  "vtx_clear_graph",
  {
    description: "Reset the vertex graph to an empty state (removes all nodes and edges)",
  },
  async () => {
    vtxGraph = createGraph();
    return { content: [{ type: "text", text: "Vertex graph cleared" }] };
  },
);

server.registerTool(
  "vtx_disconnect",
  {
    description: "Remove a vertex connection by edge ID",
    inputSchema: z.object({ edgeId: z.string() }),
  },
  async ({ edgeId }) => {
    vtxGraph = disconnect(vtxGraph, edgeId);
    return { content: [{ type: "text", text: `Removed vertex edge ${edgeId}` }] };
  },
);

server.registerTool(
  "vtx_set_parameter",
  {
    description: "Change a vertex node parameter",
    inputSchema: z.object({
      nodeId: z.string(), name: z.string(), value: z.union([z.number(), z.string()]),
    }),
  },
  async ({ nodeId, name, value }) => {
    vtxGraph = setParameter(vtxGraph, nodeId, name, value);
    return { content: [{ type: "text", text: `Set vertex ${nodeId}:${name} = ${value}` }] };
  },
);

server.registerTool(
  "vtx_validate",
  {
    description: "Validate the current vertex graph",
  },
  async () => {
    const result = validateGraph(vtxGraph);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  "vtx_compile",
  {
    description: "Compile the vertex graph to GLSL vertex shader and validate",
  },
  async () => {
    const compiled = compileVertexGraph(vtxGraph, undefined, currentTarget);
    if (!compiled.valid) {
      return { content: [{ type: "text", text: compiled.errors ?? "Unknown error" }], isError: true };
    }
    const validation = await validateGLSLVert(compiled.source);
    const response = `// Target: ${currentTarget}\n// Vertex shader compilation:\n// Valid: ${validation.valid}\n${validation.valid ? "" : `// Errors: ${validation.output}\n`}\n${compiled.source}`;
    return { content: [{ type: "text", text: response }] };
  },
);

void serveStdio(() => server);
