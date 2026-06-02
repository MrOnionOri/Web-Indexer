import React, { FormEvent, useEffect, useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    api.myFeedback(token).then(setItems).catch(() => {});
    setTitle(activePage ? `Feedback: ${activePage.title}` : "");
    setMessage("");
    setNotice("");
  }, [open, activePage?.id, token]);

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

  return (
    <div className="modal-overlay">
      <div className="modal-card feedback-modal">
        <div className="modal-header">
          <h2>Feedback</h2>
          <button className="btn-close-modal" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="feedback-submit-form">
          <div className="form-group">
            <label>Titulo</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} />
          </div>
          <div className="form-group">
            <label>Mensaje</label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              required
              placeholder="Describe la duda, problema o sugerencia"
            />
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
          {items.length === 0 && <p className="text-muted">Aun no has enviado feedback.</p>}
          {items.map((item) => (
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
