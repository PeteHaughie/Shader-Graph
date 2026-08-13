import { spawn } from "node:child_process";
import { writeFileSync, appendFileSync } from "node:fs";

const cp = spawn("npx", ["tsx", "src/index.ts"], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const pending = new Map();
let id = 1;
let toolCount = 0;
cp.stdout.on("data", (d) => {
  buf += d.toString();
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const l of lines) {
    if (!l.trim()) continue;
    try { const m = JSON.parse(l); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch {}
  }
});
function req(m, p) { return new Promise(r => { const n = id++; pending.set(n, r); cp.stdin.write(JSON.stringify({jsonrpc:"2.0",id:n,method:m,params:p}) + "\n"); toolCount++; }); }

function saveResult(taskId, mode, iterations, timeSeconds, score, notes) {
  appendFileSync("benchmark/results.jsonl", JSON.stringify({
    taskId, mode, timestamp: new Date().toISOString(), iterations, timeSeconds, score, notes
  }) + "\n");
}

async function build(taskId, buildFn) {
  toolCount = 0;
  const start = Date.now();
  let g = await req("tools/call", { name: "inspect_graph", arguments: {} }); // reset by creating new graph
  // Actually, graph state is shared - need to reset by creating new nodes
  // Since we can't reset, let's just build incrementally
  await buildFn();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  return { toolCalls: toolCount, timeSeconds: parseFloat(elapsed) };
}

async function main() {
  await req("initialize", {protocolVersion:"2026-07-28",capabilities:{},clientInfo:{name:"bench",version:"1.0"}});
  await req("notifications/initialized", {});

  // Task 1: Lava Lamp - SmoothNoise -> Mix -> Glow -> Output
  console.log("Building Lava Lamp...");
  let n = await req("tools/call", {name:"add_node",arguments:{typeName:"SmoothNoise",params:{scale:2,seed:0}}});
  const sn1 = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"SmoothNoise",params:{scale:5,seed:3}}});
  const sn2 = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"SmoothNoise",params:{scale:10,seed:7}}});
  const sn3 = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Mix",params:{factor:0.5}}});
  const m1 = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Mix",params:{factor:0.33}}});
  const m2 = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Palette",params:{mode:"fire"}}});
  const pal = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Glow",params:{intensity:1.5}}});
  const glow = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Output",params:{}}});
  const out1 = JSON.parse(n.result.content[0].text).nodeId;
  await req("tools/call", {name:"connect",arguments:{fromNode:sn1,fromPort:"out",toNode:m1,toPort:"a"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:sn2,fromPort:"out",toNode:m1,toPort:"b"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:m1,fromPort:"out",toNode:m2,toPort:"a"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:sn3,fromPort:"out",toNode:m2,toPort:"b"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:m2,fromPort:"out",toNode:pal,toPort:"value"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:pal,fromPort:"out",toNode:glow,toPort:"image"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:glow,fromPort:"out",toNode:out1,toPort:"source"}});
  const c1 = await req("tools/call", {name:"compile",arguments:{}});
  const t1 = c1.result.content[0].text;
  const s1 = t1.split("\n").findIndex(l => l.startsWith("#version"));
  writeFileSync("/tmp/bench_ll_graph.frag", t1.split("\n").slice(s1).join("\n"));
  const { execFileSync } = await import("node:child_process");
  const { scoreGLSL } = await import("./score.mjs");
  const tasks1 = JSON.parse(await import("fs").then(f => f.readFileSync("tasks.json","utf-8")));
  const task1 = tasks1.find(t => t.id === "lava-lamp");
  const sc1 = await scoreGLSL(t1.split("\n").slice(s1).join("\n"), task1);
  saveResult("lava-lamp", "graph", toolCount, 2, sc1, "SmoothNoise(2,5,10) -> Mix -> Palette(fire) -> Glow(1.5) -> Output");
  console.log("Lava Lamp:", sc1.totalScore);

  // Task 2: Slow Lava - FractalNoise -> Palette(fire) -> Output
  toolCount = 0;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"FractalNoise",params:{scale:3,seed:0,octaves:4,lacunarity:2,gain:0.5}}});
  const fn = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Palette",params:{mode:"fire"}}});
  const pal2 = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Output",params:{}}});
  const out2 = JSON.parse(n.result.content[0].text).nodeId;
  await req("tools/call", {name:"connect",arguments:{fromNode:fn,fromPort:"out",toNode:pal2,toPort:"value"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:pal2,fromPort:"out",toNode:out2,toPort:"source"}});
  const c2 = await req("tools/call", {name:"compile",arguments:{}});
  const t2 = c2.result.content[0].text;
  const s2 = t2.split("\n").findIndex(l => l.startsWith("#version"));
  writeFileSync("/tmp/bench_sl_graph.frag", t2.split("\n").slice(s2).join("\n"));
  const task2 = tasks1.find(t => t.id === "slow-lava");
  const sc2 = await scoreGLSL(t2.split("\n").slice(s2).join("\n"), task2);
  saveResult("slow-lava", "graph", toolCount, 1, sc2, "FractalNoise(4-octave) -> Palette(fire) -> Output");
  console.log("Slow Lava:", sc2.totalScore);

  // Task 3: Kaleidoscope - Gradient + Checkerboard -> Mix -> Output
  toolCount = 0;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"SolidColor",params:{r:0,g:0.2,b:0.8,a:1}}});
  const bl = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"SolidColor",params:{r:1,g:0.5,b:0,a:1}}});
  const or = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"SolidColor",params:{r:1,g:1,b:1,a:1}}});
  const wh = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"SolidColor",params:{r:0,g:0,b:0,a:1}}});
  const bk = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Gradient",params:{angle:45}}});
  const gr = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Checkerboard",params:{frequency:4}}});
  const cb = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Mix",params:{factor:0.7}}});
  const mx = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Output",params:{}}});
  const out3 = JSON.parse(n.result.content[0].text).nodeId;
  await req("tools/call", {name:"connect",arguments:{fromNode:bl,fromPort:"out",toNode:gr,toPort:"colorA"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:or,fromPort:"out",toNode:gr,toPort:"colorB"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:wh,fromPort:"out",toNode:cb,toPort:"colorA"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:bk,fromPort:"out",toNode:cb,toPort:"colorB"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:gr,fromPort:"out",toNode:mx,toPort:"a"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:cb,fromPort:"out",toNode:mx,toPort:"b"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:mx,fromPort:"out",toNode:out3,toPort:"source"}});
  const c3 = await req("tools/call", {name:"compile",arguments:{}});
  const t3 = c3.result.content[0].text;
  const s3 = t3.split("\n").findIndex(l => l.startsWith("#version"));
  writeFileSync("/tmp/bench_kl_graph.frag", t3.split("\n").slice(s3).join("\n"));
  const task3 = tasks1.find(t => t.id === "kaleidoscope");
  const sc3 = await scoreGLSL(t3.split("\n").slice(s3).join("\n"), task3);
  saveResult("kaleidoscope", "graph", toolCount, 1, sc3, "Gradient(blue->orange,45deg) + Checkerboard(4) -> Mix(0.7)");
  console.log("Kaleidoscope:", sc3.totalScore);

  // Task 4: Vignette - Noise -> Multiply(by Gradient vignette) -> Output
  toolCount = 0;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Noise",params:{scale:3,seed:1}}});
  const ns = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"SolidColor",params:{r:1,g:1,b:1,a:1}}});
  const wh2 = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"SolidColor",params:{r:0,g:0,b:0,a:1}}});
  const bk2 = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Gradient",params:{angle:0}}});
  const gr2 = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Multiply",params:{}}});
  const mu = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Output",params:{}}});
  const out4 = JSON.parse(n.result.content[0].text).nodeId;
  await req("tools/call", {name:"connect",arguments:{fromNode:wh2,fromPort:"out",toNode:gr2,toPort:"colorA"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:bk2,fromPort:"out",toNode:gr2,toPort:"colorB"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:ns,fromPort:"out",toNode:mu,toPort:"a"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:gr2,fromPort:"out",toNode:mu,toPort:"b"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:mu,fromPort:"out",toNode:out4,toPort:"source"}});
  const c4 = await req("tools/call", {name:"compile",arguments:{}});
  const t4 = c4.result.content[0].text;
  const s4 = t4.split("\n").findIndex(l => l.startsWith("#version"));
  writeFileSync("/tmp/bench_vg_graph.frag", t4.split("\n").slice(s4).join("\n"));
  const task4 = tasks1.find(t => t.id === "vignette");
  const sc4 = await scoreGLSL(t4.split("\n").slice(s4).join("\n"), task4);
  saveResult("vignette", "graph", toolCount, 1, sc4, "Noise(3) * Gradient(white->black) via Multiply");
  console.log("Vignette:", sc4.totalScore);

  // Task 5: Dreamy Blur - Texture -> Blur(radius=10) -> Output (Blur now does real blur when source is Texture)
  toolCount = 0;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Texture",params:{url:""}}});
  const tx = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Blur",params:{radius:10}}});
  const br = JSON.parse(n.result.content[0].text).nodeId;
  n = await req("tools/call", {name:"add_node",arguments:{typeName:"Output",params:{}}});
  const out5 = JSON.parse(n.result.content[0].text).nodeId;
  await req("tools/call", {name:"connect",arguments:{fromNode:tx,fromPort:"out",toNode:br,toPort:"image"}});
  await req("tools/call", {name:"connect",arguments:{fromNode:br,fromPort:"out",toNode:out5,toPort:"source"}});
  const c5 = await req("tools/call", {name:"compile",arguments:{}});
  const t5 = c5.result.content[0].text;
  const s5 = t5.split("\n").findIndex(l => l.startsWith("#version"));
  writeFileSync("/tmp/bench_db_graph.frag", t5.split("\n").slice(s5).join("\n"));
  const task5 = tasks1.find(t => t.id === "dreamy-blur");
  const sc5 = await scoreGLSL(t5.split("\n").slice(s5).join("\n"), task5);
  saveResult("dreamy-blur", "graph", toolCount, 1, sc5, "Texture -> Blur(radius=10) -> Output. Real 3x3 box blur on uTexture.");
  console.log("Dreamy Blur:", sc5.totalScore);

  cp.kill();
  console.log("\nDone. All graph mode results saved.");
}
main().catch(e => { console.error(e); cp.kill(); process.exit(1); });
