import { execFile } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

const XCODE_DEVELOPER = "/Applications/Xcode.app/Contents/Developer";

interface MetalEnv {
  available: boolean;
  reason?: string;
  env: NodeJS.ProcessEnv;
}

let cachedEnv: MetalEnv | null = null;

function unavailableReason(stderr: string): string {
  if (/missing Metal Toolchain/i.test(stderr)) {
    return "Metal Toolchain component not installed (run: xcodebuild -downloadComponent MetalToolchain)";
  }
  if (/license/i.test(stderr)) {
    return "Xcode license not accepted (run: sudo xcodebuild -license accept)";
  }
  if (/unable to find utility|not a developer tool/i.test(stderr)) {
    return "xcrun could not find the metal compiler (install Xcode or the Command Line Tools)";
  }
  return stderr.trim() || "metal compiler unavailable";
}

function execMetal(args: string[], env: NodeJS.ProcessEnv): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile("xcrun", ["-sdk", "macosx", "metal", ...args], { timeout: 20000, env }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout, stderr });
    });
  });
}

async function resolveMetalEnv(): Promise<MetalEnv> {
  if (cachedEnv) return cachedEnv;
  const probe = await execMetal(["--version"], process.env);
  if (probe.ok) {
    cachedEnv = { available: true, env: process.env };
    return cachedEnv;
  }
  if (existsSync(XCODE_DEVELOPER)) {
    const fallbackEnv = { ...process.env, DEVELOPER_DIR: XCODE_DEVELOPER };
    const fallback = await execMetal(["--version"], fallbackEnv);
    if (fallback.ok) {
      cachedEnv = { available: true, env: fallbackEnv };
      return cachedEnv;
    }
    cachedEnv = { available: false, reason: unavailableReason(fallback.stderr), env: fallbackEnv };
    return cachedEnv;
  }
  cachedEnv = { available: false, reason: unavailableReason(probe.stderr), env: process.env };
  return cachedEnv;
}

export async function isMetalValidationAvailable(): Promise<boolean> {
  return (await resolveMetalEnv()).available;
}

export async function validateMetal(source: string): Promise<{ valid: boolean; output: string }> {
  const env = await resolveMetalEnv();
  if (!env.available) {
    return { valid: true, output: `Metal validation skipped: ${env.reason}` };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "metal-"));
  const shaderPath = join(tmpDir, "shader.metal");
  const outPath = join(tmpDir, "shader.air");
  writeFileSync(shaderPath, source);

  const result = await execMetal(["-c", shaderPath, "-o", outPath], env.env);
  if (result.ok) {
    return { valid: true, output: "Valid MSL" };
  }
  return { valid: false, output: result.stderr || "MSL compilation failed" };
}
