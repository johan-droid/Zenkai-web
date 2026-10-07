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

import { config } from "./config/index.js";
import { buildApp } from "./app.js";
import { createResources, waitForDatabase } from "./db/client.js";
import { errorMessage } from "./http/errors.js";

async function main(): Promise<void> {
  const resources = await createResources();
  const databaseReady = await waitForDatabase(resources.db, 2_000);

  if (!databaseReady) {
    // Not fatal: the server still starts so /health can report `degraded`, which
    // is more useful than a crash loop when Postgres is merely slow to boot
    // alongside this container.
    console.warn(
      "[zenkai] database not reachable at boot; starting degraded and reporting via /health",
    );
  }

  const app = await buildApp({ db: resources.db });

  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`🚀 Zenkai Backend API running at http://${config.HOST}:${config.PORT}`);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    try {
      // Close the listener first so no new request starts mid-teardown.
      await app.close();
      await resources.close();
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

main().catch((error) => {
  console.error("[zenkai] failed to start:", errorMessage(error));
  process.exit(1);
});