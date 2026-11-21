import { spawn } from "node:child_process";
import { access, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { DeskError } from "@/lib/errors";
import { parseResolutions } from "@/lib/resolutions";
import type { Resolution } from "@/lib/types";

export async function resolveSystemDir(): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), "..", "system"),
    path.resolve(process.cwd(), "system"),
  ];
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, "run"));
      await access(path.join(candidate, "resolve.py"));
    } catch {
      continue;
    }
    const directory = await realpath(candidate);
    if (path.basename(directory) !== "system" || directory.includes("hackathon-data")) continue;
    return directory;
  }
  return null;
}

export async function runEngineOn(
  dataDir: string,
  timeoutMs: number,
  options?: { missingMessage?: string },
): Promise<Resolution[]> {
  const systemDir = await resolveSystemDir();
  if (!systemDir) {
    throw new DeskError(
      options?.missingMessage ??
        "The Python resolver is not available in this deployment, so the file cannot be scored.",
      { status: 503, code: "missing" },
    );
  }
  const folder = await realpath(dataDir);
  if (folder.includes("hackathon-data")) {
    throw new DeskError("The desk does not read the private data pack.", { status: 500 });
  }
  const output = path.join(
    tmpdir(),
    `screening-out-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`,
  );
  try {
    const { code, stderr, stdout } = await spawnRun(systemDir, folder, output, timeoutMs);
    if (code !== 0) {
      const detail = (stderr || stdout).trim() || `system/run exited with status ${code}.`;
      throw new DeskError("The resolver stopped without writing a queue.", {
        status: 500,
        detail,
      });
    }
    try {
      const text = await readFile(output, "utf8");
      return parseResolutions(text);
    } catch (error) {
      if (error instanceof DeskError) throw error;
      const message = error instanceof Error ? error.message : "The output could not be read.";
      throw new DeskError("The resolver finished, but the desk could not read its output.", {
        status: 500,
        detail: message,
      });
    }
  } finally {
    await rm(output, { force: true });
  }
}

function spawnRun(
  systemDir: string,
  dataDir: string,
  output: string,
  timeoutMs: number,
): Promise<{ code: number; stderr: string; stdout: string }> {
  const runner = path.join(systemDir, "run");
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/sh", [runner, dataDir, output], { cwd: systemDir });
    let stderr = "";
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new DeskError("The resolver timed out.", { status: 500 }));
    }, timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 8_000) stdout = stdout.slice(-8_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new DeskError("The desk could not start the Python resolver.", {
          status: 500,
          detail: error.message,
        }),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}
