import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const cp = spawn("npx", ["tsx", "src/index.ts"], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
let buf = "", pending = new Map(), id = 1;
cp.stdout.on("data", d => {
  buf += d.toString();
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const l of lines) { if (!l.trim()) continue; try { const m = JSON.parse(l); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch {} }
});
function req(m, p) { return new Promise(r => { const n = id++; pending.set(n, r); cp.stdin.write(JSON.stringify({jsonrpc:"2.0",id:n,method:m,params:p})+"\n"); }); }

async function main() {
  await req("initialize", {protocolVersion:"2026-07-28",capabilities:{},clientInfo:{name:"bench",version:"1.0"}});
  await req("notifications/initialized", {});

  const add = async (t, p) => { const r = await req("tools/call", {name:"add_node",arguments:{typeName:t,params:p}}); return JSON.parse(r.result.content[0].text).nodeId; };
  const conn = async (f, fp, t, tp) => { await req("tools/call", {name:"connect",arguments:{fromNode:f,fromPort:fp,toNode:t,toPort:tp}}); };

  // FragCoord -> Floor -> Mod(divisor=2) -> Texture.uv, Texture -> Output
  const fc = await add("FragCoord", {});
  const fl = await add("Floor", {});
  const md = await add("Mod", { divisor: 2 });
  const tx = await add("Texture", { url: "webcam.jpg" });
  const ot = await add("Output", {});

  await conn(fc, "out", fl, "value");
  await conn(fl, "out", md, "value");
  await conn(md, "out", tx, "uv");
  await conn(tx, "out", ot, "source");

  const comp = await req("tools/call", { name: "compile", arguments: {} });
  const text = comp.result.content[0].text;
  const lines = text.split("\n");
  const s = lines.findIndex(l => l.startsWith("#version"));
  const source = lines.slice(s).join("\n");
  writeFileSync("/tmp/bench_interlace_graph.frag", source);
  console.log("Graph mode interlacing saved. Valid:", !comp.isError);
  console.log("Has mod:", source.includes("mod("));
  console.log("Has floor:", source.includes("floor("));
  cp.kill();
}
main().catch(e => { console.error(e); cp.kill(); });
