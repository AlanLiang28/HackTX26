import { useState } from "react";
import type { FormEvent } from "react";
import { addFriend, getChat, getFriends, sendChat } from "../lib/classroom";
import type { Friend, MemberContext } from "../lib/classroom";
import { usePolling } from "../lib/usePolling";
import { PixelIcon } from "./PixelIcon";
import { Notice } from "./CommunityScreens";

// Friends are added from the party screen; this lists them, accepts requests, and opens chats.
export function FriendsPanel({ member }: { member: MemberContext }) {
  const [chat, setChat] = useState<Friend | null>(null);
  const [error, setError] = useState("");
  const list = usePolling((signal) => getFriends(member, signal), 5000, !!chat);
  if (chat)
    return <Chat member={member} friend={chat} onBack={() => setChat(null)} />;
  const friends = list.data?.filter((f) => f.status === "friends") ?? [];
  const incoming = list.data?.filter((f) => f.status === "incoming") ?? [];
  const outgoing = list.data?.filter((f) => f.status === "outgoing") ?? [];
  async function accept(id: string) {
    setError("");
    try {
      await addFriend(member, id);
      list.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept.");
    }
  }
  return (
    <div className="friends-panel">
      {!list.data && !list.error && (
        <p className="empty-state" role="status">
          Loading your friends…
        </p>
      )}
      {list.data && !list.data.length && (
        <p className="empty-state">
          No friends yet. Add your party members from the party screen.
        </p>
      )}
      {incoming.map((f) => (
        <div className="friend-row" key={f.id}>
          <PixelIcon name="person" size={17} />
          <span>{f.name} wants to be friends</span>
          <button
            className="secondary-button"
            onClick={() => void accept(f.id)}
          >
            Accept
          </button>
        </div>
      ))}
      {friends.map((f) => (
        <button className="friend-row" key={f.id} onClick={() => setChat(f)}>
          <PixelIcon name="person" size={17} />
          <span>{f.name}</span>
          <PixelIcon name="arrow" size={14} />
        </button>
      ))}
      {outgoing.map((f) => (
        <div className="friend-row pending" key={f.id}>
          <PixelIcon name="person" size={17} />
          <span>{f.name}</span>
          <small>Request sent</small>
        </div>
      ))}
      {(error || list.error) && <Notice>{error || list.error}</Notice>}
    </div>
  );
}

function Chat({
  member,
  friend,
  onBack,
}: {
  member: MemberContext;
  friend: Friend;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const poll = usePolling((signal) => getChat(member, friend.id, signal), 3000);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (sending || !draft.trim()) return;
    setSending(true);
    setError("");
    try {
      await sendChat(member, friend.id, draft.trim());
      setDraft("");
      poll.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="friends-panel">
      <button className="text-button" onClick={onBack}>
        <PixelIcon name="arrowLeft" size={14} />
        All friends
      </button>
      {/* column-reverse + newest-first messages keeps the log pinned to the latest message */}
      <div className="chat-log" role="log" aria-label={`Chat with ${friend.name}`}>
        {poll.data?.map((m) => (
          <p className={`chat-message ${m.mine ? "mine" : ""}`} key={m.id}>
            {m.body}
            <small>
              {new Date(m.at).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </small>
          </p>
        ))}
        {poll.data && !poll.data.length && (
          <p className="empty-state">Say hi to {friend.name}!</p>
        )}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input
          aria-label={`Message ${friend.name}`}
          placeholder={`Message ${friend.name}`}
          value={draft}
          maxLength={500}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          className="primary-button"
          disabled={sending || !draft.trim()}
        >
          Send
        </button>
      </form>
      {(error || poll.error) && <Notice>{error || poll.error}</Notice>}
    </div>
  );
}
