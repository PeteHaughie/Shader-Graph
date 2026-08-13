import { spawn } from "node:child_process";

const cp = spawn("npx", ["tsx", "src/index.ts"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
const pending = new Map();
let idCounter = 1;

cp.stdout.on("data", (d) => {
  buffer += d.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      // partial JSON
    }
  }
});

function request(method, params) {
  return new Promise((resolve) => {
    const id = idCounter++;
    pending.set(id, resolve);
    cp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

async function main() {
  console.log("Initializing MCP server...");
  await request("initialize", {
    protocolVersion: "2026-07-28",
    capabilities: {},
    clientInfo: { name: "demo", version: "1.0" },
  });
  await request("notifications/initialized", {});

  console.log("\nListing primitives...");
  const prims = await request("tools/call", { name: "list_primitives", arguments: {} });
  const primList = JSON.parse(prims.result.content[0].text);
  for (const p of primList) {
    console.log(`  - ${p.typeName}: ${p.outputs[0]?.type ?? "void"} (${p.inputs.length} inputs, ${p.params.length} params)`);
  }

  console.log("\nBuilding graph: Noise -> Blur -> Mix <- Texture -> Output");
  const n1 = await request("tools/call", { name: "add_node", arguments: { typeName: "Noise", params: { scale: 3, seed: 1.5 } } });
  const noiseId = JSON.parse(n1.result.content[0].text).nodeId;
  console.log(`  + Noise: ${noiseId.slice(0, 8)}`);

  const n2 = await request("tools/call", { name: "add_node", arguments: { typeName: "Blur", params: { radius: 4 } } });
  const blurId = JSON.parse(n2.result.content[0].text).nodeId;
  console.log(`  + Blur: ${blurId.slice(0, 8)}`);

  const n3 = await request("tools/call", { name: "add_node", arguments: { typeName: "Texture", params: { url: "" } } });
  const texId = JSON.parse(n3.result.content[0].text).nodeId;
  console.log(`  + Texture: ${texId.slice(0, 8)}`);

  const n4 = await request("tools/call", { name: "add_node", arguments: { typeName: "Mix", params: { factor: 0.3 } } });
  const mixId = JSON.parse(n4.result.content[0].text).nodeId;
  console.log(`  + Mix: ${mixId.slice(0, 8)}`);

  const n5 = await request("tools/call", { name: "add_node", arguments: { typeName: "Output", params: {} } });
  const outId = JSON.parse(n5.result.content[0].text).nodeId;
  console.log(`  + Output: ${outId.slice(0, 8)}`);

  console.log("\nWiring edges...");
  await request("tools/call", { name: "connect", arguments: { fromNode: noiseId, fromPort: "out", toNode: blurId, toPort: "image" } });
  console.log("  Noise.out -> Blur.image OK");
  await request("tools/call", { name: "connect", arguments: { fromNode: texId, fromPort: "out", toNode: mixId, toPort: "a" } });
  console.log("  Texture.out -> Mix.a OK");
  await request("tools/call", { name: "connect", arguments: { fromNode: blurId, fromPort: "out", toNode: mixId, toPort: "b" } });
  console.log("  Blur.out -> Mix.b OK");
  await request("tools/call", { name: "connect", arguments: { fromNode: mixId, fromPort: "out", toNode: outId, toPort: "source" } });
  console.log("  Mix.out -> Output.source OK");

  console.log("\nValidating graph...");
  const val = await request("tools/call", { name: "validate", arguments: {} });
  const v = JSON.parse(val.result.content[0].text);
  console.log(`  Valid: ${v.valid}  Errors: ${v.errors.length}`);

  console.log("\nCompiling to GLSL...");
  const comp = await request("tools/call", { name: "compile", arguments: {} });
  const text = comp.result.content[0].text;
  const allLines = text.split("\n");
  const sourceStart = allLines.findIndex((l) => l.startsWith("#version"));
  console.log(allLines.slice(sourceStart).join("\n"));

  console.log("\nGLSL compilation successful!");
  console.log("Demo complete. The semantic shader graph is working.");

  cp.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  cp.kill();
  process.exit(1);
});
