import type { Theme } from "./study";
import { parseAdaptiveGame } from "./adaptive";

export const INTERESTS = [
  "Football",
  "Basketball",
  "Soccer",
  "Gaming",
  "Anime",
  "Music",
  "Movies",
  "Art",
  "Cooking",
  "Chess",
  "Reading",
  "Science",
  "Technology",
  "Outdoors",
  "Dance",
  "Travel",
] as const;
export type Profile = { name: string; interests: string[] };
export type ClassInfo = { code: string; name: string; teacherName: string };
export type MemberContext = Profile & {
  memberId: string;
  kind: "class" | "free";
  theme: Theme;
  class?: ClassInfo;
};
export type SavedClass = { code: string; name: string; teacherToken: string };
export type Group = {
  code: string;
  playerId: string;
  theme: Theme;
  bossStarted: boolean;
  members: { id: string; name: string; interests: string[] }[];
};
export type MemberView = {
  member: {
    id: string;
    name: string;
    interests: string[];
    theme: Theme | null;
    ready: boolean;
  };
  group: Group | null;
  matches: {
    memberId: string;
    name: string;
    interests: string[];
    shared: string[];
    topic: number | null;
    score: number;
    ready: boolean;
    groupSize: number;
  }[];
};
export type Dashboard = ClassInfo & {
  level: string;
  worldsReady: Theme[];
  members: {
    id: string;
    name: string;
    interests: string[];
    theme: Theme | null;
    ready: boolean;
    groupCode: string | null;
    attempts: number;
    accuracy: number | null;
  }[];
  groups: {
    code: string;
    theme: Theme;
    boss: "not_started" | "active" | "defeated";
    members: string[];
  }[];
  topics: { subtopic: string; attempts: number; accuracy: number }[];
};

export class ApiError extends Error {
  code: string;
  constructor(message: string, code = "") {
    super(message);
    this.code = code;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(90000)])
        : AbortSignal.timeout(90000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError("Could not reach the server. Please try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      data?.message ?? data?.error ?? "Something went wrong. Please try again.",
      data?.error,
    );
  if (!data || typeof data !== "object")
    throw new ApiError("The server returned an incomplete response.");
  return data as T;
}
const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
const pathFor = (member: MemberContext) =>
  member.kind === "class"
    ? `/api/classes/${encodeURIComponent(member.class!.code)}/members/${encodeURIComponent(member.memberId)}`
    : `/api/free-agents/${encodeURIComponent(member.memberId)}`;

export async function joinClass(
  code: string,
  profile: Profile,
  theme: Theme,
  signal?: AbortSignal,
): Promise<MemberContext> {
  const data = await post<{ memberId: string; class: ClassInfo }>(
    `/api/classes/${encodeURIComponent(code.trim().toUpperCase())}/join`,
    profile,
    signal,
  );
  if (typeof data.memberId !== "string" || !data.class?.code)
    throw new ApiError("The class response was incomplete.");
  return { ...profile, ...data, kind: "class", theme };
}
export async function startFreeAgent(
  profile: Profile,
  material: string,
  theme: Theme,
  signal?: AbortSignal,
) {
  const data = await post<{ memberId: string }>(
    "/api/free-agents",
    { ...profile, material, theme },
    signal,
  );
  if (typeof data.memberId !== "string")
    throw new ApiError("The player response was incomplete.");
  return {
    game: parseAdaptiveGame(data),
    member: {
      ...profile,
      memberId: data.memberId,
      kind: "free" as const,
      theme,
    },
  };
}
export async function playMember(
  member: MemberContext,
  theme: Theme,
  signal?: AbortSignal,
) {
  return parseAdaptiveGame(
    await post(`${pathFor(member)}/play`, { theme }, signal),
  );
}
function validateMemberView(data: MemberView): MemberView {
  if (
    !data.member ||
    typeof data.member.ready !== "boolean" ||
    !Array.isArray(data.matches) ||
    data.group === undefined ||
    (data.group &&
      (!Array.isArray(data.group.members) ||
        !data.group.code ||
        !data.group.playerId))
  )
    throw new ApiError("The party response was incomplete.");
  return data;
}
export async function getMember(member: MemberContext, signal?: AbortSignal) {
  return validateMemberView(await api<MemberView>(pathFor(member), { signal }));
}
export async function pickPartner(
  member: MemberContext,
  partnerId: string,
  signal?: AbortSignal,
) {
  const path =
    member.kind === "class"
      ? `/api/classes/${encodeURIComponent(member.class!.code)}/groups`
      : "/api/free-agents/groups";
  return validateMemberView(
    await post<MemberView>(
      path,
      { memberId: member.memberId, partnerId },
      signal,
    ),
  );
}
export async function createClass(
  input: { name: string; teacherName: string; material: string; level: string },
  signal?: AbortSignal,
) {
  const data = await post<SavedClass>("/api/classes", input, signal);
  if (!data.code || !data.name || !data.teacherToken)
    throw new ApiError("The class response was incomplete.");
  return data;
}
export async function getDashboard(saved: SavedClass, signal?: AbortSignal) {
  const data = await api<Dashboard>(
    `/api/classes/${encodeURIComponent(saved.code)}`,
    { headers: { "X-Teacher-Token": saved.teacherToken }, signal },
  );
  if (
    !Array.isArray(data.members) ||
    !Array.isArray(data.groups) ||
    !Array.isArray(data.topics) ||
    !Array.isArray(data.worldsReady)
  )
    throw new ApiError("The dashboard response was incomplete.");
  return data;
}
export function remember<T>(key: string, value: T) {
  try {
    localStorage.setItem(`studyraid-${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function recall<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem(`studyraid-${key}`) ?? "null") ?? fallback
    );
  } catch {
    return fallback;
  }
}
export function readMember(): MemberContext | null {
  const saved = recall<MemberContext | null>("member", null);
  return saved &&
    typeof saved.memberId === "string" &&
    typeof saved.name === "string" &&
    Array.isArray(saved.interests) &&
    (saved.kind === "free" || (saved.kind === "class" && saved.class?.code)) &&
    ["sports", "fantasy"].includes(saved.theme)
    ? saved
    : null;
}
export function readClasses(): SavedClass[] {
  const saved = recall<unknown>("classes", []);
  return Array.isArray(saved)
    ? saved.filter(
        (s): s is SavedClass =>
          s &&
          typeof s.code === "string" &&
          typeof s.name === "string" &&
          typeof s.teacherToken === "string",
      )
    : [];
}
