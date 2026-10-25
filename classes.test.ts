// npx tsx classes.test.ts
import assert from "node:assert/strict";
import { groupConcepts, rankMatches, topicScore } from "./classes.ts";
import type { Pack } from "./game-routes.ts";

const m = (id: string, interests: string[], theme: string | null = "sports", ready = true) => ({ id, interests, theme, ready });
const me = m("me", ["basketball", "anime", "cooking"]);

// More shared interests rank first, with the shared tags listed
let r = rankMatches(me, [m("a", ["chess"]), m("b", ["anime", "cooking"]), m("c", ["basketball", "chess"])]);
assert.deepEqual(r.map((x) => x.m.id), ["b", "c", "a"]);
assert.deepEqual(r[0].shared, ["anime", "cooking"]);
assert.equal(r[0].score, 2 / 3);
assert.equal(r[2].score, 0);

// Ties go to the same world, then to classmates who are ready
r = rankMatches(me, [m("x", ["anime"], "fantasy"), m("y", ["anime"], "sports", false), m("z", ["anime"], "sports")]);
assert.deepEqual(r.map((x) => x.m.id), ["z", "y", "x"]);

// Free agents: topic similarity is averaged in, so a same-subject stranger beats a same-hobby one
assert.equal(topicScore(0.6), 0);
assert.equal(topicScore(0.85), 0.5);
assert.equal(topicScore(0.99), 1);
const t = (id: string, interests: string[], cosine: number | null) => ({ ...m(id, interests), topic: cosine });
r = rankMatches(me, [t("hobby", ["anime", "cooking", "basketball"], 0.74), t("subject", ["anime"], 0.93), t("none", ["chess"], null)]);
assert.deepEqual(r.map((x) => x.m.id), ["subject", "hobby", "none"]);
assert.equal(r[0].score, (1 / 3 + topicScore(0.93)) / 2);
assert.equal(r[1].topic, 0);
assert.equal(r[2].topic, null);

// Key concepts: the group's weakest tested subtopics; untested ones last; ties keep pack order
const pack = {
  subtopics: ["A", "B", "C", "D"].map((name, i) => ({ id: `s${i}`, name, lesson: `${name} lesson`, analogy: `${name} analogy` })),
  questions: [{ id: "s1q0", subtopic: "s1", explanation: "B fact 1" }, { id: "s1q1", subtopic: "s1", explanation: "B fact 2" }],
} as unknown as Pack;
let c = groupConcepts(pack, { A: 0.9, B: 0.2, D: 0.5 });
assert.deepEqual(c.filter((x) => x.is_key).map((x) => x.name), ["B", "D"]);
assert.deepEqual(c[1], { name: "B", is_key: true, analogy: "B analogy", explanation: "B lesson", key_points: ["B fact 1", "B fact 2"] });
c = groupConcepts(pack, {});
assert.deepEqual(c.filter((x) => x.is_key).map((x) => x.name), ["A", "B"]);

console.log("classes tests passed");
