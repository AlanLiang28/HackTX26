// Dev only: a demo session + 2 players so the boss fight UI can be built without part 1.
// npx tsx seed-boss.ts     (prints shell lines: eval "$(npx tsx seed-boss.ts)")
import pg from "pg";

process.loadEnvFile();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL!.split("?")[0],
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const content = {
  concepts: [
    {
      name: "Linked list",
      is_key: true,
      analogy: "A treasure hunt: each clue holds some loot and tells you where the next clue is buried.",
      explanation: "A linked list is a sequence of nodes where each node stores a value and a pointer to the next node, so you reach items by following pointers from the head.",
      breaks_down_when: "Real treasure hunts don't let you insert a new clue in the middle for free.",
      key_points: [
        "each node stores a value and a pointer to the next node",
        "you start at the head and follow pointers to reach an item",
        "inserting or deleting at a known node is O(1), finding an item is O(n)",
      ],
    },
    {
      name: "Hash table",
      is_key: true,
      analogy: "A ship's lockers: the captain's rule turns each sailor's name straight into a locker number.",
      explanation: "A hash table uses a hash function to turn a key into an array index, giving average O(1) lookups, and handles collisions when two keys map to the same index.",
      breaks_down_when: "Real lockers never have two sailors assigned to the same one.",
      key_points: [
        "a hash function maps a key to an array index",
        "average lookup, insert and delete are O(1)",
        "collisions happen when two keys hash to the same index and must be handled (chaining or probing)",
      ],
    },
    {
      name: "Array",
      is_key: false,
      analogy: "Cannons in a row on the deck, each with a painted number.",
      explanation: "An array stores elements in contiguous memory, so any element can be read by index in O(1).",
      breaks_down_when: "You can't bolt a new cannon between two others without moving the rest.",
      key_points: ["contiguous memory", "O(1) access by index"],
    },
  ],
};

const code = Math.random().toString(36).slice(2, 8).toUpperCase();
const { rows: [session] } = await client.query(
  "INSERT INTO sessions (share_code, theme, level, content) VALUES ($1, $2, $3, $4) RETURNING id",
  [code, "Pirates", "intro college CS", content]
);
// Separate inserts so joined_at (roster order) differs.
const ids: string[] = [];
for (const name of ["Ada", "Linus"]) {
  const { rows: [p] } = await client.query(
    "INSERT INTO players (session_id, name) VALUES ($1, $2) RETURNING id", [session.id, name]
  );
  ids.push(p.id);
}

console.log(`CODE=${code}\nP1=${ids[0]}\nP2=${ids[1]}`);
await client.end();
