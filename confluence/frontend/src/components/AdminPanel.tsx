import React, { useEffect, useMemo, useState } from "react";
import { Database, CheckCircle, Send, XCircle } from "lucide-react";
import { api, FeedbackItem } from "../api";

interface Space {
  id: string;
  name: string;
  key: string;
  description: string;
  is_restricted?: boolean;
  allowed_emails?: string;
  created_at: string;
}

interface Page {
  id: string;
  space_key: string;
  title: string;
  content: string;
  subtopics?: string;
  created_by_email: string;
  created_by_name: string;
  created_by_id: string;
  is_restricted: boolean;
  allowed_emails: string;
  created_at: string;
  updated_at: string;
}

interface AdminPanelProps {
  token: string | null;
  spaces: Space[];
  pages: Page[];
  onSeedData: () => void;
  seedLoading: boolean;
  seedSuccessMsg: string;
}

export default function AdminPanel({
  token,
  spaces,
  pages,
  onSeedData,
  seedLoading,
  seedSuccessMsg
}: AdminPanelProps) {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [replyById, setReplyById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState("");
  const [notice, setNotice] = useState("");
  const chatItems = feedback.filter((item) => item.title === "Chat con admin");
  const chatThreads = useMemo(() => {
    const grouped = new Map<string, FeedbackItem[]>();
    for (const item of chatItems) {
      const key = `${item.created_by_email}::${item.space_key || "general"}`;
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    return Array.from(grouped.entries()).map(([key, threadItems]) => {
      const sorted = threadItems.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const latest = sorted[sorted.length - 1];
      const pending = sorted.slice().reverse().find((item) => !item.public_response && item.status !== "closed") || latest;
      return { key, items: sorted, latest, pending };
    }).sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime());
  }, [chatItems]);

  useEffect(() => {
    api.adminFeedback(token).then(setFeedback).catch(() => {});
  }, [token]);

  async function respond(item: FeedbackItem) {
    const response = (replyById[item.id] || "").trim();
    if (!response) return;
    setSavingId(item.id);
    setNotice("");
    try {
      await api.respondFeedback(token, item.id, response);
      setReplyById((current) => ({ ...current, [item.id]: "" }));
      setNotice("Respuesta enviada.");
      setFeedback(await api.adminFeedback(token));
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo responder.");
    } finally {
      setSavingId("");
    }
  }

  async function closeChat(item: FeedbackItem) {
    setSavingId(item.id);
    setNotice("");
    try {
      await api.updateFeedbackStatus(token, item.id, "closed");
      setNotice("Chat cerrado.");
      setFeedback(await api.adminFeedback(token));
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo cerrar el chat.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="subview">
      <div className="admin-view-header">
        <h1>Consola Administrativa de GateWiki</h1>
        <p>Gestión del sistema, espacios y políticas de información respaldadas por MySQL.</p>
      </div>

      <div className="admin-grid">
        <div className="card">
          <div className="card-header">
            <h2>Resumen del Sistema</h2>
          </div>
          <div className="admin-stats">
            <div className="admin-stat-item">
              <span>Total Espacios:</span>
              <strong>{spaces.length}</strong>
            </div>
            <div className="admin-stat-item">
              <span>Total Páginas Registradas:</span>
              <strong>{pages.length}</strong>
            </div>
            <div className="admin-stat-item">
              <span>Páginas con Restricción:</span>
              <strong>{pages.filter(p => p.is_restricted).length}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Acciones de Administración</h2>
          </div>
          <div className="admin-actions-panel">
            <p>Como administrador, puedes inicializar los datos semilla por defecto en tu servidor MySQL local para realizar demostraciones rápidas de los permisos.</p>
            <button className="btn-primary" onClick={onSeedData} disabled={seedLoading}>
              <Database size={16} />
              <span>{seedLoading ? "Inicializando..." : "Inicializar Datos Demostrativos"}</span>
            </button>
            {seedSuccessMsg && (
              <div className="success-alert alert-box" style={{ marginTop: "16px", background: "var(--color-success-glow)", border: "1px solid rgba(16,185,129,0.3)", color: "#34d399" }}>
                <CheckCircle size={16} />
                <span>{seedSuccessMsg}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card admin-chat-card">
        <div className="card-header">
          <h2>Chat con usuarios</h2>
        </div>
        {notice && <div className="success-alert alert-box">{notice}</div>}
        {chatThreads.length === 0 && <p className="text-muted">Todavia no hay conversaciones de chat.</p>}
        <div className="wiki-admin-chat-list">
          {chatThreads.map((thread) => (
            <article className="wiki-admin-chat-thread" key={thread.key}>
              <div className="wiki-admin-chat-head">
                <div>
                  <strong>{thread.latest.created_by_name}</strong>
                  <span>{thread.latest.created_by_email} {thread.latest.space_key ? `- ${thread.latest.space_key}` : ""}</span>
                </div>
                <span className={`permission-badge ${thread.latest.status === "closed" ? "closed" : ""}`}>{thread.latest.status === "closed" ? "closed" : thread.pending.public_response ? "resolved" : "open"}</span>
              </div>
              <div className="wiki-admin-chat-messages">
                {thread.items.map((item) => (
                  <React.Fragment key={item.id}>
                    <div className="wiki-chat-bubble user">
                      <p>{item.message}</p>
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                    {item.public_response && (
                      <div className="wiki-chat-bubble admin">
                        <strong>{item.responded_by_name || "Admin"}</strong>
                        <p>{item.public_response}</p>
                        {item.responded_at && <span>{new Date(item.responded_at).toLocaleString()}</span>}
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
              {thread.latest.status === "closed" ? (
                <p className="text-muted">Chat cerrado. Si el usuario escribe de nuevo se abrira otro hilo.</p>
              ) : (
                <div className="wiki-admin-reply">
                  <textarea
                    value={replyById[thread.pending.id] || ""}
                    onChange={(event) => setReplyById((current) => ({ ...current, [thread.pending.id]: event.target.value }))}
                    placeholder="Responder en esta conversacion..."
                  />
                  <button className="btn-primary" disabled={savingId === thread.pending.id || !(replyById[thread.pending.id] || "").trim()} onClick={() => respond(thread.pending)}>
                    <Send size={16} /> Responder
                  </button>
                  <button className="btn-secondary" disabled={savingId === thread.latest.id} onClick={() => closeChat(thread.latest)}>
                    <XCircle size={16} /> Cerrar chat
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
