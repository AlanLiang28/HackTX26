// npx tsx boss.test.ts
import assert from "node:assert/strict";
import { computeState, isPass, type Attempt, type Concept, type Rubric } from "./boss.ts";

const roster = [{ id: "a", name: "Ada" }, { id: "b", name: "Bo" }];
const concept = (name: string): Concept => ({ name, analogy: `${name} analogy`, explanation: "", key_points: [] });
const keyConcepts = [concept("X"), concept("Y")];
const att = (player_id: string, c: string, total: number, passed: boolean): Attempt => ({ player_id, concept: c, total, passed });
const state = (...attempts: Attempt[]) => computeState({ roster, keyConcepts, attempts });

// No attempts -> player 0, key concept 0
let s = state();
assert.equal(s.status, "active");
assert.deepEqual(s.turn, { playerId: "a", playerName: "Ada", concept: { name: "X", analogy: "X analogy" }, attempt: 1, reason: "unpassed" });
assert.equal(s.hp, 100);

// Failed attempt -> same player and concept retry
s = state(att("a", "X", 8, false));
assert.equal(s.turn?.playerId, "a");
assert.equal(s.turn?.concept.name, "X");
assert.equal(s.turn?.attempt, 2);

// Passed attempt -> rotates to the next player with an unpassed pair
s = state(att("a", "X", 12, true));
assert.equal(s.turn?.playerId, "b");
assert.equal(s.turn?.concept.name, "X");
assert.equal(s.hp, 75);
s = state(att("a", "X", 12, true), att("b", "X", 12, true), att("b", "Y", 12, true));
assert.equal(s.turn?.playerId, "a");           // wraps around
assert.equal(s.turn?.concept.name, "Y");
s = state(att("a", "X", 12, true), att("a", "Y", 12, true), att("b", "X", 12, true));
assert.equal(s.turn?.playerId, "b");           // a is done, so b goes again
assert.equal(s.turn?.concept.name, "Y");

// All passed, low average -> rally on the lowest pair (tie -> earliest player, then concept), hp floored at 5
s = state(att("a", "X", 11, true), att("b", "X", 11, true), att("a", "Y", 12, true), att("b", "Y", 11, true));
assert.ok(s.teamAverage < 0.75);
assert.equal(s.status, "active");
assert.equal(s.turn?.reason, "rally");
assert.equal(s.turn?.playerId, "a");
assert.equal(s.turn?.concept.name, "X");
assert.equal(s.turn?.attempt, 2);
assert.equal(s.hp, 5);

// All passed, high average -> defeated
s = state(att("a", "X", 14, true), att("b", "X", 14, true), att("a", "Y", 14, true), att("b", "Y", 14, true));
assert.equal(s.status, "defeated");
assert.equal(s.turn, null);
assert.equal(s.hp, 0);

// isPass: correctness gates
const rubric = (correctness: number, depth: number, understanding: number, clarity: number): Rubric =>
  ({ correctness, depth, understanding, clarity, keyPointsHit: [], missedPoints: [], misconception: null, feedback: "" });
assert.equal(isPass(rubric(2, 4, 4, 4)), false);
assert.equal(isPass(rubric(3, 3, 3, 2)), true);

console.log("boss.test.ts: all passed");
