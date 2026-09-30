import { createHash } from "node:crypto";

export function contentHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function shortHash(input: string): string {
  return `g_${contentHash(input).slice(0, 16)}`;
}
