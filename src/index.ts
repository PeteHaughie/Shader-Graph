import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const server = new McpServer({
  name: "semantic-shader-graph",
  version: "0.1.0",
});

server.registerTool(
  "list_primitives",
  {
    description: "List available shader primitive types and their signatures",
  },
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            [
              {
                type: "Texture",
                inputs: [],
                params: [
                  { name: "url", type: "string" },
                ],
                output: "vec4",
              },
              {
                type: "Noise",
                inputs: [],
                params: [
                  { name: "scale", type: "float", min: 0, max: 100, default: 1 },
                  { name: "seed", type: "float", min: 0, max: 100, default: 0 },
                ],
                output: "vec4",
              },
              {
                type: "Blur",
                inputs: [
                  { name: "image", type: "vec4" },
                ],
                params: [
                  { name: "radius", type: "float", min: 0, max: 50, default: 2 },
                ],
                output: "vec4",
              },
              {
                type: "Mix",
                inputs: [
                  { name: "a", type: "vec4" },
                  { name: "b", type: "vec4" },
                ],
                params: [
                  { name: "factor", type: "float", min: 0, max: 1, default: 0.5 },
                ],
                output: "vec4",
              },
              {
                type: "Output",
                inputs: [
                  { name: "source", type: "vec4" },
                ],
                params: [],
                output: null,
              },
            ],
            null,
            2,
          ),
        },
      ],
    };
  },
);

void serveStdio(() => server);
