import React, { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, ExternalLink, Send, X } from "lucide-react";
import { AiChatResponse, api, Page } from "../api";

interface ChatTurn {
  id: string;
  question: string;
  response: AiChatResponse;
}

interface AiChatModalProps {
  token: string | null;
  activePage: Page | null;
  activeSpaceFilter: string | null;
  open: boolean;
  onClose: () => void;
  onReadPage: (id: string) => void;
}

export default function AiChatModal({
  token,
  activePage,
  activeSpaceFilter,
  open,
  onClose,
  onReadPage
}: AiChatModalProps) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, loading, open]);

  if (!open) return null;

  const scopeLabel = activePage
    ? `Pagina actual: ${activePage.title}`
    : activeSpaceFilter
      ? `Workspace ${activeSpaceFilter}`
      : "Todos los wikis visibles";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const body = message.trim();
    if (!body) return;

    setLoading(true);
    setError("");
    try {
      const response = await api.aiChat(token, {
        message: body,
        space_key: activePage ? activePage.space_key : activeSpaceFilter,
        page_id: activePage?.id ?? null
      });
      setTurns((current) => [
        ...current,
        {
          id: `${Date.now()}-${current.length}`,
          question: body,
          response
        }
      ]);
      setMessage("");
    } catch (err: any) {
      setError(err.message || "No se pudo consultar el asistente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card ai-chat-modal">
        <div className="modal-header">
          <div className="ai-chat-title">
            <Bot size={18} />
            <div>
              <h2>Asistente GateWiki</h2>
              <span>{scopeLabel}</span>
            </div>
          </div>
          <button className="btn-close-modal" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="ai-chat-thread" ref={threadRef}>
          {turns.length === 0 && (
            <div className="ai-chat-empty">
              <Bot size={24} />
              <h3>Pregunta sobre el conocimiento guardado</h3>
              <p>El asistente buscara solo en paginas que puedes ver y te mostrara las fuentes usadas.</p>
            </div>
          )}

          {turns.map((turn) => (
            <React.Fragment key={turn.id}>
              <div className="wiki-chat-bubble mine ai-question">
                <p>{turn.question}</p>
              </div>
              <div className="wiki-chat-bubble admin ai-answer">
                <strong>GateWiki AI</strong>
                <p>{turn.response.answer}</p>
                <span>{turn.response.searched_pages} paginas revisadas</span>
              </div>
              {turn.response.sources.length > 0 && (
                <div className="ai-chat-sources">
                  {turn.response.sources.map((source) => (
                    <button
                      type="button"
                      className="ai-chat-source"
                      key={`${turn.id}-${source.page_id}-${source.score}`}
                      onClick={() => {
                        onReadPage(source.page_id);
                        onClose();
                      }}
                    >
                      <div>
                        <strong>{source.page_title}</strong>
                        <span>{source.space_key} - relevancia {source.score.toFixed(1)}</span>
                      </div>
                      <ExternalLink size={14} />
                    </button>
                  ))}
                </div>
              )}
            </React.Fragment>
          ))}

          {loading && (
            <div className="wiki-chat-bubble admin ai-answer">
              <strong>GateWiki AI</strong>
              <p>Buscando en los wikis visibles...</p>
            </div>
          )}
        </div>

        {error && <p className="feedback-notice ai-chat-error">{error}</p>}

        <form className="wiki-chat-composer ai-chat-composer" onSubmit={handleSubmit}>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Pregunta algo sobre estos wikis..."
            maxLength={1200}
          />
          <button className="btn-primary" disabled={loading || !message.trim()}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
