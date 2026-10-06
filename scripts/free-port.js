import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = process.argv[2];
if (!port) {
  console.error("[Zenkai Dev] ❌ Error: Missing port parameter.");
  process.exit(1);
}

const rootDir = path.resolve(__dirname, "..");
const logDir = path.join(rootDir, "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, "dev-server.log");

// Helper to log with timestamp
function log(message, level = "INFO") {
  const timestamp = new Date().toLocaleString("en-US", { timeZoneName: "short" });
  const entry = `[${timestamp}] [${level}] ${message}\n`;
  fs.appendFileSync(logFile, entry);
  console.log(`[Zenkai Dev] ${message}`);
}

// Known sibling servers: maps port -> { name, pidCommand }
const siblingServers = {
  3000: { name: "frontend", port: 3000, pidCmd: "lsof -t -i:3000 2>/dev/null || fuser 3000/tcp 2>/dev/null" },
  4000: { name: "backend", port: 4000, pidCmd: "lsof -t -i:4000 2>/dev/null || fuser 4000/tcp 2>/dev/null" },
};

// Keywords that identify Zenkai dev servers (to avoid killing unrelated processes)
const ZENKAI_SERVER_INDICATORS = [
  /next[\s-]*server/i,       // next-server process (production or dev)
  /next\s+dev/i,            // next dev command
  /tsx\s+/i,                // tsx watch/run
  /tsx\s+--watch/i,
  /node.*dist\/index/i,     // built backend
  /node.*src\/index/i,      // dev backend
  /node.*--import.*tsx/i,   // tsx loader
];

const currentServer = siblingServers[port];
if (!currentServer) {
  log(`Unknown server port ${port}. Only 3000 (frontend) and 4000 (backend) are supported.`, "WARN");
}

const siblingPort = port === "3000" ? "4000" : "3000";
const sibling = siblingServers[siblingPort];

log(`🚀 Starting ${currentServer?.name || "server"} on port ${port}...`);

// Function to get PIDs for a port
function getPidsForPort(p, pidCmd) {
  try {
    const output = execSync(pidCmd, { encoding: "utf8" }).trim();
    if (!output) return [];
    return output.split(/\s+/).filter(Boolean).map(Number).filter(Boolean);
  } catch {
    return [];
  }
}

// Check if a process is a Zenkai dev server
function isZenkaiServer(pid) {
  try {
    const psOutput = execSync(`ps -p ${pid} -o args --no-headers 2>/dev/null`, { encoding: "utf8" }).trim();
    return ZENKAI_SERVER_INDICATORS.some(pattern => {
      if (pattern instanceof RegExp) {
        return pattern.test(psOutput);
      }
      return new RegExp(pattern, "i").test(psOutput);
    });
  } catch {
    return false;
  }
}

// Check and free current port (only kills Zenkai servers, not random processes)
function freePort(p, name, pidCmd, isCurrentServer = false) {
  const pids = getPidsForPort(p, pidCmd);
  
  if (pids.length === 0) {
    log(`✅ Port ${p} is clean (no existing process)`);
    return [];
  }
  
  const uniquePids = [...new Set(pids)];
  log(`🧹 Found ${uniquePids.length} process(es) on port ${p} (PID: ${uniquePids.join(", ")})`);
  
  // Get process info and filter to only Zenkai servers (unless it's the current server we're starting)
  const zenkaiPids = [];
  const nonZenkaiPids = [];
  
  for (const pid of uniquePids) {
    const isZenkai = isZenkaiServer(pid);
    
    try {
      const psOutput = execSync(`ps -p ${pid} -o pid,comm,args --no-headers 2>/dev/null`, { encoding: "utf8" }).trim();
      if (isZenkai || isCurrentServer) {
        zenkaiPids.push(pid);
        log(`  🎯 Zenkai server: ${psOutput || '(unknown)'}`, "INFO");
      } else {
        nonZenkaiPids.push(pid);
        log(`  ⏭️  Skipped (not a Zenkai server): ${psOutput || '(unknown)'}`, "INFO");
      }
    } catch {
      if (isCurrentServer) {
        zenkaiPids.push(pid);
        log(`  🎯 PID: ${pid} (could not retrieve details, treating as target)`, "INFO");
      } else {
        nonZenkaiPids.push(pid);
        log(`  ⏭️  Skipped PID: ${pid} (could not verify, not killing)`, "INFO");
      }
    }
  }
  
  if (nonZenkaiPids.length > 0 && !isCurrentServer) {
    log(`\n⚠️  Found ${nonZenkaiPids.length} non-Zenkai process(es) on port ${p} — NOT killing them.`, "WARN");
    log(`   If port ${p} is blocked, kill them manually or use a different port.`, "WARN");
  }
  
  // Kill only the Zenkai (or current server) processes
  if (zenkaiPids.length > 0) {
    try {
      execSync(`kill -9 ${zenkaiPids.join(" ")} 2>/dev/null || true`, { stdio: "ignore" });
      log(`\n✅ Killed ${zenkaiPids.length} Zenkai process(es) on port ${p} (PID: ${zenkaiPids.join(", ")})`);
      return zenkaiPids;
    } catch (err) {
      log(`⚠️ Failed to kill some processes on port ${p}: ${err.message}`, "WARN");
      return zenkaiPids.filter(pid => {
        try {
          execSync(`kill -0 ${pid} 2>/dev/null`, { stdio: "ignore" });
          return false;
        } catch {
          return true;
        }
      });
    }
  }
  
  log(`\nℹ️ No Zenkai servers found on port ${p} to kill.`);
  return [];
}

// Free the current port (allow killing regardless of process type since we're starting this server)
const currentKilled = freePort(port, currentServer?.name || "server", currentServer?.pidCmd || "", true);

// Free the sibling server port if it exists (only kill Zenkai servers)
if (sibling) {
  log(`\n🔍 Checking sibling server (${sibling.name}) on port ${sibling.port}...`);
  const siblingKilled = freePort(sibling.port, sibling.name, sibling.pidCmd, false);
  
  if (siblingKilled.length > 0) {
    log(`\n⚠️  ${sibling.name} server was killed to prevent conflicts with ${currentServer?.name || "this"} server.`, "WARN");
    log(`   Start the ${sibling.name} server separately when needed: cd ${sibling.port === "3000" ? "frontend" : "backend"} && npm run dev`, "WARN");
  }
}

log(`\n✨ Ready to start ${currentServer?.name || "server"} on port ${port}`);
