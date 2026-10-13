/**
 * Server entrypoint.
 *
 * Boot order matters: config is validated at import, the database is waited for,
 * then the app is built. Starting the listener before the database is reachable
 * would accept traffic this process cannot serve.
 *
 * Shutdown is explicit rather than signal-handler-only, because the database pool
 * holds sockets; without an ordered close, `npm run dev` leaks a connection pool
 * on every restart.
 */

import type { FastifyInstance } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "./config/index.js";
import { getApp, default as appHandler } from "./app.js";
import { errorMessage } from "./http/errors.js";

export { getApp };

async function main(): Promise<void> {
  const app = await getApp();

  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`🚀 Zenkai Backend API running at http://${config.HOST}:${config.PORT}`);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      console.error("[zenkai] shutdown failed:", errorMessage(error));
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    app.log.error({ err: reason }, "unhandled rejection");
  });
}

// In local / standalone environments, start listener immediately
if (!process.env.VERCEL) {
  main().catch((error) => {
    console.error("[zenkai] failed to start:", errorMessage(error));
    process.exit(1);
  });
}

// In Vercel serverless environments, export handler
Object.assign(appHandler, { default: appHandler, handler: appHandler, getApp });
export const handler = appHandler;
export default appHandler;