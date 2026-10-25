// npx tsx classes.test.ts
import assert from "node:assert/strict";
import { groupConcepts, rankMatches, TOPIC_SAME, TOPIC_UNRELATED, topicScore } from "./classes.ts";
import type { Pack } from "./game-routes.ts";

const m = (id: string, theme: string | null = "sports", ready = true) => ({ id, theme, ready });
const me = m("me");

// The world is the interest: same world first, then whoever is ready; no world yet scores 0
let r = rankMatches(me, [m("other", "fantasy"), m("waiting", "sports", false), m("new", null), m("same")]);
assert.deepEqual(r.map((x) => x.m.id), ["same", "waiting", "other", "new"]);
assert.equal(r[0].score, 1);
assert.equal(r[2].score, 0);

// Free agents: world and subject weigh the same, so a same-subject player in the other world
// ties a same-world player studying something unrelated
assert.equal(topicScore(0.6), 0);
assert(Math.abs(topicScore((TOPIC_UNRELATED + TOPIC_SAME) / 2) - 0.5) < 1e-9);
assert.equal(topicScore(0.99), 1);
const t = (id: string, theme: string, cosine: number | null) => ({ ...m(id, theme), topic: cosine });
r = rankMatches(me, [t("unrelated", "sports", 0.7), t("subject", "fantasy", 0.93), t("none", "fantasy", null), t("related", "sports", 0.85), t("both", "sports", 0.93)]);
assert.deepEqual(r.map((x) => x.m.id), ["both", "related", "unrelated", "subject", "none"]);
assert.equal(r[0].score, 1);
assert.equal(r[2].score, 0.5);
assert.equal(r[3].score, 0.5);
assert.equal(r[2].topic, 0);
assert.equal(r[4].topic, null);

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
