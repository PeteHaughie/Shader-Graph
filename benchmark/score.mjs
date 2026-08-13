import { execFile } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function countPrimitives(source) {
  const primitives = [];
  const patterns = [
    ["Noise", /noise1d\s*\(/g],
    ["Mix", /mix\s*\(/g],
    ["Glow", /bright.*max|glow/i],
    ["Blur", /blur/i],
    ["Texture", /texture2D\s*\(/g],
    ["SolidColor", /vec4\s*\(\s*[\d.]/g],
    ["Gradient", /grad_t|grad_dir|\.xy\s*\/\s*iResolution/gi],
    ["HueShift", /rgb2hsv|hsv2rgb|hs_hsv|hue/i],
    ["BrightnessContrast", /bc_c|brightness|contrast/i],
    ["Saturation", /sat_hsv|saturation/i],
    ["Invert", /1\.0\s*-\s*.+\.rgb/],
    ["Threshold", /thresh_lum|step\s*\(/],
    ["Add", /\+/],
    ["Subtract", /\-/],
    ["Multiply", /\*/],
    ["Mask", /mask\.a|\.rgb\s*\*\s*.+\.a/],
    ["EdgeDetect", /sobel\s*\(/],
    ["Displace", /disp_offset|disp_uv/],
    ["Checkerboard", /cb\.x|mod\s*\(/],
  ];
  for (const [name, re] of patterns) {
    re.lastIndex = 0;
    if (re.test(source)) {
      primitives.push(name);
    }
  }
  return [...new Set(primitives)];
}

function countGLSLNodes(source) {
  const lines = source.split("\n");
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^vec[234]\s+v\d+\s*=/.test(trimmed) || /^gl_FragColor\s*=/.test(trimmed)) {
      count++;
    }
  }
  return count;
}

function findParamViolations(source) {
  const violations = [];
  const noiseScale = source.match(/noise1d\s*\(\s*([\d.]+)/);
  if (noiseScale) {
    const s = parseFloat(noiseScale[1]);
    if (s < 0 || s > 100) violations.push(`Noise scale ${s} out of range [0, 100]`);
  }
  const mixFactor = source.match(/mix\s*\([^,]+,[^,]+,\s*([\d.]+)/);
  if (mixFactor) {
    const f = parseFloat(mixFactor[1]);
    if (f < 0 || f > 1) violations.push(`Mix factor ${f} out of range [0, 1]`);
  }
  return violations;
}

export async function scoreGLSL(source, task) {
  const tmpDir = mkdtempSync(join(tmpdir(), "score-"));
  const shaderPath = join(tmpDir, "shader.frag");
  writeFileSync(shaderPath, source);

  let compiles = false;
  let compileError;
  try {
    await new Promise((resolve, reject) => {
      execFile("glslangValidator", [shaderPath], { timeout: 5000 }, (error, _stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve();
      });
    });
    compiles = true;
  } catch (e) {
    compileError = e.message;
  }

  const primitivesFound = countPrimitives(source);
  const missingPrimitives = task.scoring.requiredPrimitives.filter(
    (p) => !primitivesFound.includes(p),
  );
  const nodeCount = countGLSLNodes(source);
  const paramViolations = findParamViolations(source);

  const passesCompile = compiles ? 40 : 0;
  const passesPrimitives = missingPrimitives.length === 0 ? 20 : Math.max(0, 20 - missingPrimitives.length * 5);
  const passesNodeCount = nodeCount >= task.scoring.minNodes ? 20 : Math.max(0, nodeCount * 4);
  const passesParams = paramViolations.length === 0 ? 20 : 0;
  const totalScore = passesCompile + passesPrimitives + passesNodeCount + passesParams;

  return {
    compiles,
    compileError,
    primitivesFound,
    missingPrimitives,
    nodeCount,
    allParamsInRange: paramViolations.length === 0,
    paramViolations,
    passesTaskChecks: compiles && missingPrimitives.length === 0,
    totalScore,
  };
}

if (process.argv[1]?.endsWith("score.mjs")) {
  const shaderFile = process.argv[2];
  const taskId = process.argv[3];
  if (!shaderFile) {
    console.log("Usage: node benchmark/score.mjs <shader.frag> [task-id]");
    process.exit(1);
  }
  const source = readFileSync(shaderFile, "utf-8");
  const tasks = JSON.parse(readFileSync(new URL("tasks.json", import.meta.url), "utf-8"));
  const task = taskId ? tasks.find((t) => t.id === taskId) : tasks[0];
  if (!task) {
    console.error(`Task "${taskId}" not found`);
    process.exit(1);
  }
  const score = await scoreGLSL(source, task);
  console.log(JSON.stringify({ task: task.id, score }, null, 2));
}
