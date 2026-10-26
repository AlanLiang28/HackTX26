// The playable worlds. The backend (classes.ts) uses this list too, so adding a world starts here.
export const THEMES = ["sports", "fantasy", "gossip"] as const;
export type Theme = (typeof THEMES)[number];
export const isTheme = (value: unknown): value is Theme =>
  THEMES.includes(value as Theme);
export type Mapping = {
  concept: string;
  analogy: string;
  explanation: string;
};
export type QuizQuestion = {
  subtopic?: string;
  question: string;
  options: string[];
  answer: number;
  explanation?: string;
};
export type StudySession = {
  topic: string;
  interest: string;
  level: string;
  content: {
    title: string;
    overview: string;
    mappings: Mapping[];
    summary: string;
    limitation?: string;
    quiz: QuizQuestion[];
  };
};
export type QuestRecord = {
  id: string;
  title: string;
  theme: Theme;
  score: number;
  total: number;
  completedAt: string;
  players: number;
  demo: boolean;
};
const demoNotes =
  "Momentum is the product of mass and velocity: p = mv. Momentum has a direction. In a system with negligible external impulse, total momentum is conserved. When objects collide and stick together, they have the same final velocity. Kinetic energy can change during a collision even while total momentum is conserved.";
// The demo's world flavor. The physics, numbers, and answers are the same in every world.
const demoFlavor: Record<
  Theme,
  {
    interest: string;
    mover: string;
    overview: string;
    analogies: [string, string, string, string];
  }
> = {
  fantasy: {
    interest: "Fantasy",
    mover: "knight",
    overview:
      "Picture a heavily armored knight charging across a clearing. Their motion depends on both how much mass they carry and how fast they move. That combination is momentum—and it follows the same rules for a knight, a rolling cart, or a football player.",
    analogies: [
      "An armored knight on the move",
      "Two knights charging toward each other",
      "A knight landing in a moving supply cart",
      "Armor bending when knights collide",
    ],
  },
  sports: {
    interest: "Sports",
    mover: "player",
    overview:
      "Picture a running back charging down the field. Their motion depends on both their mass and their velocity. That combination is momentum, and it helps explain what happens when players collide.",
    analogies: [
      "A running back charging downfield",
      "Players moving toward opposite end zones",
      "Two players holding together after a tackle",
      "Pads compressing during a tackle",
    ],
  },
  gossip: {
    interest: "Middle school gossip",
    mover: "hall monitor",
    overview:
      "Picture the hall monitor sprinting down the eighth-grade hallway to break up a lunch-table feud. How hard they are to stop depends on both their mass and their speed. That combination is momentum, and it follows the same rules for a hall monitor, a rolling AV cart, or a crowd rushing to see the drama.",
    analogies: [
      "The hall monitor rushing toward the drama",
      "Two friend groups storming toward each other at the lockers",
      "Two ex-best-friends who collide, make up, and walk off arm in arm",
      "Backpacks squishing when two students crash at the lockers",
    ],
  },
};
export function getDemoSession(theme: Theme): StudySession {
  const flavor = demoFlavor[theme];
  return {
    topic: demoNotes,
    interest: flavor.interest,
    level: "high school",
    content: {
      title: "",
      overview: flavor.overview,
      mappings: [
        {
          concept: "Mass and velocity",
          analogy: flavor.analogies[0],
          explanation: `Momentum is mass multiplied by velocity: p = mv. A 90 kg ${flavor.mover} moving at 6 m/s has 540 kg·m/s of momentum. A heavier object can have less momentum than a lighter one if it is moving more slowly.`,
        },
        {
          concept: "Direction matters",
          analogy: flavor.analogies[1],
          explanation:
            "Momentum is a vector: it includes direction. Choose one direction as positive. A 90 kg object moving at +6 m/s has +540 kg·m/s of momentum. A 120 kg object moving at −3 m/s has −360 kg·m/s. Their total is +180 kg·m/s, not 900.",
        },
        {
          concept: "Conservation of momentum",
          analogy: flavor.analogies[2],
          explanation:
            "If external impulse is negligible, the total momentum before a collision equals the total afterward. When the 90 kg and 120 kg objects above stick together, their combined mass is 210 kg. Their shared final velocity is 180 ÷ 210 ≈ +0.86 m/s.",
        },
        {
          concept: "Momentum vs. kinetic energy",
          analogy: flavor.analogies[3],
          explanation:
            "Total momentum can be conserved even when kinetic energy is not. In a collision where objects stick together, some kinetic energy becomes sound, heat, or deformation. Energy is still conserved overall; it simply changes form.",
        },
      ],
      summary:
        "Momentum combines mass, velocity, and direction. When external impulse is negligible, a system’s total momentum stays the same through a collision—even when kinetic energy changes into other forms.",
      limitation:
        "Real people push against the ground, and those external forces can change the system’s momentum. The collision examples assume that external impulse during the brief impact is negligible. A larger character does not automatically “win.”",
      quiz: [
        {
          question: `A 90 kg ${flavor.mover} moves at 6 m/s. What is the magnitude of their momentum?`,
          options: ["15 kg·m/s", "96 kg·m/s", "540 kg·m/s", "3,240 kg·m/s"],
          answer: 2,
          explanation:
            "Use p = mv: 90 × 6 = 540 kg·m/s. Mass and velocity both contribute to momentum.",
        },
        {
          question:
            "Two objects have momenta of +540 and −360 kg·m/s. What is their total momentum?",
          options: ["+900 kg·m/s", "+180 kg·m/s", "−180 kg·m/s", "0 kg·m/s"],
          answer: 1,
          explanation:
            "Add the signed values: +540 + (−360) = +180 kg·m/s. Opposite directions matter.",
        },
        {
          question:
            "Two objects collide and stick together with negligible external impulse. Which statement is true?",
          options: [
            "Both momentum and kinetic energy must increase.",
            "All kinetic energy disappears.",
            "Momentum is conserved; kinetic energy may change form.",
            "The heavier object always stops moving.",
          ],
          answer: 2,
          explanation:
            "Total momentum stays constant under this assumption. Some kinetic energy can become heat, sound, or deformation.",
        },
      ],
    },
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
export function isStudySession(value: unknown): value is StudySession {
  if (!isRecord(value) || !isRecord(value.content)) return false;
  const content = value.content;
  return (
    typeof value.topic === "string" &&
    typeof value.interest === "string" &&
    typeof value.level === "string" &&
    typeof content.title === "string" &&
    typeof content.overview === "string" &&
    typeof content.summary === "string" &&
    (content.limitation === undefined ||
      typeof content.limitation === "string") &&
    Array.isArray(content.mappings) &&
    content.mappings.length > 0 &&
    content.mappings.every(
      (item) =>
        isRecord(item) &&
        typeof item.concept === "string" &&
        typeof item.analogy === "string" &&
        typeof item.explanation === "string",
    ) &&
    Array.isArray(content.quiz) &&
    content.quiz.length > 0 &&
    content.quiz.every(
      (item) =>
        isRecord(item) &&
        typeof item.question === "string" &&
        Array.isArray(item.options) &&
        item.options.every((option) => typeof option === "string") &&
        Number.isInteger(item.answer) &&
        // -1 is a live question the server hasn't graded yet; its slot may have no options so far.
        (item.answer === -1 ||
          (item.options.length >= 2 &&
            Number(item.answer) >= 0 &&
            Number(item.answer) < item.options.length)) &&
        (item.explanation === undefined ||
          typeof item.explanation === "string"),
    )
  );
}
export function readQuestLog(): QuestRecord[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem("studyraid-quests") ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (record): record is QuestRecord =>
              isRecord(record) &&
              typeof record.id === "string" &&
              typeof record.title === "string" &&
              isTheme(record.theme) &&
              typeof record.score === "number" &&
              typeof record.total === "number" &&
              typeof record.completedAt === "string" &&
              !Number.isNaN(Date.parse(record.completedAt)) &&
              typeof record.players === "number" &&
              typeof record.demo === "boolean",
          )
          .slice(0, 30)
      : [];
  } catch {
    return [];
  }
}
export function saveQuest(record: QuestRecord): QuestRecord[] {
  const updated = [
    record,
    ...readQuestLog().filter((previous) => previous.id !== record.id),
  ].slice(0, 30);
  try {
    localStorage.setItem("studyraid-quests", JSON.stringify(updated));
  } catch {
    /* A full or disabled store must not interrupt the quest. */
  }
  return updated;
}
