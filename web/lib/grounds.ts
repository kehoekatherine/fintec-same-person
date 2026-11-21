import { spawn } from "node:child_process";
import path from "node:path";

import { resolveSystemDir } from "@/lib/engine";

export async function loadApplicableCodes(dataDir: string, timeoutMs: number): Promise<Map<string, string[]> | null> {
  const systemDir = await resolveSystemDir();
  if (!systemDir) return null;
  const script = path.join(systemDir, "explain_codes.py");
  try {
    const { code, stdout } = await spawnExplain(script, systemDir, dataDir, timeoutMs);
    if (code !== 0) return null;
    const parsed = JSON.parse(stdout) as unknown;
    if (!Array.isArray(parsed)) return null;
    const codes = new Map<string, string[]>();
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as { hit_id?: unknown; codes?: unknown };
      if (typeof row.hit_id !== "string" || !Array.isArray(row.codes)) continue;
      const list = row.codes.filter((code): code is string => typeof code === "string" && code.length > 0);
      codes.set(row.hit_id, list);
    }
    return codes;
  } catch {
    return null;
  }
}

function spawnExplain(
  script: string,
  systemDir: string,
  dataDir: string,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [script, dataDir], { cwd: systemDir });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("explain timed out"));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
