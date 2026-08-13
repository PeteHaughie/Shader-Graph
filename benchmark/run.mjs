import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const TASKS = JSON.parse(readFileSync(new URL("tasks.json", import.meta.url), "utf-8"));
const RESULTS_FILE = new URL("results.jsonl", import.meta.url);

let serverProcess = null;

function startServer() {
  if (serverProcess) return;
  console.error("Starting shader-graph MCP server...");
  serverProcess = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "inherit"],
    detached: false,
  });
  return new Promise((resolve) => {
    serverProcess.stdout.once("data", () => resolve());
    setTimeout(() => resolve(), 2000);
  });
}

function stopServer() {
  if (serverProcess) {
    console.error("Stopping MCP server...");
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}

function printModeAInstructions(task) {
  return [
    `## Mode A: Graph tools available`,
    ``,
    `**Task: ${task.name}**`,
    ``,
    task.brief,
    ``,
    `**Instructions:**`,
    `- You have access to the **shader-graph MCP server** with these tools:`,
    `  - \`list_primitives\` — see available node types and their signatures`,
    `  - \`add_node\` — add nodes to the graph`,
    `  - \`connect\` — wire node outputs to inputs`,
    `  - \`disconnect\` — remove connections`,
    `  - \`set_parameter\` — tune node parameters`,
    `  - \`inspect_graph\` — see the current graph state`,
    `  - \`validate\` — check the graph is valid`,
    `  - \`compile\` — compile to GLSL and validate`,
    `- Use the graph tools to build the shader, don't write GLSL by hand`,
    `- When you have a valid compiled output, return:`,
    `  1. The final GLSL source code`,
    `  2. How many tool calls you made`,
    `  3. How long it took you`,
    `  4. Any notes about the process`,
  ].join("\n");
}

function printModeBInstructions(task) {
  return [
    `## Mode B: Text-only (no graph tools)`,
    ``,
    `**Task: ${task.name}**`,
    ``,
    task.brief,
    ``,
    `**Instructions:**`,
    `- The shader-graph MCP server is NOT available. Do not try to use it.`,
    `- Write GLSL ES 1.0 fragment shader source directly to a file.`,
    `- Available primitives you may use (their GLSL signatures):`,
    `  - \`vec4 noise1d(float scale, float seed)\` — value noise`,
    `  - \`vec4 texture2D(sampler2D tex, vec2 uv)\` — texture lookup`,
    `  - \`vec4 mix(vec4 a, vec4 b, float factor)\` — blend`,
    `  - \`float hash21(vec2 p)\` — hash function`,
    `  - \`vec3 rgb2hsv(vec3 c)\` / \`vec3 hsv2rgb(vec3 c)\` — color space`,
    `  - \`float luminance(vec3 c)\` — perceptual brightness`,
    `  - Use \`gl_FragColor\` for the output`,
    `  - Use \`gl_FragCoord.xy / iResolution\` for UV coordinates`,
    `- Validate with \`glslangValidator\` to check it compiles`,
    `- When done, return:`,
    `  1. The final GLSL source code`,
    `  2. How many iterations/edits you made`,
    `  3. How long it took you`,
    `  4. Any notes about the process`,
  ].join("\n");
}

function main() {
  const mode = process.argv[2];
  const taskId = process.argv[3];

  if (!mode || !taskId) {
    console.log(`
Usage: node benchmark/run.mjs <mode> <task-id>

Modes: graph | text
Tasks: ${TASKS.map((t) => t.id).join(", ")}
`);
    process.exit(1);
  }

  const task = TASKS.find((t) => t.id === taskId);
  if (!task) {
    console.error(`Unknown task: ${taskId}`);
    process.exit(1);
  }

  if (mode === "graph") {
    startServer().then(() => {
      console.log("\n" + "=".repeat(60));
      console.log(printModeAInstructions(task));
      console.log("=".repeat(60) + "\n");
      console.log("Server is running. Launch a sub-agent with the instructions above.");
    });
    process.on("SIGINT", () => { stopServer(); process.exit(0); });
  } else if (mode === "text") {
    stopServer();
    console.log("\n" + "=".repeat(60));
    console.log(printModeBInstructions(task));
    console.log("=".repeat(60) + "\n");
    console.log("Server stopped. Launch a sub-agent with the instructions above.");
  } else {
    console.error(`Unknown mode: ${mode}`);
    process.exit(1);
  }
}

main();
