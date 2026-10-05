/**
 * Database seed script.
 *
 * Seeds the database with initial data for development and testing.
 * Safe to run multiple times — uses upserts.
 */
import "dotenv/config";
import postgres from "postgres";

const url =
  process.env.DATABASE_URL ??
  "postgresql://zenkai:zenkai_password@localhost:5432/zenkai_db?sslmode=disable";

async function main() {
  const sql = postgres(url, { max: 1 });

  try {
    // Seed goes here when needed for development.
    console.log("Database seed complete.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
