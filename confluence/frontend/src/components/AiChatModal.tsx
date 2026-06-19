import React, { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { AiChatResponse, api, Page } from "../api";
import MarkdownContent from "./MarkdownContent";

interface ChatTurn {
  id: string;
  question: string;
  response: AiChatResponse;
}

interface AiChatModalProps {
  token: string | null;
  userId: string;
  activePage: Page | null;
  activeSpaceFilter: string | null;
  open: boolean;
  onClose: () => void;
  onReadPage: (id: string) => void;
}

const GENERAL_PROMPTS = [
  "Que temas importantes hay documentados?",
  "Resume la informacion mas relevante",
  "Que configuraciones aparecen en los wikis?"
];

export default function AiChatModal({
  token,
  userId,
  activePage,
  activeSpaceFilter,
  open,
  onClose,
  onReadPage
}: AiChatModalProps) {
  const storageKey = `gatewiki_ai_chat:${userId}`;
  const [message, setMessage] = useState("");
  const [sessionId, setSessionId] = useState(() => loadConversation(storageKey).sessionId);
  const [turns, setTurns] = useState<ChatTurn[]>(() => loadConversation(storageKey).turns);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [maximized, setMaximized] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const scopeLabel = activePage
    ? activePage.title
    : activeSpaceFilter
      ? `Workspace ${activeSpaceFilter}`
      : "Todos los wikis visibles";

  const suggestions = useMemo(() => {
    if (activePage) {
      return [
        "Resume esta pagina",
        "Cuales son los puntos clave?",
        "Que configuraciones menciona?"
      ];
    }
    if (activeSpaceFilter) {
      return [
        "Resume este workspace",
        "Que temas principales contiene?",
        "Que procesos estan documentados?"
      ];
    }
    return GENERAL_PROMPTS;
  }, [activePage, activeSpaceFilter]);

  useEffect(() => {
    if (!open) return;
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, loading, open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => composerRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const stored = loadConversation(storageKey);
    setSessionId(stored.sessionId);
    setTurns(stored.turns);
    setExpandedSources(new Set());
    setError("");
    setMessage("");
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ sessionId, turns }));
  }, [sessionId, storageKey, turns]);

  if (!open) return null;

  async function submitMessage(body: string) {
    const cleanBody = body.trim();
    if (!cleanBody || loading) return;

    setMessage("");
    setLoading(true);
    setError("");
    try {
      const response = await api.aiChat(token, {
        message: cleanBody,
        session_id: sessionId,
        history: turns.slice(-4).map((turn) => ({ question: turn.question, answer: turn.response.answer })),
        space_key: activePage ? activePage.space_key : activeSpaceFilter,
        page_id: activePage?.id ?? null
      });
      setTurns((current) => [
        ...current,
        {
          id: `${Date.now()}-${current.length}`,
          question: cleanBody,
          response
        }
      ]);
    } catch (err: any) {
      setMessage(cleanBody);
      setError(err.message || "No se pudo consultar el asistente.");
    } finally {
      setLoading(false);
      window.setTimeout(() => composerRef.current?.focus(), 0);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submitMessage(message);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage(message);
    }
  }

  function toggleSources(turnId: string) {
    setExpandedSources((current) => {
      const next = new Set(current);
      if (next.has(turnId)) next.delete(turnId);
      else next.add(turnId);
      return next;
    });
  }

  function clearConversation() {
    setSessionId(createSessionId());
    setTurns([]);
    setExpandedSources(new Set());
    setError("");
    setMessage("");
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  return (
    <div className="modal-overlay ai-chat-overlay">
      <section className={`modal-card ai-chat-modal${maximized ? " is-maximized" : ""}`} aria-label="Asistente GateWiki">
        <header className="ai-chat-header">
          <div className="ai-chat-title">
            <span className="ai-chat-brand-icon"><Sparkles size={18} /></span>
            <div>
              <h2>Asistente GateWiki</h2>
              <span className="ai-chat-scope"><BookOpen size={12} /> {scopeLabel}</span>
            </div>
          </div>
          <div className="ai-chat-header-actions">
            <button
              type="button"
              className="btn-icon ai-chat-header-button ai-chat-maximize"
              onClick={() => setMaximized((current) => !current)}
              title={maximized ? "Restaurar ventana" : "Maximizar ventana"}
              aria-label={maximized ? "Restaurar ventana" : "Maximizar ventana"}
              aria-pressed={maximized}
            >
              {maximized ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            {turns.length > 0 && (
              <button type="button" className="btn-icon ai-chat-header-button" onClick={clearConversation} title="Limpiar conversacion">
                <Trash2 size={17} />
              </button>
            )}
            <button type="button" className="btn-icon ai-chat-header-button" onClick={onClose} title="Cerrar asistente">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="ai-chat-thread" ref={threadRef} aria-live="polite">
          {turns.length === 0 && !loading && (
            <div className="ai-chat-welcome">
              <span className="ai-chat-welcome-icon"><Bot size={24} /></span>
              <div>
                <h3>Que quieres consultar?</h3>
                <p>Pregunta sobre el contenido disponible en {scopeLabel.toLowerCase()}.</p>
              </div>
              <div className="ai-chat-suggestions">
                {suggestions.map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => void submitMessage(suggestion)}>
                    <Sparkles size={14} />
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => {
            const sourcesOpen = expandedSources.has(turn.id);
            return (
              <div className="ai-chat-exchange" key={turn.id}>
                <div className="ai-chat-user-row">
                  <div className="ai-chat-message ai-chat-user-message">{turn.question}</div>
                </div>

                <div className="ai-chat-assistant-row">
                  <span className="ai-chat-avatar"><Bot size={16} /></span>
                  <div className="ai-chat-assistant-content">
                    <div className="ai-chat-assistant-label">GateWiki AI</div>
                    <div className="ai-chat-message ai-chat-assistant-message">
                      <MarkdownContent content={turn.response.answer} variant="chat" />
                    </div>

                    <div className="ai-chat-response-meta">
                      {turn.response.searched_pages > 0 && <span>{turn.response.searched_pages} paginas revisadas</span>}
                      {turn.response.sources.length > 0 && (
                        <button type="button" onClick={() => toggleSources(turn.id)} aria-expanded={sourcesOpen}>
                          <BookOpen size={13} />
                          {turn.response.sources.length === 1 ? "1 fuente" : `${turn.response.sources.length} fuentes`}
                          {sourcesOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      )}
                    </div>

                    {sourcesOpen && (
                      <div className="ai-chat-sources">
                        {turn.response.sources.map((source) => (
                          <button
                            type="button"
                            className="ai-chat-source"
                            key={`${turn.id}-${source.page_id}-${source.score}`}
                            onClick={() => {
                              if (source.page_id) {
                                onReadPage(source.page_id);
                                onClose();
                              }
                            }}
                            disabled={!source.page_id}
                          >
                            <span className="ai-chat-source-icon"><BookOpen size={15} /></span>
                            <span className="ai-chat-source-copy">
                              <strong>{source.page_title}</strong>
                              <small>{source.space_key}{source.subtopic_title ? ` · ${source.subtopic_title}` : ""} · relevancia {source.score.toFixed(1)}</small>
                            </span>
                            {source.page_id && <ExternalLink size={14} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="ai-chat-assistant-row ai-chat-loading-row">
              <span className="ai-chat-avatar"><Bot size={16} /></span>
              <div className="ai-chat-thinking">
                <span></span><span></span><span></span>
                <small>Consultando GateWiki</small>
              </div>
            </div>
          )}
        </div>

        {error && <div className="ai-chat-error" role="alert">{error}</div>}

        <form className="ai-chat-composer" onSubmit={handleSubmit}>
          <div className="ai-chat-input-shell">
            <textarea
              ref={composerRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Pregunta sobre GateWiki..."
              maxLength={1200}
              rows={1}
            />
            <span className="ai-chat-char-count">{message.length}/1200</span>
          </div>
          <button className="ai-chat-send" disabled={loading || !message.trim()} title="Enviar pregunta" aria-label="Enviar pregunta">
            <Send size={17} />
          </button>
        </form>
      </section>
    </div>
  );
}

function createSessionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`.slice(0, 36);
}

function loadConversation(storageKey: string): { sessionId: string; turns: ChatTurn[] } {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (stored && typeof stored.sessionId === "string" && Array.isArray(stored.turns)) {
      return { sessionId: stored.sessionId, turns: stored.turns };
    }
  } catch {
    // Un historial local corrupto no debe impedir abrir el asistente.
  }
  return { sessionId: createSessionId(), turns: [] };
}
