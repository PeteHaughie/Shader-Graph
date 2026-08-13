import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { listPrimitives } from "./graph/registry.js";
import { createGraph, addNode, removeNode, connect, disconnect, setParameter } from "./graph/operations.js";
import { validateGraph } from "./graph/validation.js";
import { compileGraph, validateGLSL } from "./compiler/compile.js";
import { z } from "zod";

const server = new McpServer({
  name: "semantic-shader-graph",
  version: "0.1.0",
});

let graph = createGraph();

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
    const compiled = compileGraph(graph);
    if (!compiled.valid) {
      return {
        content: [{ type: "text", text: compiled.errors ?? "Unknown compilation error" }],
        isError: true,
      };
    }
    const validation = await validateGLSL(compiled.source);
    const response = `// GLSL compilation result:\n// Valid: ${validation.valid}\n${validation.valid ? "" : `// Errors: ${validation.output}\n`}\n${compiled.source}`;
    return { content: [{ type: "text", text: response }] };
  },
);

void serveStdio(() => server);
