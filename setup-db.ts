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

// Part 1 tables (created here too if part 1 hasn't run yet; keep identical to docs/part3-boss-fight.md)
await client.query(`
  CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_code TEXT UNIQUE NOT NULL,
    theme TEXT NOT NULL,
    level TEXT,
    use_web BOOLEAN DEFAULT false,
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    name TEXT NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW()
  );
`);

// Part 3: boss fight. State is derived from the attempt log, so no turn/HP columns.
await client.query(`
  CREATE TABLE IF NOT EXISTS boss_fights (
    session_id UUID PRIMARY KEY REFERENCES sessions(id),
    status TEXT NOT NULL DEFAULT 'active',      -- 'active' | 'defeated'
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    defeated_at TIMESTAMPTZ
  );
  -- No standalone PRIMARY KEY: hypertables require the time column in any unique index.
  CREATE TABLE IF NOT EXISTS boss_attempts (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    player_id UUID NOT NULL,
    concept TEXT NOT NULL,
    transcript TEXT NOT NULL,
    rubric JSONB NOT NULL,
    total INT NOT NULL,          -- 0-16
    passed BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);
await client.query(
  "SELECT create_hypertable('boss_attempts', by_range('created_at'), if_not_exists => TRUE)"
);

console.log("Tables 'sessions', 'players', 'boss_fights', 'boss_attempts' are ready.");
await client.end();