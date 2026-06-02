import { FormEvent, useEffect, useMemo, useState } from "react";
import { MessageSquareReply, NotebookPen, Send } from "lucide-react";
import { api, FeedbackItem, FeedbackStatus } from "../api";
import { EmptyState, StatusBadge } from "../components/ui";

export function FeedbackView({ permissions }: { permissions: string[] }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canRespond = permissions.includes("feedback:respond");
  const canUseInternalNotes = permissions.includes("feedback:internal");
  const activeItem = useMemo(() => items.find((item) => item.id === activeId) ?? items[0] ?? null, [items, activeId]);

  useEffect(() => {
    loadFeedback();
  }, []);

  useEffect(() => {
    setResponse(activeItem?.public_response ?? "");
    setNote("");
  }, [activeItem?.id]);

  async function loadFeedback() {
    setLoading(true);
    setError("");
    try {
      const data = await api.feedback();
      setItems(data);
      setActiveId((current) => current ?? data[0]?.id ?? null);
    } catch (err: any) {
      setError(err.message ?? "No se pudo cargar feedback");
    } finally {
      setLoading(false);
    }
  }

  async function handleRespond(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeItem) return;
    const updated = await api.respondFeedback(activeItem.id, response, "resolved");
    replaceFeedback(updated);
  }

  async function handleStatusChange(status: FeedbackStatus) {
    if (!activeItem) return;
    const updated = await api.updateFeedbackStatus(activeItem.id, status);
    replaceFeedback(updated);
  }

  async function handleInternalNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeItem || !note.trim()) return;
    const updated = await api.addFeedbackInternalNote(activeItem.id, note.trim());
    replaceFeedback(updated);
    setNote("");
  }

  function replaceFeedback(updated: FeedbackItem) {
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  if (loading) return <p className="toolbar-note">Cargando feedback...</p>;

  return (
    <div className="feedback-layout">
      {error && <p className="load-error">{error}</p>}
      <section className="table-surface feedback-list">
        <div>
          <h3>Feedback</h3>
          <p className="toolbar-note">Entradas enviadas desde GateWiki y otras apps conectadas.</p>
        </div>
        {items.length === 0 && <EmptyState text="No hay feedback registrado." />}
        {items.map((item) => (
          <button
            className={`feedback-list-item ${activeItem?.id === item.id ? "active" : ""}`}
            key={item.id}
            onClick={() => setActiveId(item.id)}
          >
            <span>
              <strong>{item.title}</strong>
              <small>{item.created_by_name} · {item.source_app}</small>
            </span>
            <StatusBadge value={item.status} />
          </button>
        ))}
      </section>

      {activeItem && (
        <section className="table-surface feedback-detail">
          <div className="split-toolbar">
            <div>
              <h3>{activeItem.title}</h3>
              <p className="toolbar-note">
                {activeItem.created_by_name} · {activeItem.created_by_email}
                {activeItem.page_title ? ` · ${activeItem.space_key}/${activeItem.page_title}` : ""}
              </p>
            </div>
            <select value={activeItem.status} onChange={(event) => handleStatusChange(event.target.value as FeedbackStatus)} disabled={!canRespond}>
              <option value="open">open</option>
              <option value="in_progress">in_progress</option>
              <option value="resolved">resolved</option>
              <option value="closed">closed</option>
            </select>
          </div>

          <div className="feedback-message">
            <MessageSquareReply />
            <p>{activeItem.message}</p>
          </div>

          <form className="feedback-form" onSubmit={handleRespond}>
            <label>
              Respuesta publica
              <textarea
                value={response}
                onChange={(event) => setResponse(event.target.value)}
                rows={5}
                placeholder="Respuesta que vera el usuario en GateWiki"
                disabled={!canRespond}
                required
              />
            </label>
            <button className="primary compact" disabled={!canRespond}>
              <Send />
              Responder
            </button>
          </form>

          {canUseInternalNotes && (
            <section className="internal-notes">
              <h4>Comentarios internos</h4>
              {activeItem.internal_notes.length === 0 && <p className="toolbar-note">Sin notas internas.</p>}
              {activeItem.internal_notes.map((internalNote) => (
                <article className="internal-note" key={internalNote.id}>
                  <strong>{internalNote.author_name}</strong>
                  <p>{internalNote.note}</p>
                </article>
              ))}
              <form className="feedback-form" onSubmit={handleInternalNote}>
                <label>
                  Nueva nota interna
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Solo visible para administradores con permiso" />
                </label>
                <button className="secondary-action compact">
                  <NotebookPen />
                  Guardar nota interna
                </button>
              </form>
            </section>
          )}
        </section>
      )}
    </div>
  );
}
