import type { Mapping, StudySession, Theme } from "./study";
import type { SpriteKind } from "../components/PixelSprite";
import type { IconName } from "../components/PixelIcon";

export type Character = {
  name: string;
  role: string;
  sprite: SpriteKind;
  introduction: string;
  correct: string;
  incorrect: string;
};

export const worlds: Record<
  Theme,
  {
    name: string;
    title: string;
    description: string;
    book: string;
    location: string;
    guide: string;
    guideSprite: SpriteKind;
    icon: IconName;
  }
> = {
  fantasy: {
    icon: "sword",
    name: "Fantasy",
    title: "The Evergreen Kingdom",
    description:
      "Curious creatures. Ancient wisdom. One very opinionated dragon.",
    book: "Spellbook",
    location: "THE EVERGREEN KINGDOM",
    guide: "Wisp",
    guideSprite: "mage",
  },
  sports: {
    icon: "football",
    name: "Sports",
    title: "The Home Field",
    description: "A rookie, a playbook, and a head coach who means business.",
    book: "Playbook",
    location: "THE HOME-FIELD STADIUM",
    guide: "Coach Dash",
    guideSprite: "assistant",
  },
  gossip: {
    icon: "chat",
    name: "Gossip",
    title: "Hallway C",
    description:
      "Rumors spread fast. Facts spread slower. Get the real story before the bell.",
    book: "Diary",
    location: "THE EIGHTH-GRADE HALLWAY",
    guide: "Tess",
    guideSprite: "gossip",
  },
};

const fantasy: Character[] = [
  {
    name: "Mossby",
    role: "THE VERY CURIOUS SLIME",
    sprite: "slime",
    introduction:
      "Oh! A visitor. I was just trying to get my head around something. Well... all of me is head. Let's figure this out together.",
    correct:
      "You got it! I knew that big brain of yours was in there somewhere. Mine's mostly moss.",
    incorrect:
      "Hmm. That doesn't quite add up. That's okay! Let's untangle it together, then give it another go.",
  },
  {
    name: "Sir Clanks",
    role: "KNIGHT OF THE SECOND GUESS",
    sprite: "knight",
    introduction:
      "Halt, traveler! To cross this clearing, you must understand what you are doing. A good knight thinks before charging. I learned that the loud way.",
    correct:
      "Well reasoned. A sharp mind is worth at least three sharp swords. You may pass.",
    incorrect:
      "A small dent in the armor. Nothing more. Read this carefully, then take another swing.",
  },
  {
    name: "Wisp",
    role: "THE SLIGHTLY LOST MAGE",
    sprite: "mage",
    introduction:
      "Ah, there you are. I've been expecting you. Or someone remarkably similar. Let's connect a few ideas before we try anything dramatic.",
    correct:
      "Beautiful. You connected the pieces. That is where the real magic happens.",
    incorrect:
      "An interesting theory. The universe disagrees, but I like your confidence. Let's try a different angle.",
  },
  {
    name: "Professor Ember",
    role: "KEEPER OF THE FINAL QUESTION",
    sprite: "dragon",
    introduction:
      "So. You have answered the others. But knowing an answer and understanding an idea are different treasures. Teach me what you have learned.",
    correct: "A well-earned piece of wisdom. Carry it beyond this kingdom.",
    incorrect:
      "There is a missing link. Return to your notes, and bring the idea into focus.",
  },
];
const sports: Character[] = [
  {
    name: "Rookie Reed",
    role: "YOUR EAGER TEAMMATE",
    sprite: "player",
    introduction:
      "Hey, you're the new one! Before we hit the field, help me work through something. Coach says understanding the basics is half the game.",
    correct:
      "That's the play! Okay, I think we're going to make a pretty good team.",
    incorrect:
      "Not quite the play we wanted. Let's watch that one again and give it another shot.",
  },
  {
    name: "Coach Dash",
    role: "THE FUNDAMENTALS COACH",
    sprite: "assistant",
    introduction:
      "Bring it in. I don't need you to memorize the playbook. I need you to know why the play works. Let's walk through it.",
    correct:
      "Good read. You saw the connection and made the right move. That's how you get better.",
    incorrect:
      "Reset. A missed play is just a chance to see what you didn't see before. Here's the breakdown.",
  },
  {
    name: "Coach Cross",
    role: "THE OFFENSIVE COORDINATOR",
    sprite: "coordinator",
    introduction:
      "You've got the basics. Now let's put the pieces together. A great play only works when every part makes sense.",
    correct:
      "Now you're seeing the whole field. Take that understanding into the final meeting.",
    incorrect:
      "There's a gap in the coverage. Let's find it, then run the play again.",
  },
  {
    name: "Coach Stone",
    role: "THE HEAD COACH",
    sprite: "coach",
    introduction:
      "Final meeting. No lucky guesses this time. Explain the concept in your own words, connect the ideas, and show me an example. The floor is yours.",
    correct:
      "That's what I wanted to hear. Take the understanding with you, on and off the field.",
    incorrect:
      "Find the missing connection. Your playbook is here when you need it.",
  },
];

const gossip: Character[] = [
  {
    name: "Tess",
    role: "THE ONE WHO HEARS EVERYTHING",
    sprite: "gossip",
    introduction:
      "Okay, oh my gosh, you will not believe what I just heard by the lockers. But before I spill, I need to know you actually get this part. No lying.",
    correct:
      "Stop. You're so right. I'm literally putting that in the group chat.",
    incorrect:
      "Wait, no, that's a total rumor. Let me give you the real story, then try again.",
  },
  {
    name: "Hall Monitor Hank",
    role: "KEEPER OF THE HALL PASS",
    sprite: "monitor",
    introduction:
      "Hold it. Nobody gets past this water fountain without a pass. Lucky for you, the pass is understanding this. Let's see it.",
    correct:
      "That checks out. Pass approved. Walk, don't run.",
    incorrect:
      "That's a detention-level mix-up. Read the facts again, then come back to my desk.",
  },
  {
    name: "Ziggy",
    role: "THE NEW KID WITH A SECRET",
    sprite: "newkid",
    introduction:
      "Hey. Everyone's been making up stuff about me since I transferred. I figure if we both know how this works, we'll be the only ones in the hallway telling the truth.",
    correct:
      "Yes! You're the first person here who didn't just guess. Want to sit with me at lunch?",
    incorrect:
      "Hm. That's what everyone else says too, but it's not true. Here's what's actually going on.",
  },
  {
    name: "Principal Prim",
    role: "KEEPER OF THE PERMANENT RECORD",
    sprite: "principal",
    introduction:
      "Please, sit. I've heard a lot of stories this week. I'd like one that's actually true. Explain what you've learned, in your own words, with an example.",
    correct:
      "Now that is going on your permanent record. In a good way.",
    incorrect:
      "Something in your story doesn't add up. Check your notes and tell it to me again.",
  },
];

const casts: Record<Theme, Character[]> = { fantasy, sports, gossip };

export function getCharacter(
  theme: Theme,
  index: number,
  boss = false,
): Character {
  const cast = casts[theme];
  return cast[boss ? 3 : index % 3];
}

export function getLessonLines(
  session: StudySession,
  index: number,
  boss: boolean,
): string[] {
  if (boss)
    return [
      session.content.summary,
      "Use your own words. Explain the main idea, connect two concepts, and give an example that shows why it works.",
    ];
  const concepts = getEncounterConcepts(session, index);
  const subtopic = session.content.quiz[index]?.subtopic;
  if (subtopic && concepts[0]?.concept === subtopic)
    return [
      `${concepts[0].concept}. Think of it as ${concepts[0].analogy}.`,
      concepts[0].explanation,
    ];
  const lines = concepts.flatMap((mapping) => [
    `${mapping.concept}. Think of it as ${mapping.analogy.charAt(0).toLowerCase() + mapping.analogy.slice(1)}.`,
    mapping.explanation,
  ]);
  return index === 0 ? [session.content.overview, ...lines] : lines;
}

// The concepts a (non-boss) opponent teaches: its question's subtopic, or an even share of the mappings.
export function getEncounterConcepts(
  session: StudySession,
  index: number,
): Mapping[] {
  const mappings = session.content.mappings;
  const subtopic = session.content.quiz[index]?.subtopic;
  if (subtopic) {
    const mapping = mappings.find((item) => item.concept === subtopic);
    if (mapping) return [mapping];
  }
  const count = session.content.quiz.length;
  const start = Math.floor((index * mappings.length) / count);
  const end = Math.floor(((index + 1) * mappings.length) / count);
  return mappings.slice(start, Math.max(start + 1, end));
}
