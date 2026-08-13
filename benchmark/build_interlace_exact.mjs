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

  // Build exact interlacing:
  // FragCoord -> Floor -> Mod(2) -> Swizzle("yxxx") -> Multiply(0.5) -> Multiply(TexelSize) -> Add(FragCoord) -> Texture.uv
  const fc = await add("FragCoord", {});
  const fl = await add("Floor", {});
  const md = await add("Mod", { divisor: 2 });
  const sw = await add("Swizzle", { pattern: "yxxx" });
  const s1 = await add("SolidColor", { r: 0.5, g: 0, b: 0, a: 0 });
  const m1 = await add("Multiply", {});
  const ts = await add("TexelSize", {});
  const m2 = await add("Multiply", {});
  const ad = await add("Add", {});
  const tx = await add("Texture", { url: "webcam.jpg" });
  const ot = await add("Output", {});

  await conn(fc, "out", fl, "value");
  await conn(fl, "out", md, "value");
  await conn(md, "out", sw, "input");
  await conn(sw, "out", m1, "a");
  await conn(s1, "out", m1, "b");
  await conn(m1, "out", m2, "a");
  await conn(ts, "out", m2, "b");
  await conn(m2, "out", ad, "a");
  await conn(fc, "out", ad, "b");
  await conn(ad, "out", tx, "uv");
  await conn(tx, "out", ot, "source");

  const comp = await req("tools/call", { name: "compile", arguments: {} });
  const text = comp.result.content[0].text;
  const lines = text.split("\n");
  const s = lines.findIndex(l => l.startsWith("#version"));
  const source = lines.slice(s).join("\n");
  writeFileSync("/tmp/bench_interlace_exact.frag", source);
  console.log("=== Generated GLSL (main body) ===");
  console.log(source.split("\n").filter(l => l.includes("v") || l.includes("gl_FragColor")).join("\n"));
  console.log("\nValid:", !comp.isError);

  // Compare with text mode version
  const expected = "uv.x += mod(row, 2.0) * (0.5 / iResolution.x);";
  const hasModRow = source.includes("mod(floor(gl_FragCoord.y), 2.0)") || source.includes("mod(v");
  const hasHalfPixel = source.includes("0.5") && source.includes("iResolution.x");
  console.log("Has mod+floor pattern:", hasModRow);
  console.log("Has half-pixel offset:", hasHalfPixel);
  cp.kill();
}
main().catch(e => { console.error(e); cp.kill(); });
