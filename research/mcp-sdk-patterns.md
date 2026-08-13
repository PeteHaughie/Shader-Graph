# MCP TypeScript SDK Patterns

Research into current best practices for building MCP servers in TypeScript using the official `@modelcontextprotocol/sdk` (v2).

**Date:** 2026-08-13  
**Source:** v2 stable line (2026-07-28 spec)  
**Package:** `@modelcontextprotocol/server` (split from the monolithic `@modelcontextprotocol/sdk`)

---

## 1. Installation

The v2 SDK is split into separate packages for server and client. Install the server package plus Zod:

```sh
npm install @modelcontextprotocol/server zod
```

**Current version (v2):** `@modelcontextprotocol/server@1.30.0`  
**Required peer dependency:** `zod` (v3.25+ or v4; latest docs use `zod/v4`)

Sources:
- [npm: @modelcontextprotocol/server](https://www.npmjs.com/package/@modelcontextprotocol/server)
- [GitHub README - Installation](https://github.com/modelcontextprotocol/typescript-sdk#installation)

---

## 2. Complete Minimal Server Example

This is the canonical minimal server from the official "Build your first server" tutorial. It exposes a single tool over stdio:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

function createServer(): McpServer {
  const server = new McpServer({ name: 'semantic-graph', version: '1.0.0' });

  server.registerTool(
    'get-node',
    {
      description: 'Get a node from the graph by its ID',
      inputSchema: z.object({
        id: z.string().describe('The node identifier'),
      }),
    },
    async ({ id }) => {
      // handler logic
      return { content: [{ type: 'text', text: `Node: ${id}` }] };
    },
  );

  return server;
}

void serveStdio(createServer);
console.error('semantic-graph MCP server running on stdio');
```

Key points:
- `type=module` in `package.json` is **required** (SDK ships ESM only)
- `serveStdio(factory)` is the stdio entry point (v2 API — replaces v1's `new StdioServerTransport()` + `server.connect(transport)`)
- `registerTool` replaces v1's `server.tool()` method

Source: [Build your first server](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server.html)

---

## 3. Tool Definition Pattern

### Basic pattern

```typescript
server.registerTool(
  'tool-name',               // unique identifier
  {
    title: 'Display Name',                     // optional display name
    description: 'What this tool does',         // description for the model
    inputSchema: z.object({                     // Zod schema → JSON Schema
      param1: z.string().describe('Parameter description'),
      param2: z.number().int().max(50).optional(),
    }),
    outputSchema: z.object({                    // optional: validate return value
      result: z.string(),
    }),
    annotations: {                              // optional: hints for the host/client
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
  },
  async (args) => {                             // typed handler
    // args is inferred from inputSchema
    return { content: [{ type: 'text', text: 'result' }] };
  },
);
```

### Schema conventions
- **`inputSchema`**: A single Zod object schema. The SDK converts it to JSON Schema for the model, validates arguments before the handler runs, AND infers the handler's argument types — all from one schema.
- **`.describe()`**: Survives the JSON Schema conversion; becomes the `description` field the model sees for that parameter.
- **No-arg tools**: Omit `inputSchema` entirely.
- **Output validation**: `outputSchema` validates `structuredContent` before the result leaves the server. The derived JSON Schema is advertised in `tools/list`.

### Structured output

```typescript
server.registerTool('product-details', {
  description: 'Look up a product',
  inputSchema: z.object({ name: z.string() }),
  outputSchema: z.object({ name: z.string(), price: z.number() }),
}, async ({ name }) => {
  const product = findProduct(name);
  if (!product) throw new Error(`No product named ${name}`);
  return {
    content: [{ type: 'text', text: JSON.stringify(product) }],
    structuredContent: product,   // validated against outputSchema
  };
});
```

Source: [Tools guide](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html)

---

## 4. Error Handling

### Tool errors (model-visible, the recovery path)

Return `isError: true` from a tool handler — this is still a **successful JSON-RPC result** (`result`), just flagged so the model reads the message and retries:

```typescript
// Explicit return
async ({ id }) => {
  const note = notes.get(id);
  if (!note) {
    return {
      content: [{ type: 'text', text: `No note with id "${id}". Known ids: ${[...notes.keys()].join(', ')}` }],
      isError: true,
    };
  }
  return { content: [{ type: 'text', text: note }] };
};

// Or throw — SDK catches and converts to same isError shape
async ({ id }) => {
  if (!notes.delete(id)) {
    throw new Error(`Cannot delete "${id}": no such note`);
  }
  return { content: [{ type: 'text', text: `Deleted "${id}"` }] };
};
```

The thrown exception's `.message` becomes the `content[].text`. The SDK skips `outputSchema` validation on any `isError` result.

### Protocol errors (host-visible, model never sees)

Used for resource/prompt/completion callbacks (not tool handlers — those always become `isError`):

```typescript
import { ProtocolError, ProtocolErrorCode, ResourceNotFoundError } from '@modelcontextprotocol/server';

// Thrown from resource/prompt/completion callbacks
throw new ProtocolError(
  ProtocolErrorCode.InvalidParams,
  'Note ids are lowercase letters, got "42"',
);
// Or use typed subclasses:
throw new ResourceNotFoundError('note://archived');
```

### ProtocolErrorCode values

| Member | Code | Meaning |
|---|---|---|
| `ParseError` | -32700 | Invalid JSON message |
| `InvalidRequest` | -32600 | Invalid JSON-RPC request |
| `MethodNotFound` | -32601 | No handler for the method |
| `InvalidParams` | -32602 | Wrong params (also used for resource read misses) |
| `InternalError` | -32603 | Handler threw non-ProtocolError |
| `ResourceNotFound` | -32002 | Receive-tolerated only (use `ResourceNotFoundError`) |
| `MissingRequiredClientCapability` | -32021 | Request needs capability client didn't declare |
| `UnsupportedProtocolVersion` | -32022 | Protocol version not supported |
| `UrlElicitationRequired` | -32042 | Tool needs user to visit a URL |

### Decision: tool error vs protocol error

- **Tool handler failure** → `isError: true` (model sees it, can recover)
- **Resource/prompt/completion failure** → `ProtocolError` (host sees it, model never sees)
- **Input validation failure** → SDK auto-rejects with `isError: true` before handler runs
- **Tool handler throwing `ProtocolError`** → still becomes `isError: true` (exception: `UrlElicitationRequiredError`)

Source: [Errors guide](https://ts.sdk.modelcontextprotocol.io/v2/servers/errors.html)

---

## 5. Transport Configuration

### stdio transport (local, single-tenant)

The host launches the server as a child process; requests on stdin, responses on stdout.

```typescript
import { serveStdio } from '@modelcontextprotocol/server/stdio';

const handle = serveStdio(() => {
  const server = new McpServer({ name: 'my-server', version: '1.0.0' });
  // register tools
  return server;
});

// Stderr = logging; stdout = JSON-RPC protocol (DO NOT console.log to stdout)
console.error('server is listening');

// Shutdown
process.on('SIGINT', () => { void handle.close(); });
```

**Best for:** Local tools launched by Claude Desktop, Claude Code, VS Code, Cursor, etc.  
**Testing:** `npx @modelcontextprotocol/inspector node ./build/server.js`

### Streamable HTTP transport (remote, multi-tenant)

```typescript
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createServer } from 'node:http';
import { localhostHostValidation, localhostOriginValidation } from '@modelcontextprotocol/node';

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: 'my-server', version: '1.0.0' });
  // register tools
  return server;
});

// Node.js mount with Host/Origin validation
const nodeHandler = toNodeHandler(handler);
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();

createServer((req, res) => {
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;
  void nodeHandler(req, res);
}).listen(3000, '127.0.0.1');
```

**Best for:** Remote servers, multi-client access, horizontal scaling.  
**Framework adapters:** Express (`@modelcontextprotocol/express`), Hono (`@modelcontextprotocol/hono`), Fastify (`@modelcontextprotocol/fastify`).

### Factory per request

The factory runs once per HTTP request — no state leaks between clients. Auth info flows through `authInfo`:

```typescript
const handler = createMcpHandler(({ authInfo }) => {
  const server = new McpServer({ name: 'notes', version: '1.0.0' });
  server.registerTool('whoami', { description: 'Name the caller' }, async () => ({
    content: [{ type: 'text', text: authInfo?.clientId ?? 'anonymous' }],
  }));
  return server;
});
```

### Transport comparison

| Transport | Use case | Multi-tenant | Session | Auth |
|---|---|---|---|---|
| stdio | Local child process | No (1:1) | Process lifetime | None needed |
| Streamable HTTP | Remote endpoint | Yes | Per-request factory | Bearer token, OAuth |
| Legacy HTTP+SSE | Backwards compat only | Deprecated | Deprecated | Deprecated |

Source: [Serve over stdio](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html), [Serve over HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html)

---

## 6. Official Examples & Templates

The SDK repo contains runnable examples under `examples/`:

- **`examples/server-quickstart/`** — A complete weather alert server with tools, resources, and prompts. The canonical "build your first server."
- **`examples/server/`** — Multiple server examples including Streamable HTTP (stateful, stateless, JSON-only response mode), legacy SSE, OAuth, elicitation, sampling/tasks.
- **`examples/client/`** — Interactive clients, parallel tool calls, OAuth flows, SSE polling.

Key example files:
- [`simpleStreamableHttp.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/server/simpleStreamableHttp.ts) — Feature-rich stateful server
- [`toolWithSampleServer.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/server/toolWithSampleServer.ts) — Sampling + tasks
- [`server-quickstart/src/index.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/server-quickstart/src/index.ts) — Minimal weather alert server

Additional templates and guides:
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector) — Debugging tool for stdio servers
- [Example Servers repo](https://github.com/modelcontextprotocol/servers) — Community/official server implementations

Source: [Examples page](https://ts.sdk.modelcontextprotocol.io/v2/get-started/examples.html)

---

## Summary: Key v2 API Changes from v1

| v1 API | v2 API |
|---|---|
| `@modelcontextprotocol/sdk` (monolithic) | `@modelcontextprotocol/server` + `@modelcontextprotocol/client` (split) |
| `server.tool(name, schema, handler)` | `server.registerTool(name, config, handler)` |
| `new StdioServerTransport()` + `server.connect(transport)` | `serveStdio(factory)` |
| `StreamableHTTPServerTransport` + `connect()` | `createMcpHandler(factory)` (returns `{ fetch, close, notify, bus }`) |
| `McpError`, `ErrorCode` | `ProtocolError`, `ProtocolErrorCode` |
| Zod v3 import | `zod/v4` recommended |

A codemod exists for automated migration: `@modelcontextprotocol/codemod`.
