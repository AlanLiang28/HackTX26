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

// Classes (classes.ts, docs/classes.md). A matched group IS a sessions row, so boss.ts runs it unchanged.
await client.query(`
  CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    teacher_name TEXT NOT NULL,
    teacher_token TEXT NOT NULL,
    material TEXT NOT NULL,
    level TEXT,
    packs JSONB NOT NULL DEFAULT '{}',   -- { fantasy?, sports? } game packs incl. answer keys: server-side only
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS class_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id),
    name TEXT NOT NULL,
    theme TEXT,                          -- last world played: 'sports' | 'fantasy'
    ready_at TIMESTAMPTZ,                -- finished phase 1 (reached the boss)
    session_id UUID REFERENCES sessions(id),  -- their group; null until matched
    player_id UUID REFERENCES players(id),    -- their id in that group's boss fight
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id);
  -- Phase 1 answer log. Hypertable, same reason as boss_attempts.
  CREATE TABLE IF NOT EXISTS class_answers (
    class_id UUID NOT NULL,
    member_id UUID NOT NULL,
    subtopic TEXT NOT NULL,
    correct BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);
await client.query(
  "SELECT create_hypertable('class_answers', by_range('created_at'), if_not_exists => TRUE)"
);

// Free agents: class_members rows with no class. They bring their own material (pack), and pgvector
// matches them on topic. Written as ALTERs so databases made before free agents upgrade too.
await client.query(`
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE class_members ALTER COLUMN class_id DROP NOT NULL;
  ALTER TABLE class_members ADD COLUMN IF NOT EXISTS pack JSONB;                -- free agents only
  ALTER TABLE class_members ADD COLUMN IF NOT EXISTS topic_embedding vector(768); -- free agents only
  ALTER TABLE class_answers ALTER COLUMN class_id DROP NOT NULL;
`);

console.log("Tables 'classes', 'class_members', 'class_answers' are ready (with free agents).");

// Friends and chat (friends.ts). token is each player's secret: member ids show up in match lists, tokens never do.
// A friendship is two `friends` rows, one per direction; a lone row is a request the other player hasn't accepted.
await client.query(`
  ALTER TABLE class_members ADD COLUMN IF NOT EXISTS token UUID NOT NULL DEFAULT gen_random_uuid();
  CREATE TABLE IF NOT EXISTS friends (
    member_id UUID NOT NULL REFERENCES class_members(id),
    friend_id UUID NOT NULL REFERENCES class_members(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (member_id, friend_id)
  );
  -- Hypertable, same reason as boss_attempts.
  CREATE TABLE IF NOT EXISTS messages (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    from_id UUID NOT NULL,
    to_id UUID NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);
await client.query(
  "SELECT create_hypertable('messages', by_range('created_at'), if_not_exists => TRUE)"
);

console.log("Tables 'friends', 'messages' are ready.");
await client.end();