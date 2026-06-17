import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquarePlus, Send, X } from "lucide-react";
import { api, FeedbackItem, Page } from "../api";

interface FeedbackModalProps {
  token: string | null;
  activePage: Page | null;
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ token, activePage, open, onClose }: FeedbackModalProps) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [reopenChat, setReopenChat] = useState(false);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const chatItems = useMemo(
    () => items.filter((item) => item.title === "Chat con admin").slice().reverse(),
    [items]
  );
  const formalItems = useMemo(
    () => items.filter((item) => item.title !== "Chat con admin"),
    [items]
  );
  const latestChat = chatItems[chatItems.length - 1];
  const chatClosed = latestChat?.status === "closed" && !reopenChat;

  useEffect(() => {
    if (!open) return;
    api.myFeedback(token).then(setItems).catch(() => {});
    setTitle(activePage ? `Feedback: ${activePage.title}` : "");
    setMessage("");
    setNotice("");
  }, [open, activePage?.id, token]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => api.myFeedback(token).then(setItems).catch(() => {}), 5000);
    return () => window.clearInterval(timer);
  }, [open, token]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [chatItems.length]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    try {
      const created = await api.createFeedback(token, {
        title,
        message,
        page_id: activePage?.id ?? null,
        page_title: activePage?.title ?? null,
        space_key: activePage?.space_key ?? null,
      });
      setItems((current) => [created, ...current]);
      setMessage("");
      setNotice("Feedback enviado. Un administrador podra responderlo desde GateStack.");
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo enviar feedback.");
    } finally {
      setLoading(false);
    }
  }

  async function handleChatSubmit(event: FormEvent) {
    event.preventDefault();
    const body = chatMessage.trim();
    if (!body) return;
    setChatLoading(true);
    setNotice("");
    try {
      const created = await api.createFeedback(token, {
        title: "Chat con admin",
        message: body.length < 5 ? body.padEnd(5, " ") : body,
        page_id: activePage?.id ?? null,
        page_title: activePage?.title ?? null,
        space_key: activePage?.space_key ?? null,
      });
      setItems((current) => [created, ...current]);
      setChatMessage("");
      setReopenChat(false);
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo enviar el mensaje.");
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card feedback-modal">
        <div className="modal-header">
          <h2>Feedback</h2>
          <button className="btn-close-modal" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <section className="gatewiki-feedback-chat">
          <div className="modal-subheader">
            <h3>Chat con admin</h3>
            <span>Actualiza en vivo</span>
          </div>
          <div className="gatewiki-chat-thread" ref={chatRef}>
            {chatItems.length === 0 && <p className="text-muted">Aun no hay mensajes de chat.</p>}
            {chatItems.map((item) => (
              <React.Fragment key={item.id}>
                <div className="wiki-chat-bubble mine">
                  <p>{item.message}</p>
                  <span>{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {item.status}</span>
                </div>
                {item.public_response && (
                  <div className="wiki-chat-bubble admin">
                    <strong>{item.responded_by_name || "Admin"}</strong>
                    <p>{item.public_response}</p>
                    {item.responded_at && <span>{new Date(item.responded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
          <form className="wiki-chat-composer" onSubmit={handleChatSubmit}>
            {chatClosed ? (
              <>
                <input value="Este chat fue cerrado por admin." readOnly />
                <button type="button" className="btn-primary" onClick={() => setReopenChat(true)}>Abrir nuevo chat</button>
              </>
            ) : (
              <>
                <input value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} placeholder="Escribe un mensaje para admin..." />
                <button className="btn-primary" disabled={chatLoading || !chatMessage.trim()}><Send size={16} /></button>
              </>
            )}
          </form>
        </section>

        <form onSubmit={handleSubmit} className="feedback-submit-form">
          <div className="modal-subheader">
            <h3>Feedback formal</h3>
            <span>Soporte, bugs y contenido</span>
          </div>
          <div className="form-group">
            <label>Titulo</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} />
          </div>
          <div className="form-group">
            <label>Mensaje</label>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} required placeholder="Describe la duda, problema o sugerencia" />
          </div>
          {notice && <p className="feedback-notice">{notice}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
            <button className="btn-primary" disabled={loading}>
              <MessageSquarePlus size={16} />
              {loading ? "Enviando..." : "Enviar feedback"}
            </button>
          </div>
        </form>

        <section className="feedback-history">
          <h3>Mis requests</h3>
          {formalItems.length === 0 && <p className="text-muted">Aun no has enviado feedback formal.</p>}
          {formalItems.map((item) => (
            <article className="feedback-history-item" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.status}</span>
              </div>
              <p>{item.message}</p>
              {item.public_response && (
                <div className="feedback-response-box">
                  <strong>Respuesta admin</strong>
                  <p>{item.public_response}</p>
                </div>
              )}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
