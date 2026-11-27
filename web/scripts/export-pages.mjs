import { spawn } from "node:child_process";
import { copyFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeDemoPack } from "./demo-pack.mjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "..");
const apiDir = path.join(webRoot, "app", "api");
const parked = path.join(webRoot, ".api-parked");

function pagesBasePath() {
  const raw = (process.env.PAGES_BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "/fintec-same-person").trim();
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "") || "/fintec-same-person";
}

const basePath = pagesBasePath();

await run("python3", [path.join(repoRoot, "scripts", "cluster.py")], process.env);
await writeDemoPack(repoRoot, webRoot);
await rm(parked, { recursive: true, force: true });
await rename(apiDir, parked);

try {
  await run("npx", ["next", "build"], {
    ...process.env,
    STATIC_EXPORT: "1",
    PAGES_BASE_PATH: basePath,
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_STATIC_DESK: "1",
  });
  const index = path.join(webRoot, "out", "index.html");
  await copyFile(index, path.join(webRoot, "out", "404.html"));
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(webRoot, "out", ".nojekyll"), "");
  console.log(`Static desk written to web/out with base path ${basePath}`);
} finally {
  await rm(apiDir, { recursive: true, force: true });
  await rename(parked, apiDir);
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: webRoot, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}
