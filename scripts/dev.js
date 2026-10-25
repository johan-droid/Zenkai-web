#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Locate the repository root (where backend and frontend folders live)
let repoRoot = resolve(__dirname, "..");
if (!existsSync(join(repoRoot, "backend")) || !existsSync(join(repoRoot, "frontend"))) {
  if (existsSync(join(process.cwd(), "Zenkai Website", "backend"))) {
    repoRoot = join(process.cwd(), "Zenkai Website");
  } else if (existsSync(join(process.cwd(), "backend"))) {
    repoRoot = process.cwd();
  }
}

const backendDir = join(repoRoot, "backend");
const frontendDir = join(repoRoot, "frontend");
const freePortScript = join(repoRoot, "scripts", "free-port.js");

console.log("\x1b[1;36m==================================================\x1b[0m");
console.log("\x1b[1;35m⚡ Zenkai Web Full-Stack Dev Server\x1b[0m");
console.log("\x1b[1;36m==================================================\x1b[0m");
console.log(`📂 Repository Root: \x1b[33m${repoRoot}\x1b[0m`);

// Step 1: Free ports 4000 and 3000 before boot
if (existsSync(freePortScript)) {
  try {
    const { execSync } = await import("node:child_process");
    execSync(`node "${freePortScript}" 4000 3000`, { stdio: "ignore" });
  } catch {
    // Ignore port cleanup error if already free
  }
}

let backendProc = null;
let frontendProc = null;
let shuttingDown = false;

function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n\x1b[1;33m🛑 Shutting down Zenkai dev servers...\x1b[0m");

  if (backendProc && !backendProc.killed) {
    try {
      process.kill(-backendProc.pid, "SIGTERM");
    } catch {
      backendProc.kill("SIGTERM");
    }
  }

  if (frontendProc && !frontendProc.killed) {
    try {
      process.kill(-frontendProc.pid, "SIGTERM");
    } catch {
      frontendProc.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(0), 1000);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);

// Step 2: Start Backend
console.log("\x1b[36m🚀 Starting Backend Fastify API (port 4000)...\x1b[0m");
backendProc = spawn("npm", ["run", "dev"], {
  cwd: backendDir,
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
  detached: true,
  env: { ...process.env, PORT: "4000" },
});

backendProc.stdout.on("data", (data) => {
  const lines = data.toString().split("\n");
  for (const line of lines) {
    if (line.trim()) {
      console.log(`\x1b[36m[backend]\x1b[0m ${line}`);
    }
  }
});

backendProc.stderr.on("data", (data) => {
  const lines = data.toString().split("\n");
  for (const line of lines) {
    if (line.trim()) {
      console.error(`\x1b[31m[backend-err]\x1b[0m ${line}`);
    }
  }
});

backendProc.on("exit", (code) => {
  if (!shuttingDown) {
    console.error(`\x1b[31m[backend] exited with code ${code}\x1b[0m`);
    cleanup();
  }
});

// Step 3: Start Frontend
console.log("\x1b[35m🌐 Starting Frontend Next.js Web App (port 3000)...\x1b[0m");
frontendProc = spawn("npm", ["run", "dev"], {
  cwd: frontendDir,
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
  detached: true,
  env: { ...process.env, PORT: "3000" },
});

frontendProc.stdout.on("data", (data) => {
  const lines = data.toString().split("\n");
  for (const line of lines) {
    if (line.trim()) {
      console.log(`\x1b[35m[frontend]\x1b[0m ${line}`);
    }
  }
});

frontendProc.stderr.on("data", (data) => {
  const lines = data.toString().split("\n");
  for (const line of lines) {
    if (line.trim()) {
      console.error(`\x1b[31m[frontend-err]\x1b[0m ${line}`);
    }
  }
});

frontendProc.on("exit", (code) => {
  if (!shuttingDown) {
    console.error(`\x1b[31m[frontend] exited with code ${code}\x1b[0m`);
    cleanup();
  }
});

console.log("\x1b[1;32m✨ Zenkai Services Launching:\x1b[0m");
console.log("   • Web App:     \x1b[1;34mhttp://localhost:3000\x1b[0m");
console.log("   • Backend API: \x1b[1;34mhttp://localhost:4000\x1b[0m");
console.log("   • Health API:  \x1b[1;34mhttp://localhost:4000/health\x1b[0m");
console.log("\x1b[90m(Press Ctrl+C to stop all servers cleanly)\x1b[0m\n");
