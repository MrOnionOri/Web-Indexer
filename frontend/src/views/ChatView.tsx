import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Plus, Search, Send, Users, X } from "lucide-react";
import { api, CHAT_WS_URL, ChatConversation, ChatMessage, ChatUser, Me } from "../api";

export function ChatView({ me }: { me: Me }) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [showDirectory, setShowDirectory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const activeConversation = conversations.find((item) => item.id === activeId) ?? null;

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => !query || `${user.full_name} ${user.email}`.toLowerCase().includes(query));
  }, [users, search]);

  useEffect(() => {
    Promise.all([api.chatConversations(), api.chatUsers()])
      .then(([conversationItems, userItems]) => {
        setConversations(conversationItems);
        setUsers(userItems);
        setActiveId((current) => current ?? conversationItems[0]?.id ?? null);
      })
      .catch((err) => setError(err.message ?? "No se pudieron cargar los chats."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    loadMessages(activeId);
  }, [activeId]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let stopped = false;

    const connect = () => {
      socket = new WebSocket(CHAT_WS_URL);
      socket.onmessage = (event) => {
        const update = JSON.parse(event.data);
        api.chatConversations().then(setConversations).catch(() => {});
        if (activeId && update.conversation_id === activeId && update.type === "message") {
          loadMessages(activeId);
        }
      };
      socket.onclose = () => {
        if (!stopped) reconnectTimer = window.setTimeout(connect, 1800);
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [activeId]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function loadMessages(conversationId: string) {
    try {
      const items = await api.chatMessages(conversationId);
      setMessages(items);
      await api.markChatRead(conversationId);
      setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, unread_count: 0 } : item));
    } catch (err: any) {
      setError(err.message ?? "No se pudo abrir la conversacion.");
    }
  }

  async function startConversation(user: ChatUser) {
    try {
      const conversation = await api.createChatConversation(user.id);
      setConversations((current) => {
        const exists = current.some((item) => item.id === conversation.id);
        return exists ? current.map((item) => item.id === conversation.id ? conversation : item) : [conversation, ...current];
      });
      setActiveId(conversation.id);
      setShowDirectory(false);
      setSearch("");
    } catch (err: any) {
      setError(err.message ?? "No se pudo iniciar la conversacion.");
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const body = message.trim();
    if (!activeId || !body || sending) return;
    setSending(true);
    setMessage("");
    try {
      const sent = await api.sendChatMessage(activeId, body);
      setMessages((current) => current.some((item) => item.id === sent.id) ? current : [...current, sent]);
      api.chatConversations().then(setConversations).catch(() => {});
    } catch (err: any) {
      setMessage(body);
      setError(err.message ?? "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p className="toolbar-note">Cargando conversaciones...</p>;

  return (
    <section className={`live-chat${activeConversation ? " has-active" : ""}`}>
      <aside className="live-chat-sidebar">
        <header className="live-chat-sidebar-header">
          <div><strong>Mensajes</strong><span>{conversations.length} conversaciones</span></div>
          <button className="chat-icon-button" onClick={() => setShowDirectory((value) => !value)} title="Nueva conversacion">
            {showDirectory ? <X size={18} /> : <Plus size={18} />}
          </button>
        </header>

        {showDirectory ? (
          <div className="chat-directory">
            <label className="chat-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar persona..." /></label>
            <div className="chat-directory-list">
              {filteredUsers.map((user) => (
                <button key={user.id} onClick={() => startConversation(user)}>
                  <Avatar name={user.full_name} />
                  <span><strong>{user.full_name}</strong><small>{user.email}</small></span>
                </button>
              ))}
              {filteredUsers.length === 0 && <p>No encontramos usuarios.</p>}
            </div>
          </div>
        ) : (
          <div className="chat-conversation-list">
            {conversations.map((conversation) => (
              <button className={conversation.id === activeId ? "active" : ""} key={conversation.id} onClick={() => setActiveId(conversation.id)}>
                <Avatar name={conversation.other_user.full_name} />
                <span className="chat-conversation-copy">
                  <span><strong>{conversation.other_user.full_name}</strong><time>{formatListTime(conversation.last_message_at)}</time></span>
                  <small>{conversation.last_message || "Conversacion nueva"}</small>
                </span>
                {conversation.unread_count > 0 && <b className="chat-unread">{conversation.unread_count > 99 ? "99+" : conversation.unread_count}</b>}
              </button>
            ))}
            {conversations.length === 0 && <div className="chat-list-empty"><Users size={22} /><p>Inicia una conversacion con alguien del equipo.</p></div>}
          </div>
        )}
      </aside>

      <div className="live-chat-main">
        {error && <div className="chat-error"><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
        {!activeConversation ? (
          <div className="chat-welcome"><MessageCircle size={30} /><h3>Tus conversaciones viven aqui</h3><p>Selecciona un chat o inicia uno nuevo con alguien del equipo.</p></div>
        ) : (
          <>
            <header className="chat-thread-header">
              <button className="chat-mobile-back" onClick={() => setActiveId(null)} title="Volver"><ArrowLeft size={18} /></button>
              <Avatar name={activeConversation.other_user.full_name} />
              <div><strong>{activeConversation.other_user.full_name}</strong><span>{activeConversation.other_user.email}</span></div>
            </header>
            <div className="chat-thread" ref={threadRef}>
              {messages.length === 0 && <div className="chat-thread-empty"><p>Este es el inicio de la conversacion.</p></div>}
              {messages.map((item) => {
                const mine = item.sender_user_id === me.id;
                return (
                  <div className={`chat-message-row ${mine ? "mine" : "theirs"}`} key={item.id}>
                    <div className="chat-message-bubble"><p>{item.body}</p><time>{formatMessageTime(item.created_at)}</time></div>
                  </div>
                );
              })}
            </div>
            <form className="chat-composer" onSubmit={handleSend}>
              <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={`Mensaje para ${activeConversation.other_user.full_name.split(" ")[0]}...`} maxLength={4000} />
              <button disabled={!message.trim() || sending} title="Enviar mensaje"><Send size={18} /></button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

function Avatar({ name }: { name: string }) {
  return <span className="chat-avatar">{name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U"}</span>;
}

function formatListTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
