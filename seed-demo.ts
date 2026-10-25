// Demo data for the video: professors, classes, students, free agents, groups and boss fights on Tiger Data.
//   npx tsx seed-demo.ts           wipe the previous demo data and seed it fresh. Re-run right before recording:
//                                  free agents are only suggested for 3 hours after they sign up.
//   npx tsx seed-demo.ts --clean   only wipe it.
// The data comes from running the app's own logic on fake people (adaptive phase 1, rankMatches, computeState),
// so it's consistent. Game packs are generated once with the real model and cached in seed-demo-packs.json,
// so re-runs are instant. Ids are deterministic, so personas keep their ids across re-runs.
import pg from "pg";
import { GoogleGenAI } from "@google/genai";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePack, type Pack } from "./game-routes.ts";
import { groupConcepts, rankMatches } from "./classes.ts";
import { computeState, isPass, type Concept, type Rubric } from "./boss.ts";
import { interestFor } from "./src/lib/adaptive.ts";

process.loadEnvFile();
type Theme = "sports" | "fantasy";

// ---------- Study notes ----------
const NOTES: Record<string, string> = {
  bio: "Cell structure and function. Cells are the basic unit of life. Prokaryotic cells (bacteria) lack a nucleus and membrane-bound organelles; eukaryotic cells (plants, animals, fungi) have both. The nucleus stores DNA and controls gene expression, and the nucleolus builds ribosome subunits. Ribosomes translate mRNA into proteins, either free in the cytoplasm or attached to the rough endoplasmic reticulum, which folds proteins and ships them on. The smooth ER makes lipids and breaks down toxins. The Golgi apparatus modifies, sorts and packages proteins into vesicles. Mitochondria carry out cellular respiration, turning glucose and oxygen into ATP, and they have their own DNA. Lysosomes use enzymes to digest worn-out parts and debris. The plasma membrane is a phospholipid bilayer with embedded proteins, and it is selectively permeable. Passive transport (diffusion, osmosis and facilitated diffusion) moves substances down their concentration gradient without energy. Active transport uses ATP to move substances against their gradient, like the sodium-potassium pump. Plant cells also have a cellulose cell wall, chloroplasts for photosynthesis, and a large central vacuole.",
  cs: "Data structures. An array stores elements in contiguous memory, so reading any index is O(1), but inserting in the middle is O(n) because later elements must shift. A linked list stores nodes that each hold a value and a pointer to the next node; inserting after a known node is O(1), but finding an element is O(n). A stack is last-in, first-out: push and pop happen at the top in O(1), and the call stack and undo features are stacks. A queue is first-in, first-out: enqueue at the back and dequeue at the front; breadth-first search and printer queues use queues. A hash table uses a hash function to map keys to array indices, giving average O(1) insert, lookup and delete. Collisions are handled by chaining or open addressing, and the table resizes when the load factor gets too high. A binary search tree keeps smaller keys on the left and larger keys on the right, so search, insert and delete are O(log n) when the tree is balanced but O(n) when it degenerates into a line. Big-O notation describes how running time grows with input size, ignoring constant factors.",
  econ: "Supply, demand and markets. Demand is how much buyers want at each price; the law of demand says quantity demanded falls as price rises. Supply is how much sellers offer at each price; quantity supplied rises with price. Market equilibrium is where the supply and demand curves cross, the price at which quantity supplied equals quantity demanded. A change in income, tastes or the price of a related good shifts the whole demand curve and changes the equilibrium price and quantity; a change in the good's own price only moves along the curve. Price elasticity of demand measures how strongly quantity demanded responds to price. Elastic goods, like luxuries and goods with many substitutes, respond a lot; inelastic goods, like insulin or gasoline in the short run, respond little. A price ceiling below equilibrium, like rent control, causes a shortage. A price floor above equilibrium, like a minimum wage, can cause a surplus. Consumer surplus is the gap between what buyers are willing to pay and what they actually pay; producer surplus is the gap between the price and the sellers' costs.",
  hist: "World War II. The Treaty of Versailles (1919) blamed Germany for World War I, imposed heavy reparations and took territory, fueling the resentment that helped the Nazi Party rise during the Great Depression. In the 1930s Britain and France followed appeasement, letting Hitler remilitarize the Rhineland, annex Austria and take the Sudetenland at the Munich Conference in 1938. Germany invaded Poland on September 1, 1939, and Britain and France declared war. Blitzkrieg, or lightning war, combined tanks, aircraft and fast infantry to overwhelm defenses, and France fell in six weeks in 1940. The Battle of Britain was the first major campaign fought entirely in the air, and the RAF's victory stopped a German invasion. Germany invaded the Soviet Union in 1941, and the Soviet victory at Stalingrad in 1943 turned the tide in the east. Japan's attack on Pearl Harbor on December 7, 1941 brought the United States into the war. On D-Day, June 6, 1944, Allied forces landed in Normandy and opened a western front. Germany surrendered in May 1945, and Japan surrendered in August 1945 after the atomic bombings of Hiroshima and Nagasaki.",
  cells2: "Organelles cheat sheet for the bio midterm. Cell theory: all living things are made of cells, cells are the basic unit of life, and all cells come from existing cells. Mitochondria are the powerhouse of the cell: aerobic respiration makes about 30 to 32 ATP per glucose, and the folds of the inner membrane are called cristae. Chloroplasts are only in plants and algae. The endomembrane system (nuclear envelope, rough ER, Golgi, vesicles and lysosomes) works like one shipping line for proteins. Membrane transport: osmosis is water moving toward the side with more solute. Hypertonic solutions shrink cells and hypotonic solutions make them swell. Facilitated diffusion uses channel or carrier proteins but no ATP. Endocytosis and exocytosis move large particles in and out of the cell inside vesicles.",
  photo: "Photosynthesis. Photosynthesis converts light energy into chemical energy stored in glucose: 6CO2 + 6H2O + light → C6H12O6 + 6O2. It happens in chloroplasts. The light-dependent reactions take place in the thylakoid membranes: chlorophyll absorbs mostly red and blue light, water is split, oxygen is released, and the energy is stored in ATP and NADPH. The Calvin cycle takes place in the stroma: the enzyme RuBisCO fixes carbon dioxide, and ATP and NADPH from the light reactions turn it into sugar. Stomata on leaves let carbon dioxide in and oxygen out, but they also lose water, so plants close them in hot, dry weather. Light intensity, carbon dioxide concentration and temperature all limit the rate of photosynthesis.",
  algo: "Algorithms exam review. A heap is a complete binary tree where every parent is smaller than its children (a min-heap); insert and remove-min are O(log n), and heaps back priority queues. A graph is a set of vertices connected by edges, stored as an adjacency list or an adjacency matrix. Breadth-first search uses a queue and finds shortest paths in unweighted graphs; depth-first search uses a stack or recursion. Dijkstra's algorithm finds shortest paths with non-negative edge weights using a priority queue. Hash maps give average O(1) lookups, but a bad hash function causes many collisions and O(n) worst-case lookups. Merge sort is O(n log n) and stable; quicksort is O(n log n) on average but O(n squared) in the worst case.",
  markets: "Market structures and game theory. In perfect competition, many firms sell identical products and are price takers, so long-run economic profit is zero. A monopoly is the only seller; it produces where marginal revenue equals marginal cost, charges a higher price for a lower quantity, and creates deadweight loss. An oligopoly is a few large firms whose decisions depend on each other, which game theory models. In the prisoner's dilemma, each player's dominant strategy leads to a worse outcome for both. A Nash equilibrium is a set of strategies where no player can gain by changing only their own choice. Monopolistic competition has many firms selling differentiated products, like restaurants or clothing brands.",
  spanish: "Spanish: preterite vs. imperfect. The preterite describes completed actions at a specific time: Ayer comí pizza. The imperfect describes ongoing or habitual past actions, descriptions, the time and age: Cuando era niño, jugaba al fútbol. Trigger words like ayer, anoche and el año pasado point to the preterite; siempre, todos los días and mientras point to the imperfect. Irregular preterite stems include tener → tuv-, estar → estuv- and hacer → hic-. Ser and ir share the same preterite forms: fui, fuiste, fue. In the imperfect, only ser, ir and ver are irregular. When one action interrupts another, the interrupting action is preterite and the background action is imperfect: Leía cuando sonó el teléfono.",
};
// The subtopic each class finds hardest, so the teacher dashboard has a clear weak spot to show.
const HARD: Record<string, RegExp> = {
  bio: /transport|osmosis|diffusion|membrane/i, cs: /hash/i, econ: /elastic/i, hist: /appease|versailles|munich/i,
  cells2: /osmosis|transport|tonic/i, photo: /calvin|stroma/i, algo: /dijkstra|graph|heap/i,
  markets: /nash|game|dilemma/i, spanish: /imperfect|irregular/i,
};

const CLASSES = [
  { code: "BIO101", name: "BIO 101: Cell Biology", teacher: "Dr. Maya Okafor", level: "intro college", notes: "bio", size: 16 },
  { code: "CS1332", name: "CS 1332: Data Structures", teacher: "Prof. Daniel Reyes", level: "intro college", notes: "cs", size: 13 },
  { code: "ECO304", name: "ECO 304: Microeconomics", teacher: "Dr. Priya Shah", level: "intro college", notes: "econ", size: 11 },
  { code: "HIS315", name: "HIS 315: World War II", teacher: "Prof. Henry Walsh", level: "high school", notes: "hist", size: 10 },
];
// Free agents' own notes, and the worlds they play them in.
const FREE_NOTES: Record<string, Theme[]> = {
  cells2: ["sports", "fantasy"], bio: ["fantasy"], photo: ["sports"], algo: ["fantasy"], markets: ["sports"], spanish: ["sports"], hist: ["fantasy"],
};

type Persona = { name: string; interests: string[]; theme: Theme; state: "ready" | "progress"; notes?: string; team?: string };
// Hand-placed people for the video. Everyone else is generated.
const BIO_PERSONAS: Persona[] = [
  { name: "Jordan Lee", interests: ["basketball", "anime", "cooking"], theme: "sports", state: "ready" },  // match live
  { name: "Marcus Green", interests: ["basketball", "gaming", "music"], theme: "sports", state: "ready" },
  { name: "Aiko Tanaka", interests: ["anime", "cooking", "art"], theme: "fantasy", state: "ready" },
  { name: "Leo Martins", interests: ["anime", "basketball"], theme: "fantasy", state: "progress" },
  { name: "Zoe Adams", interests: ["music", "art", "photography"], theme: "fantasy", state: "ready", team: "zoe" },
  { name: "Ethan Wright", interests: ["music", "photography", "dance"], theme: "fantasy", state: "ready", team: "zoe" },
];
const FREE_PERSONAS: Persona[] = [
  { name: "Sam Rivera", interests: ["basketball", "anime", "cooking"], theme: "sports", state: "ready", notes: "cells2" }, // match live
  { name: "Mia Chen", interests: ["anime", "cooking", "art"], theme: "fantasy", state: "ready", notes: "bio" }, // same subject, different notes
  { name: "Noah Kim", interests: ["basketball", "cooking"], theme: "sports", state: "ready", notes: "photo" },
  { name: "Elena Garcia", interests: ["basketball", "anime", "cooking"], theme: "sports", state: "ready", notes: "spanish" },
  { name: "Ravi Iyer", interests: ["anime", "gaming"], theme: "fantasy", state: "progress", notes: "algo" },
];
const CLUSTERS = [
  { interests: ["basketball", "soccer", "football", "hiking", "skateboarding"], sports: 0.8 },
  { interests: ["art", "music", "photography", "dance", "fashion"], sports: 0.4 },
  { interests: ["anime", "gaming", "chess", "coding", "reading"], sports: 0.2 },
  { interests: ["cooking", "movies", "music", "k-pop", "travel"], sports: 0.5 },
];
const FIRST = ["Aaliyah", "Aarav", "Abigail", "Adrian", "Amara", "Andre", "Anika", "Ava", "Ben", "Camila", "Carlos", "Chloe", "Daniel", "Diego", "Elijah", "Emma", "Fatima", "Gabriel", "Grace", "Hana", "Hassan", "Isabella", "Isaiah", "Jada", "James", "Jasmine", "Javier", "Kai", "Kayla", "Kenji", "Layla", "Liam", "Lucas", "Maya", "Mateo", "Mei", "Miles", "Nadia", "Naomi", "Nathan", "Nia", "Omar", "Owen", "Paige", "Rafael", "Riley", "Rohan", "Rosa", "Ryan", "Sana", "Sofia", "Tariq", "Tessa", "Theo", "Uma", "Valeria", "Victor", "Wyatt", "Xavier", "Yara", "Yusuf", "Zara", "Zion"];
const LAST = ["Alvarez", "Bennett", "Brooks", "Castillo", "Coleman", "Diaz", "Edwards", "Fernandez", "Foster", "Gupta", "Hayes", "Hernandez", "Hughes", "Jackson", "Johnson", "Kapoor", "Kowalski", "Lopez", "Martin", "Mendoza", "Morales", "Nguyen", "Ortiz", "Park", "Perez", "Quinn", "Ramirez", "Reed", "Rossi", "Santos", "Singh", "Sullivan", "Thompson", "Torres", "Vasquez", "Walker", "Watson", "Williams", "Wong", "Yamamoto", "Young"];

// ---------- Deterministic randomness (mulberry32) ----------
let seed = 20261024;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const shuffle = <T>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = Math.floor(rand() * 16);
  return (c === "x" ? r : (r & 3) | 8).toString(16);
});
const hexCode = () => Array.from({ length: 6 }, () => "0123456789ABCDEF"[int(0, 15)]).join("");
const now = Date.now();
const MIN = 60_000;
const used = new Set([...BIO_PERSONAS, ...FREE_PERSONAS].map((p) => p.name));
function personName() {
  for (;;) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (!used.has(name)) return used.add(name), name;
  }
}
function randomProfile(): Omit<Persona, "state"> {
  const c = pick(CLUSTERS);
  const interests = shuffle(c.interests).slice(0, 2);
  if (rand() < 0.5) interests.push(pick(pick(CLUSTERS).interests));
  return { name: personName(), interests: [...new Set(interests)], theme: rand() < c.sports ? "sports" : "fantasy" };
}

// ---------- Packs (real model, cached) ----------
const CACHE = "seed-demo-packs.json";
const packs: Record<string, Pack> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
async function ensurePacks(specs: { notes: string; theme: Theme; level: string }[]) {
  const todo = [...new Map(specs.map((s) => [`${s.notes}:${s.theme}`, s])).values()].filter((s) => !packs[`${s.notes}:${s.theme}`]);
  if (todo.length) console.log(`Generating ${todo.length} game packs with the real model (~25 s each, 4 at a time)…`);
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async (s) => {
      const key = `${s.notes}:${s.theme}`;
      packs[key] = await generatePack({ topic: "", interest: interestFor(s.theme), level: s.level, material: NOTES[s.notes], playerName: "" });
      writeFileSync(CACHE, JSON.stringify(packs));
      console.log(`  ✓ ${key}: ${packs[key].title}`);
    }));
  }
}

// ---------- Simulations ----------
type Answer = { subtopic: string; correct: boolean; at: number };
type Member = {
  id: string; classId: string | null; name: string; interests: string[]; theme: Theme | null; notes: string;
  joinedAt: number; answers: Answer[]; readyAt: number | null; keepFree: boolean;
  embedding: number[] | null; sessionId: string | null; playerId: string | null;
};

// Phase 1 like game-routes: weakest smoothed proficiency first, 3 lives, 6 encounters, restart on game over.
function playPhase1(pack: Pack, notes: string, start: number, finish: boolean) {
  const hard = pack.subtopics.find((s) => HARD[notes]?.test(`${s.name} ${s.lesson}`))?.name ?? pack.subtopics[1].name;
  const skill = 0.8 + rand() * 0.18;
  const stopAt = finish ? Infinity : int(2, 4);
  const answers: Answer[] = [];
  let t = start + int(1, 5) * MIN;
  for (let run = 0; run < 3; run++) {
    const prof = new Map(pack.subtopics.map((s) => [s.name, { a: 0, c: 0 }]));
    const score = (n: string) => (prof.get(n)!.c + 1) / (prof.get(n)!.a + 2);
    let lives = 3;
    for (let done = 0; done < 6 && lives > 0; done++) {
      if (answers.length >= stopAt) return { answers, readyAt: null };
      const names = [...prof.keys()];
      const low = Math.min(...names.map(score));
      const weakest = names.filter((n) => score(n) === low);
      const fewest = Math.min(...weakest.map((n) => prof.get(n)!.a));
      const sub = pick(weakest.filter((n) => prof.get(n)!.a === fewest));
      const correct = run === 2 || rand() < skill * (sub === hard ? 0.55 : 0.93);
      t += int(40, 120) * 1000;
      answers.push({ subtopic: sub, correct, at: t });
      prof.get(sub)!.a++;
      if (correct) prof.get(sub)!.c++;
      else lives--;
    }
    if (lives > 0) return { answers, readyAt: t };
    t += int(1, 3) * MIN; // game over: they hit "Play again"
  }
  return { answers, readyAt: t };
}

const cosine = (a: number[], b: number[]) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; }
  return d / Math.sqrt(x * y);
};

type Group = {
  id: string; code: string; members: Member[]; pack: Pack; classId: string | null; level: string; formedAt: number;
  boss: "none" | "one_fail" | "active" | "defeated"; concepts?: Concept[]; fight?: ReturnType<typeof playBoss> | null;
};

// Group like the matching screen: each ready, unmatched player picks their best-ranked partner(s).
function autoGroup(pool: Member[], packOf: (m: Member) => Pack, classId: string | null, level: string): Group[] {
  const groups: Group[] = [];
  const free = (m: Member) => !m.sessionId;
  for (const me of shuffle(pool)) {
    if (!free(me) || rand() < 0.3) continue; // some stay unmatched
    const view = (m: Member) => ({ ...m, ready: true, topic: me.embedding && m.embedding ? cosine(me.embedding, m.embedding) : null });
    const ranked = rankMatches(view(me), pool.filter((m) => m !== me && free(m)).map(view)).filter((r) => r.score > 0);
    const partners = ranked.slice(0, rand() < 0.15 ? 3 : rand() < 0.4 ? 2 : 1).map((r) => pool.find((m) => m.id === r.m.id)!);
    if (!partners.length) continue;
    groups.push(makeGroup([me, ...partners], packOf(me), classId, level, pick(["none", "active", "active", "defeated", "defeated"] as const)));
  }
  return groups;
}
function makeGroup(members: Member[], pack: Pack, classId: string | null, level: string, boss: Group["boss"]): Group {
  const id = uuid();
  const formedAt = Math.max(...members.map((m) => m.readyAt!)) + int(1, 15) * MIN;
  for (const m of members) [m.sessionId, m.playerId] = [id, uuid()];
  return { id, code: hexCode(), members, pack, classId, level, formedAt, boss };
}

function rubricFor(pass: boolean, concept: Concept, strong: boolean): Rubric {
  const score = () => (pass ? int(strong ? 3 : 2, 4) : int(1, 3));
  const r = { correctness: pass ? int(3, 4) : int(1, 3), depth: score(), understanding: score(), clarity: score() };
  const total = () => r.correctness + r.depth + r.understanding + r.clarity;
  while (pass && total() < (strong ? 13 : 11)) {
    r.depth = Math.min(4, r.depth + 1);
    r.clarity = Math.min(4, r.clarity + 1);
  }
  while (!pass && r.correctness >= 3 && total() >= 11) r.depth--;
  const points = concept.key_points;
  const hit = pass ? points.slice(0, Math.max(1, points.length - 1)) : points.slice(0, 1);
  const missed = points.filter((p) => !hit.includes(p));
  return {
    ...r, keyPointsHit: hit, missedPoints: missed, misconception: null,
    feedback: pass
      ? `Strong explanation of ${concept.name}. Next time, add a real-world example to make it stick.`
      : `You're close, but you left out a key idea: ${missed[0] ?? concept.explanation} Try explaining that part in your own words.`,
  };
}
function transcriptFor(pass: boolean, concept: Concept) {
  return pass
    ? `Okay, so ${concept.name} is basically this. ${concept.explanation} ${concept.key_points[0] ?? ""}`.trim()
    : `Um, so ${concept.name} is kind of like... ${concept.analogy}. I think it has something to do with that, but I'm not totally sure how it actually works.`;
}

// Boss fight like boss.ts: computeState picks every turn, isPass decides every attempt.
function playBoss(g: Group, concepts: Concept[]) {
  const roster = g.members.map((m) => ({ id: m.playerId!, name: m.name }));
  const flagged = concepts.filter((c) => c.is_key);
  const keyConcepts = flagged.length ? flagged : concepts.slice(0, 2);
  const attempts: { player_id: string; concept: string; total: number; passed: boolean; transcript: string; rubric: Rubric; at: number }[] = [];
  let startedAt = g.formedAt + int(2, 20) * MIN;
  let t = startedAt;
  const limit = g.boss === "one_fail" ? 1 : g.boss === "active" ? int(1, 4) : 60;
  for (let i = 0; i < limit; i++) {
    const state = computeState({ roster, keyConcepts, attempts });
    if (state.status === "defeated" || !state.turn) break;
    const concept = keyConcepts.find((c) => c.name === state.turn!.concept.name)!;
    const pass = g.boss !== "one_fail" && rand() < (g.boss === "defeated" ? 0.8 : 0.5);
    const rubric = rubricFor(pass, concept, g.boss === "defeated");
    t += int(60, 180) * 1000;
    attempts.push({
      player_id: state.turn.playerId, concept: concept.name, rubric, transcript: transcriptFor(pass, concept),
      total: rubric.correctness + rubric.depth + rubric.understanding + rubric.clarity, passed: isPass(rubric), at: t,
    });
  }
  const defeated = computeState({ roster, keyConcepts, attempts }).status === "defeated";
  let defeatedAt = defeated ? t : null;
  return {
    attempts,
    get startedAt() { return startedAt; },
    get defeatedAt() { return defeatedAt; },
    shift(ms: number) {
      startedAt += ms;
      if (defeatedAt) defeatedAt += ms;
      for (const a of attempts) a.at += ms;
    },
  };
}

// Simulations run forward from random start times; slide one side's whole timeline back (keeping every
// order) so its latest event lands 2 minutes ago and nothing is in the future.
function settle(ms: Member[], gs: Group[]) {
  for (const g of gs) {
    const accuracy: Record<string, number[]> = {};
    for (const a of g.members.flatMap((m) => m.answers)) (accuracy[a.subtopic] ??= []).push(Number(a.correct));
    g.concepts = groupConcepts(g.pack, Object.fromEntries(Object.entries(accuracy).map(([k, v]) => [k, v.reduce((s, x) => s + x, 0) / v.length])));
    g.fight = g.boss === "none" ? null : playBoss(g, g.concepts);
  }
  const latest = Math.max(
    ...ms.flatMap((m) => [m.joinedAt, m.readyAt ?? 0, ...m.answers.map((a) => a.at)]),
    ...gs.flatMap((g) => [g.formedAt, ...(g.fight?.attempts.map((a) => a.at) ?? []), g.fight?.startedAt ?? 0]));
  const by = Math.min(0, now - 2 * MIN - latest);
  for (const m of ms) {
    m.joinedAt += by;
    if (m.readyAt) m.readyAt += by;
    for (const a of m.answers) a.at += by;
  }
  for (const g of gs) {
    g.formedAt += by;
    g.fight?.shift(by);
  }
}

// ---------- Build everything in memory ----------
const classPacks = CLASSES.flatMap((c) => (["sports", "fantasy"] as Theme[]).map((theme) => ({ notes: c.notes, theme, level: c.level })));
const freePacks = Object.entries(FREE_NOTES).flatMap(([notes, themes]) => themes.map((theme) => ({ notes, theme, level: "high school" })));

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL!.split("?")[0], ssl: { rejectUnauthorized: false } });
const clean = process.argv.includes("--clean");
if (!clean) await ensurePacks([...classPacks, ...freePacks]);

const classRows: Record<string, unknown>[] = [];
const members: Member[] = [];
const groups: Group[] = [];
for (const c of CLASSES) {
  const classId = uuid();
  classRows.push({
    id: classId, code: c.code, name: c.name, teacher_name: c.teacher, teacher_token: `demo-${c.code.toLowerCase()}`,
    material: NOTES[c.notes], level: c.level, created_at: new Date(now - 7 * 24 * 60 * MIN),
    packs: { sports: packs[`${c.notes}:sports`], fantasy: packs[`${c.notes}:fantasy`] },
  });
  const personas = c.code === "BIO101" ? BIO_PERSONAS : [];
  const generated = Array.from({ length: c.size - personas.length }, (_, i) => {
    const state = i < 1 ? "new" : i < 3 ? "progress" : "ready";
    return { ...randomProfile(), state };
  });
  const classMembers: Member[] = [...personas, ...generated].map((p) => {
    const joinedAt = now - int(30, 5 * 24 * 60) * MIN;
    const played = p.state !== "new"
      ? playPhase1(packs[`${c.notes}:${p.theme}`], c.notes, joinedAt, p.state === "ready")
      : { answers: [], readyAt: null };
    const persona = personas.includes(p as Persona);
    return {
      id: uuid(), classId, name: p.name, interests: p.interests, theme: p.state === "new" ? null : p.theme, notes: c.notes,
      joinedAt, ...played, keepFree: persona, embedding: null, sessionId: null, playerId: null,
    };
  });
  members.push(...classMembers);
  const packOf = (m: Member) => packs[`${c.notes}:${m.theme}`];
  if (c.code === "BIO101") {
    const team = classMembers.filter((m) => BIO_PERSONAS.find((p) => p.name === m.name)?.team === "zoe");
    groups.push(makeGroup(team, packOf(team[0]), classId, c.level, "one_fail"));
  }
  groups.push(...autoGroup(classMembers.filter((m) => m.readyAt && !m.keepFree), packOf, classId, c.level));
}
settle(members, groups);

// Free agents: recent, so they're all still suggested (3 hours from their latest progress).
const freeProfiles: (Persona & { notes: string })[] = [
  ...FREE_PERSONAS.map((p) => ({ ...p, notes: p.notes! })),
  ...Array.from({ length: 13 }, (_, i) => {
    const notes = pick(Object.keys(FREE_NOTES));
    const profile = randomProfile();
    const theme = FREE_NOTES[notes].includes(profile.theme) ? profile.theme : FREE_NOTES[notes][0];
    return { ...profile, theme, notes, state: (i < 3 ? "progress" : "ready") as Persona["state"] };
  }),
];
let embeddings: number[][] | null = null;
if (!clean) {
  try {
    const keys = Object.keys(FREE_NOTES);
    const r = await new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }).models.embedContent({
      model: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001",
      contents: keys.map((k) => NOTES[k]),
      config: { outputDimensionality: 768, taskType: "SEMANTIC_SIMILARITY" },
    });
    embeddings = r.embeddings!.map((e) => e.values!);
    const byNotes = Object.fromEntries(keys.map((k, i) => [k, embeddings![i]]));
    embeddings = freeProfiles.map((p) => byNotes[p.notes]);
  } catch (e) {
    console.warn("Topic embeddings failed, so free agents will match on interests only:", (e as Error).message);
  }
}
const freeAgents: Member[] = freeProfiles.map((p, i) => {
  const persona = i < FREE_PERSONAS.length;
  const joinedAt = now - int(0, 40) * MIN; // settle() slides these back so nothing is in the future
  const played = playPhase1(packs[`${p.notes}:${p.theme}`], p.notes, joinedAt, p.state === "ready");
  return {
    id: uuid(), classId: null, name: p.name, interests: p.interests, theme: p.theme, notes: p.notes, joinedAt,
    ...played, keepFree: persona, embedding: embeddings?.[i] ?? null, sessionId: null, playerId: null,
  };
});
members.push(...freeAgents);
// Free agent groups play the starter's pack. Kept to fights in progress, so no timestamp lands in the future.
// Free agent fights are kept in progress: a full fight would push their sign-ups past the 3-hour window.
const freeGroups = autoGroup(freeAgents.filter((m) => m.readyAt && !m.keepFree), (m) => packs[`${m.notes}:${m.theme}`], null, "high school")
  .map((g) => ({ ...g, boss: g.boss === "defeated" ? "active" as const : g.boss }));
settle(freeAgents, freeGroups);
groups.push(...freeGroups);

// ---------- Write it to Tiger Data ----------
const client = await db.connect();
async function insertMany(table: string, rows: Record<string, unknown>[]) {
  const cols = Object.keys(rows[0] ?? {});
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const values = chunk.map((_, r) => `(${cols.map((_, c) => `$${r * cols.length + c + 1}`).join(", ")})`).join(", ");
    await client.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES ${values}`, chunk.flatMap((row) => cols.map((c) => row[c])));
  }
}
try {
  await client.query("BEGIN");
  // Wipe earlier demo data, including anything people did in demo classes during a recording.
  await client.query(`
    CREATE TEMP TABLE demo_classes ON COMMIT DROP AS SELECT id FROM classes WHERE teacher_token LIKE 'demo-%';
    CREATE TEMP TABLE demo_members ON COMMIT DROP AS SELECT id FROM class_members
      WHERE class_id IN (SELECT id FROM demo_classes) OR (class_id IS NULL AND pack->>'demo' = 'true');
    CREATE TEMP TABLE demo_sessions ON COMMIT DROP AS SELECT id FROM sessions
      WHERE content->>'demo' = 'true' OR class_id IN (SELECT id FROM demo_classes);
    UPDATE class_members SET session_id = NULL, player_id = NULL WHERE session_id IN (SELECT id FROM demo_sessions);
    DELETE FROM boss_attempts WHERE session_id IN (SELECT id FROM demo_sessions);
    DELETE FROM class_answers WHERE member_id IN (SELECT id FROM demo_members);
    DELETE FROM class_members WHERE id IN (SELECT id FROM demo_members);
    DELETE FROM boss_fights WHERE session_id IN (SELECT id FROM demo_sessions);
    DELETE FROM players WHERE session_id IN (SELECT id FROM demo_sessions);
    DELETE FROM sessions WHERE id IN (SELECT id FROM demo_sessions);
    DELETE FROM classes WHERE id IN (SELECT id FROM demo_classes);
  `);
  if (clean) {
    await client.query("COMMIT");
    console.log("Demo data removed.");
    process.exit(0);
  }

  await insertMany("classes", classRows);
  const sessionRows: Record<string, unknown>[] = [], playerRows: Record<string, unknown>[] = [];
  const fightRows: Record<string, unknown>[] = [], attemptRows: Record<string, unknown>[] = [];
  for (const g of groups) {
    sessionRows.push({
      id: g.id, share_code: g.code, theme: g.members[0].theme, level: g.level, class_id: g.classId,
      content: { demo: true, host: g.members[0].id, concepts: g.concepts }, created_at: new Date(g.formedAt),
    });
    g.members.forEach((m, i) => playerRows.push({ id: m.playerId, session_id: g.id, name: m.name, joined_at: new Date(g.formedAt + i * 1000) }));
    const boss = g.fight;
    if (!boss) continue;
    fightRows.push({
      session_id: g.id, status: boss.defeatedAt ? "defeated" : "active",
      started_at: new Date(boss.startedAt), defeated_at: boss.defeatedAt ? new Date(boss.defeatedAt) : null,
    });
    attemptRows.push(...boss.attempts.map((a) => ({
      id: uuid(), session_id: g.id, player_id: a.player_id, concept: a.concept, transcript: a.transcript,
      rubric: a.rubric, total: a.total, passed: a.passed, created_at: new Date(a.at),
    })));
  }
  await insertMany("sessions", sessionRows);
  await insertMany("players", playerRows);
  await insertMany("class_members", members.map((m) => ({
    id: m.id, class_id: m.classId, name: m.name, interests: m.interests, theme: m.theme,
    ready_at: m.readyAt ? new Date(m.readyAt) : null, session_id: m.sessionId, player_id: m.playerId,
    joined_at: new Date(m.joinedAt),
    pack: m.classId ? null : { ...packs[`${m.notes}:${m.theme}`], demo: true },
    topic_embedding: m.embedding ? JSON.stringify(m.embedding) : null,
  })));
  await insertMany("class_answers", members.flatMap((m) => m.answers.map((a) => ({
    class_id: m.classId, member_id: m.id, subtopic: a.subtopic, correct: a.correct, created_at: new Date(a.at),
  }))));
  await insertMany("boss_fights", fightRows);
  await insertMany("boss_attempts", attemptRows);
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
}

// ---------- Cheat sheet for the recording ----------
const find = (name: string) => members.find((m) => m.name === name)!;
const groupOf = (m: Member) => groups.find((g) => g.id === m.sessionId);
console.log(`\nSeeded ${CLASSES.length} classes, ${members.length - freeAgents.length} students, ${freeAgents.length} free agents, ` +
  `${groups.length} groups, ${groups.filter((g) => g.boss !== "none").length} boss fights, ` +
  `${members.reduce((n, m) => n + m.answers.length, 0)} phase 1 answers.\n`);
console.log("Teacher dashboards (GET /api/classes/:code, header X-Teacher-Token):");
console.table(CLASSES.map((c) => ({ class: c.name, code: c.code, professor: c.teacher, teacherToken: `demo-${c.code.toLowerCase()}` })));
console.log("Personas (memberId goes in the student routes):");
console.table([...BIO_PERSONAS.map((p) => ({ ...p, where: "BIO101" })), ...FREE_PERSONAS.map((p) => ({ ...p, where: "free agent" }))].map((p) => {
  const m = find(p.name);
  const g = groupOf(m);
  return {
    name: p.name, where: p.where, state: g ? `in group ${g.code} (boss: ${g.boss === "one_fail" ? "active, 1 miss" : g.boss})` : m.readyAt ? "ready, unmatched" : "in phase 1",
    memberId: m.id, playerId: m.playerId ?? "",
  };
}));
await db.end();
