import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Headset, Send, UserCheck, X } from "lucide-react";
import { api, CHAT_WS_URL, ChatConversation, ChatMessage, Me } from "../api";

type Scope = "open" | "mine" | "closed";

export function AgentSupportView({ me }: { me: Me }) {
  const [scope, setScope] = useState<Scope>("open");
  const [items, setItems] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const active = items.find((item) => item.id === activeId) ?? null;

  const reload = useCallback(async () => {
    try {
      const next = await api.supportQueue(scope);
      setItems(next);
      setActiveId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    } catch (err: any) { setError(err.message ?? "No se pudo cargar la cola de soporte."); }
  }, [scope]);

  const loadMessages = useCallback(async (id: string) => {
    try { setMessages(await api.chatMessages(id)); await api.markChatRead(id); }
    catch (err: any) { setError(err.message ?? "No se pudo abrir el chat."); }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { activeId ? loadMessages(activeId) : setMessages([]); }, [activeId, loadMessages]);
  useEffect(() => {
    let socket: WebSocket | null = null; let timer = 0; let stopped = false;
    const connect = () => {
      socket = new WebSocket(CHAT_WS_URL);
      socket.onmessage = (event) => {
        const update = JSON.parse(event.data); reload();
        if (activeId && update.conversation_id === activeId) loadMessages(activeId);
      };
      socket.onclose = () => { if (!stopped) timer = window.setTimeout(connect, 1800); };
    };
    connect(); return () => { stopped = true; clearTimeout(timer); socket?.close(); };
  }, [activeId, loadMessages, reload]);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  async function claim() {
    if (!active) return; setBusy(true); setError("");
    try { await api.claimSupportChat(active.id); setScope("mine"); }
    catch (err: any) { setError(err.message ?? "Otro administrador ya tomo el chat."); await reload(); }
    finally { setBusy(false); }
  }

  async function close() {
    if (!active || !window.confirm("¿Finalizar este chat de soporte?")) return;
    setBusy(true); try { await api.closeSupportChat(active.id); setActiveId(null); await reload(); }
    catch (err: any) { setError(err.message ?? "No se pudo finalizar el chat."); }
    finally { setBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault(); if (!active || !message.trim()) return;
    setBusy(true); try { await api.sendChatMessage(active.id, message.trim()); setMessage(""); await loadMessages(active.id); }
    catch (err: any) { setError(err.message ?? "No se pudo enviar el mensaje."); }
    finally { setBusy(false); }
  }

  const mine = active?.claimed_by?.id === me.id;
  return <section className={`live-chat support-console ${active ? "has-active" : ""}`}>
    <aside className="live-chat-sidebar">
      <header className="live-chat-sidebar-header"><div><strong>Soporte en vivo</strong><span>{items.length} solicitudes</span></div><Headset size={20} /></header>
      <div className="support-tabs">
        <button className={scope === "open" ? "active" : ""} onClick={() => setScope("open")}><Clock3 size={15} /> En espera</button>
        <button className={scope === "mine" ? "active" : ""} onClick={() => setScope("mine")}><UserCheck size={15} /> Mis chats</button>
        <button className={scope === "closed" ? "active" : ""} onClick={() => setScope("closed")}><CheckCircle2 size={15} /> Cerrados</button>
      </div>
      <div className="chat-conversation-list">
        {items.map((item) => <button className={item.id === activeId ? "active" : ""} key={item.id} onClick={() => setActiveId(item.id)}>
          <Avatar name={item.requester.full_name} />
          <span className="chat-conversation-copy"><span><strong>{item.requester.full_name}</strong><time>{appLabel(item.source_app)}</time></span><small>{item.last_message}</small></span>
          {item.unread_count > 0 && <b className="chat-unread">{item.unread_count}</b>}
        </button>)}
        {!items.length && <div className="chat-list-empty"><Headset size={24} /><p>No hay solicitudes en esta bandeja.</p></div>}
      </div>
    </aside>
    <div className="live-chat-main">
      {error && <div className="chat-error"><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
      {!active ? <div className="chat-welcome"><Headset size={32} /><h3>Cola de ayuda</h3><p>Selecciona una solicitud para revisarla.</p></div> : <>
        <header className="chat-thread-header"><button className="chat-mobile-back" onClick={() => setActiveId(null)}><ArrowLeft size={18} /></button><Avatar name={active.requester.full_name} />
          <div><strong>{active.requester.full_name}</strong><span>{active.requester.email} · {appLabel(active.source_app)}</span></div>
          <div className="support-header-actions">{active.status === "open" && <button onClick={claim} disabled={busy}><UserCheck size={16} /> Tomar chat</button>}{mine && <button className="danger-soft" onClick={close} disabled={busy}><CheckCircle2 size={16} /> Finalizar</button>}</div>
        </header>
        {active.status === "claimed" && !mine && <div className="support-owner-note">Atendido por {active.claimed_by?.full_name}. Este chat es de solo lectura.</div>}
        <div className="chat-thread" ref={threadRef}>{messages.map((item) => <div className={`chat-message-row ${item.sender_user_id === me.id ? "mine" : "theirs"}`} key={item.id}><div className="chat-message-bubble"><strong>{item.sender_name}</strong><p>{item.body}</p><time>{formatTime(item.created_at)}</time></div></div>)}</div>
        {mine && active.status === "claimed" ? <form className="chat-composer" onSubmit={send}><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Escribe una respuesta..." maxLength={4000}/><button disabled={busy || !message.trim()}><Send size={18}/></button></form> : <div className="support-readonly">{active.status === "open" ? "Toma el chat para responder." : active.status === "closed" ? "Chat finalizado." : "Solo el administrador asignado puede responder."}</div>}
      </>}
    </div>
  </section>;
}

function Avatar({ name }: { name: string }) { return <span className="chat-avatar">{name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U"}</span>; }
function formatTime(value: string) { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function appLabel(value: string) { return ({ gatewiki: "GateWiki", gatestorage: "GateStorage", gatestack: "GateStack" } as Record<string,string>)[value] ?? value; }
