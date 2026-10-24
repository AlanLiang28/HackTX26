// Run once to create the table:  npx tsx setup-db.ts
import pg from "pg";

process.loadEnvFile();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL!.split("?")[0],
  ssl: { rejectUnauthorized: false },
});

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS explanations (
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    topic TEXT NOT NULL,
    interest TEXT NOT NULL,
    level TEXT,
    content JSONB NOT NULL
  )
`);

// Hypertable: Tiger Data's time-series table type
await client.query(
  "SELECT create_hypertable('explanations', by_range('created_at'), if_not_exists => TRUE)"
);

console.log("Table 'explanations' is ready.");
await client.end();