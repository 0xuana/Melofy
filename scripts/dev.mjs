import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const children = new Set();
let exitCode = 0;
let shuttingDown = false;

function start(label, workingDirectory, executable, args = []) {
  const child = spawn(process.execPath, [executable, ...args], {
    cwd: workingDirectory,
    detached: process.platform !== "win32",
    env: process.env,
    stdio: "inherit",
  });

  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      exitCode = code ?? (signal ? 1 : 0);
      console.error(`${label} stopped${signal ? ` from ${signal}` : ` with status ${exitCode}`}; stopping development services.`);
      shutdown("SIGTERM");
    } else if (children.size === 0) {
      process.exit(exitCode);
    }
  });
}

function signalChild(child, signal) {
  if (!child.pid) return;

  try {
    process.kill(process.platform === "win32" ? child.pid : -child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((child) => signalChild(child, signal));

  const forceTimer = setTimeout(() => {
    children.forEach((child) => signalChild(child, "SIGKILL"));
  }, 3_000);
  forceTimer.unref();

  if (children.size === 0) process.exit(exitCode);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

start(
  "API server",
  join(workspaceRoot, "api"),
  join(workspaceRoot, "node_modules/tsx/dist/cli.mjs"),
  ["watch", "src/main.ts"],
);
start(
  "Web player",
  join(workspaceRoot, "web"),
  join(workspaceRoot, "node_modules/vite/bin/vite.js"),
);
