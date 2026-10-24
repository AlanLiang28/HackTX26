// Deterministic model output for API tests; no network or real credentials needed.
export const gamePack = {
  title: "The Cell Kingdom",
  overview: "A cell is like a kingdom with different jobs for its inhabitants.",
  summary: "Cells use specialized structures to manage energy and information.",
  limitation:
    "Cell structures do not make conscious decisions like characters do.",
  accent: "#8b7cf6",
  boss: {
    name: "The Head Scholar",
    emoji: "🐉",
    intro: "Explain what you learned.",
  },
  subtopics: ["Nucleus", "Mitochondria", "Membrane", "Ribosomes"].map(
    (name) => ({
      name,
      analogy: `${name}'s job in a kingdom`,
      lesson: `${name} has a specialized role inside a cell. Like a member of a kingdom, it works with other structures to keep the whole system running.`,
      enemy: {
        name: `${name} Guardian`,
        emoji: "👾",
        taunt: "Show your understanding.",
      },
      questions: Array.from({ length: 3 }, (_, i) => ({
        prompt: `What is the role of ${name}? (question ${i + 1})`,
        options: [
          "Supported by the notes",
          "Incorrect A",
          "Incorrect B",
          "Incorrect C",
        ],
        answer: 0,
        explanation: `The notes support this function of ${name}.`,
      })),
    }),
  ),
};
