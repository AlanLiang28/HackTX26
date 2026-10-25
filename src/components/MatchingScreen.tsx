import { useEffect, useRef, useState } from "react";
import { addFriend, getFriends, getMember, pickPartner } from "../lib/classroom";
import type { Group, MemberContext, MemberView } from "../lib/classroom";
import { startBoss } from "../lib/party";
import { worlds } from "../lib/characters";
import { usePolling } from "../lib/usePolling";
import { PixelIcon } from "./PixelIcon";
import { PixelSprite } from "./PixelSprite";
import { Notice } from "./CommunityScreens";

export function MatchingScreen({
  member,
  onBoss,
  onStudy,
  soloComplete = false,
}: {
  member: MemberContext;
  onBoss: (group: Group) => void;
  onStudy: () => void;
  soloComplete?: boolean;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<MemberView | null>(null);
  const operation = useRef<AbortController | null>(null);
  const poll = usePolling((signal) => getMember(member, signal), 3000, !!busy);
  const friends = usePolling(
    (signal) => getFriends(member, signal),
    10000,
    !member.token,
  );
  useEffect(() => {
    if (poll.data) setUpdated(null);
  }, [poll.data]);
  useEffect(() => () => operation.current?.abort(), []);
  const view = updated ?? poll.data;
  const group = view?.group;
  async function pick(id: string) {
    if (busy) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(id);
    setError("");
    try {
      const next = await pickPartner(member, id, controller.signal);
      if (!controller.signal.aborted) setUpdated(next);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error ? err.message : "Could not join the party.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setBusy("");
        poll.refresh();
      }
    }
  }
  async function befriend(id: string) {
    setError("");
    try {
      await addFriend(member, id);
      friends.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add friend.");
    }
  }
  async function begin() {
    if (!group || busy) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy("boss");
    setError("");
    try {
      await startBoss(group.code, controller.signal);
      if (!controller.signal.aborted) onBoss({ ...group, bossStarted: true });
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error ? err.message : "Could not start the boss.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy("");
    }
  }
  return (
    <>
      <div className="page-intro">
        <h1>
          {group ? "Your party is here." : "Better together."}
          <br />
          <span>
            {group ? "One final challenge." : "Find your study party."}
          </span>
        </h1>
      </div>
      <section className="matching-panel pixel-panel" aria-label="Study party">
        <div className="panel-heading">
          <div>
            <span className="subject-label">
              {member.class?.name ?? "INDEPENDENT STUDY"}
            </span>
            <h2>{group ? "Your party" : "Ready for the boss"}</h2>
          </div>
          <PixelSprite kind="knight" />
        </div>
        {!view && (
          <p className="empty-state" role="status">
            Looking for your classmates…
          </p>
        )}
        {view && !view.member.ready && (
          <div className="empty-state">
            <p>
              {soloComplete
                ? "Saving your solo round. Your party options will appear here shortly."
                : "Your solo round is still in progress."}
            </p>
            {!soloComplete && (
              <button
                className="secondary-button"
                onClick={onStudy}
                disabled={!!busy}
              >
                Return to study
              </button>
            )}
          </div>
        )}
        {group && (
          <>
            <div className="party-roster">
              {group.members.map((person) => {
                const status = friends.data?.find(
                  (f) => f.id === person.id,
                )?.status;
                return (
                  <div className="party-person" key={person.id}>
                    <PixelIcon name="person" size={17} />
                    <span>
                      {person.name}
                      {person.id === member.memberId ? " (you)" : ""}
                    </span>
                    {friends.data && person.id !== member.memberId && (
                      <button
                        className="text-button"
                        disabled={status === "friends" || status === "outgoing"}
                        onClick={() => void befriend(person.id)}
                      >
                        {status === "friends"
                          ? "Friends"
                          : status === "outgoing"
                            ? "Request sent"
                            : status === "incoming"
                              ? "Accept friend"
                              : "Add friend"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="field-help">
              {group.bossStarted
                ? "Your party has started the final meeting."
                : `${group.members.length}/4 players. Starting the boss closes the party.`}
            </p>
            <button
              className="primary-button full-width"
              disabled={!!busy || group.members.length < 2}
              onClick={() => (group.bossStarted ? onBoss(group) : void begin())}
            >
              {busy === "boss"
                ? "Opening the final meeting…"
                : group.bossStarted
                  ? "Return to the boss"
                  : `Start boss with ${group.members.length} players`}
              <PixelIcon name="crown" size={17} />
            </button>
          </>
        )}
        {view?.member.ready && !group?.bossStarted && (
          <div className="match-list">
            <h3>{group ? "Room for another?" : "Suggested partners"}</h3>
            <p className="field-help">
              {member.kind === "class"
                ? "Classmates in your world come first."
                : "Ranked by your world and how similar your study material is."}
            </p>
            {!view.matches.length && (
              <p className="empty-state">
                {group && group.members.length >= 4
                  ? "Your party is full."
                  : "No partners yet. This list updates as more players get ready."}
              </p>
            )}
            {view.matches.map((match) => (
              <article className="match-card" key={match.memberId}>
                <div>
                  <h4>{match.name}</h4>
                  <p>
                    {match.theme
                      ? `${worlds[match.theme].name} world${match.theme === view.member.theme ? " · same as you" : ""}`
                      : "Hasn't picked a world yet"}
                  </p>
                  {member.kind === "free" && match.topic !== null && (
                    <small>
                      {Math.round(match.topic * 100)}% subject match
                    </small>
                  )}
                  {!match.ready && <small>Still studying solo</small>}
                </div>
                <button
                  className="secondary-button"
                  disabled={!!busy || !match.ready}
                  onClick={() => void pick(match.memberId)}
                >
                  {busy === match.memberId
                    ? "Joining…"
                    : !match.ready
                      ? "Not ready"
                      : group
                        ? "Add to party"
                        : match.groupSize > 1
                          ? `Join ${match.groupSize} players`
                          : "Team up"}
                </button>
              </article>
            ))}
          </div>
        )}
        {(error || poll.error) && <Notice>{error || poll.error}</Notice>}
        <button
          className="text-button refresh-link"
          onClick={poll.refresh}
          disabled={!!busy}
        >
          <PixelIcon name="retry" size={14} />
          Refresh party
        </button>
      </section>
    </>
  );
}
