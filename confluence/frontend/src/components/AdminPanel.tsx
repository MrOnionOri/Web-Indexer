import React, { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle, ChevronDown, ChevronUp, Clock3, Database, RefreshCw, Search, Send, ShieldAlert, XCircle } from "lucide-react";
import { AiInteraction, AiReviewStatus, api, FeedbackItem } from "../api";
import MarkdownContent from "./MarkdownContent";

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
  const [aiInteractions, setAiInteractions] = useState<AiInteraction[]>([]);
  const [aiSearch, setAiSearch] = useState("");
  const [aiStatus, setAiStatus] = useState<"all" | AiReviewStatus>("all");
  const [aiExpanded, setAiExpanded] = useState<Set<string>>(new Set());
  const [aiNotes, setAiNotes] = useState<Record<string, string>>({});
  const [aiSavingId, setAiSavingId] = useState("");
  const [aiLoading, setAiLoading] = useState(true);
  const [aiNotice, setAiNotice] = useState("");
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

  const filteredAiInteractions = useMemo(() => {
    const query = aiSearch.trim().toLowerCase();
    return aiInteractions.filter((item) => {
      if (aiStatus !== "all" && item.review_status !== aiStatus) return false;
      if (!query) return true;
      return [item.question, item.answer, item.user_name, item.user_email, item.space_key, item.page_title, item.engine]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [aiInteractions, aiSearch, aiStatus]);

  const aiSessions = useMemo(() => {
    const matchingIds = new Set(filteredAiInteractions.map((item) => item.id));
    const grouped = new Map<string, AiInteraction[]>();
    for (const item of aiInteractions) {
      const key = item.session_id || item.id;
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    return Array.from(grouped.entries()).map(([id, items]) => {
      const turns = items.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return { id, turns, first: turns[0], latest: turns[turns.length - 1] };
    }).filter((session) => session.turns.some((item) => matchingIds.has(item.id)))
      .sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime());
  }, [aiInteractions, filteredAiInteractions]);

  useEffect(() => {
    Promise.all([
      api.adminFeedback(token).then(setFeedback),
      api.adminAiInteractions(token).then((items) => {
        setAiInteractions(items);
        setAiNotes(Object.fromEntries(items.map((item) => [item.id, item.review_note || ""])));
      })
    ]).catch(() => {}).finally(() => setAiLoading(false));
  }, [token]);

  async function refreshAiInteractions() {
    setAiLoading(true);
    setAiNotice("");
    try {
      const items = await api.adminAiInteractions(token);
      setAiInteractions(items);
      setAiNotes(Object.fromEntries(items.map((item) => [item.id, item.review_note || ""])));
    } catch (err: any) {
      setAiNotice(err.message ?? "No se pudieron actualizar los registros de IA.");
    } finally {
      setAiLoading(false);
    }
  }

  async function reviewAi(item: AiInteraction, status: AiReviewStatus) {
    setAiSavingId(item.id);
    setAiNotice("");
    try {
      const updated = await api.reviewAiInteraction(token, item.id, status, aiNotes[item.id] || "");
      setAiInteractions((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setAiNotice(status === "expected" ? "Respuesta marcada como esperada." : "Respuesta marcada como inesperada.");
    } catch (err: any) {
      setAiNotice(err.message ?? "No se pudo guardar la revision de IA.");
    } finally {
      setAiSavingId("");
    }
  }

  function toggleAiRecord(id: string) {
    setAiExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

      <section className="admin-ai-audit">
        <div className="admin-ai-audit-header">
          <div>
            <span className="admin-section-kicker"><Bot size={15} /> Observabilidad</span>
            <h2>Sesiones del asistente IA</h2>
            <p>Conversaciones completas cifradas para revisar contexto, calidad y comportamientos no esperados.</p>
          </div>
          <button className="btn-icon" type="button" onClick={() => void refreshAiInteractions()} title="Actualizar registros" disabled={aiLoading}>
            <RefreshCw size={17} className={aiLoading ? "spin" : ""} />
          </button>
        </div>

        <div className="admin-ai-stats">
          <div><strong>{new Set(aiInteractions.map((item) => item.session_id || item.id)).size}</strong><span>Sesiones</span></div>
          <div><strong>{aiInteractions.filter((item) => item.review_status === "unreviewed").length}</strong><span>Sin revisar</span></div>
          <div><strong>{aiInteractions.filter((item) => item.review_status === "unexpected").length}</strong><span>Inesperadas</span></div>
          <div><strong>{aiInteractions.length ? Math.round(aiInteractions.reduce((sum, item) => sum + item.duration_ms, 0) / aiInteractions.length) : 0} ms</strong><span>Latencia media</span></div>
        </div>

        <div className="admin-ai-toolbar">
          <label className="admin-ai-search">
            <Search size={16} />
            <input value={aiSearch} onChange={(event) => setAiSearch(event.target.value)} placeholder="Buscar usuario, pregunta o respuesta..." />
          </label>
          <select value={aiStatus} onChange={(event) => setAiStatus(event.target.value as "all" | AiReviewStatus)} aria-label="Filtrar estado de revision">
            <option value="all">Todos los estados</option>
            <option value="unreviewed">Sin revisar</option>
            <option value="expected">Esperadas</option>
            <option value="unexpected">Inesperadas</option>
          </select>
        </div>

        {aiNotice && <div className="success-alert alert-box admin-ai-notice">{aiNotice}</div>}

        {aiLoading && <p className="text-muted admin-ai-empty">Cargando registros...</p>}
        {!aiLoading && aiSessions.length === 0 && <p className="text-muted admin-ai-empty">No hay sesiones que coincidan con el filtro.</p>}
        <div className="admin-ai-records">
          {aiSessions.map((session) => {
            const expanded = aiExpanded.has(session.id);
            const item = session.latest;
            const scope = item.page_title || (item.space_key ? `Workspace ${item.space_key}` : "Todos los wikis");
            return (
              <article className={`admin-ai-record status-${session.turns.some((turn) => turn.review_status === "unexpected") ? "unexpected" : item.review_status}`} key={session.id}>
                <button type="button" className="admin-ai-record-summary" onClick={() => toggleAiRecord(session.id)}>
                  <div className="admin-ai-record-main">
                    <div className="admin-ai-record-user">
                      <strong>{item.user_name}</strong>
                      <span>{item.user_email}</span>
                    </div>
                    <p>{item.question}</p>
                    <div className="admin-ai-record-meta">
                      <span>{session.turns.length} {session.turns.length === 1 ? "turno" : "turnos"}</span>
                      <span>{scope}</span>
                      <span>{item.engine}{item.model_name ? ` · ${item.model_name}` : ""}</span>
                      <span><Clock3 size={12} /> {item.duration_ms} ms</span>
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <span className={`admin-ai-review-badge ${item.review_status}`}>
                    {item.review_status === "expected" ? "Esperada" : item.review_status === "unexpected" ? "Inesperada" : "Sin revisar"}
                  </span>
                  {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                </button>

                {expanded && (
                  <div className="admin-ai-session-detail">
                    {session.turns.map((item, turnIndex) => (
                    <section className="admin-ai-record-detail admin-ai-session-turn" key={item.id}>
                    <div className="admin-ai-turn-heading">
                      <strong>Turno {turnIndex + 1}</strong>
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                    <div className="admin-ai-question">
                      <span>Usuario</span>
                      <p>{item.question}</p>
                    </div>
                    <div className="admin-ai-answer">
                      <span>Respuesta registrada</span>
                      <MarkdownContent content={item.answer} />
                    </div>
                    <div className="admin-ai-source-summary">
                      <span>{item.searched_pages} paginas revisadas</span>
                      <span>{item.source_count} fuentes usadas</span>
                      <span className={`admin-ai-confidence ${item.confidence_level}`} title={item.confidence_notice}>
                        {item.confidence_level === "high" ? "Respaldo alto" : item.confidence_level === "medium" ? "Respaldo medio" : item.confidence_level === "low" ? "Respaldo bajo" : "Sin respaldo"}
                      </span>
                      {item.sources.map((source) => <span key={`${item.id}-${source.page_id}`}>{source.page_title} · {source.score}</span>)}
                    </div>
                    <textarea
                      value={aiNotes[item.id] || ""}
                      onChange={(event) => setAiNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder="Nota de revision: que hizo bien, que fallo o como deberia responder..."
                      maxLength={2000}
                    />
                    <div className="admin-ai-review-actions">
                      <span className={`admin-ai-review-badge ${item.review_status}`}>
                        {item.review_status === "expected" ? "Esperada" : item.review_status === "unexpected" ? "Inesperada" : "Sin revisar"}
                      </span>
                      <button type="button" className="btn-secondary" disabled={aiSavingId === item.id} onClick={() => void reviewAi(item, "expected")}>
                        <CheckCircle size={15} /> Marcar esperada
                      </button>
                      <button type="button" className="btn-danger" disabled={aiSavingId === item.id} onClick={() => void reviewAi(item, "unexpected")}>
                        <ShieldAlert size={15} /> Marcar inesperada
                      </button>
                    </div>
                    </section>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

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
