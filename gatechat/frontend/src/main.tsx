import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  ChevronDown,
  Cpu,
  MessageSquarePlus,
  PanelRight,
  Save,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2
} from "lucide-react";
import { api, ChatMessage, ChatSession, ChatSettings, defaultSettings, ModelInfo, TokenUsage } from "./api";
import "./style.css";

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sessionSubtitle(session: ChatSession) {
  return `${session.model} · temp ${session.temperature}`;
}

function estimateTokens(value: string) {
  if (!value) return 0;
  return Math.max(1, Math.round(value.length / 4));
}

function localTokenUsage(messages: ChatMessage[], settings: ChatSettings): TokenUsage {
  const stored = estimateTokens(settings.system_prompt) + messages.reduce((sum, item) => sum + estimateTokens(item.content), 0);
  const sentMessages = messages.slice(-24);
  const prompt = estimateTokens(settings.system_prompt) + sentMessages.reduce((sum, item) => sum + estimateTokens(item.content), 0);
  return {
    stored_tokens_estimate: stored,
    prompt_tokens_estimate: prompt,
    context_window: settings.num_ctx,
    context_usage_ratio: settings.num_ctx ? Math.min(1, prompt / settings.num_ctx) : 0,
    messages_stored: messages.length,
    messages_sent: sentMessages.length,
    estimator: "chars/4"
  };
}

function TokenRing({ usage }: { usage: TokenUsage }) {
  const percent = Math.min(100, Math.round(usage.context_usage_ratio * 100));
  return (
    <div
      className="token-ring"
      style={{ "--token-percent": `${percent}%` } as React.CSSProperties}
      title={`${usage.prompt_tokens_estimate}/${usage.context_window} tokens estimados`}
    >
      <span>{percent}%</span>
    </div>
  );
}

function CodeAwareMessage({ content }: { content: string }) {
  const parts = content.split(/```/g);
  if (parts.length === 1) return <p className="message-text">{content}</p>;
  return (
    <div className="message-text">
      {parts.map((part, index) => {
        if (index % 2 === 0) return <span key={index}>{part}</span>;
        const [firstLine, ...rest] = part.split("\n");
        const hasLang = firstLine.trim().length > 0 && !firstLine.includes(" ");
        const code = hasLang ? rest.join("\n") : part;
        return (
          <pre key={index} className="code-block">
            {hasLang && <span className="code-lang">{firstLine.trim()}</span>}
            <code>{code.trim()}</code>
          </pre>
        );
      })}
    </div>
  );
}

function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  hint,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting-slider">
      <span>
        <strong>{label}</strong>
        <b>{value}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <small>{hint}</small>
    </label>
  );
}

function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [draft, setDraft] = useState("");
  const [settings, setSettings] = useState<ChatSettings>(defaultSettings);
  const [title, setTitle] = useState("Nuevo chat");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const activeSession = useMemo(() => sessions.find((item) => item.id === activeId) || null, [sessions, activeId]);
  const visibleTokenUsage = tokenUsage || localTokenUsage(messages, settings);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function bootstrap() {
    setError("");
    try {
      const [modelList, sessionList] = await Promise.all([api.models(), api.sessions()]);
      setModels(modelList);
      if (modelList[0]?.name && defaultSettings.model === "qwen2.5:7b-instruct") {
        setSettings((current) => ({ ...current, model: modelList.some((item) => item.name === current.model) ? current.model : modelList[0].name }));
      }
      if (sessionList.length) {
        setSessions(sessionList);
        await selectSession(sessionList[0]);
      } else {
        const created = await api.createSession({ model: modelList[0]?.name || defaultSettings.model });
        setSessions([created]);
        await selectSession(created);
      }
    } catch (err: any) {
      setError(err.message || "No se pudo iniciar GateChat.");
    }
  }

  async function selectSession(session: ChatSession) {
    setActiveId(session.id);
    setTitle(session.title);
    setSettings({
      model: session.model,
      system_prompt: session.system_prompt,
      temperature: session.temperature,
      top_p: session.top_p,
      top_k: session.top_k,
      repeat_penalty: session.repeat_penalty,
      num_ctx: session.num_ctx
    });
    const [loadedMessages, usage] = await Promise.all([api.messages(session.id), api.tokenUsage(session.id)]);
    setMessages(loadedMessages);
    setTokenUsage(usage);
  }

  async function newChat() {
    setBusy(true);
    setError("");
    try {
      const created = await api.createSession({ title: "Nuevo chat", ...settings });
      setSessions((current) => [created, ...current]);
      await selectSession(created);
    } catch (err: any) {
      setError(err.message || "No se pudo crear el chat.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!activeId) return;
    setError("");
    try {
      const updated = await api.updateSession(activeId, { title, ...settings });
      setSessions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setTokenUsage(await api.tokenUsage(activeId));
    } catch (err: any) {
      setError(err.message || "No se pudo guardar la configuracion.");
    }
  }

  async function deleteActive() {
    if (!activeId || sessions.length <= 1) return;
    const next = sessions.find((item) => item.id !== activeId);
    setBusy(true);
    try {
      await api.deleteSession(activeId);
      const remaining = sessions.filter((item) => item.id !== activeId);
      setSessions(remaining);
      if (next) await selectSession(next);
    } catch (err: any) {
      setError(err.message || "No se pudo borrar el chat.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || !activeId || busy) return;
    setDraft("");
    setBusy(true);
    setError("");
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      session_id: activeId,
      role: "user",
      content: message,
      duration_ms: 0,
      created_at: new Date().toISOString()
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const result = await api.chat(activeId, message, settings);
      setMessages((current) => [...current.filter((item) => item.id !== optimistic.id), result.user_message, result.assistant_message]);
      setSessions((current) => [result.session, ...current.filter((item) => item.id !== result.session.id)]);
      setTokenUsage(result.token_usage);
    } catch (err: any) {
      setError(err.message || "No se pudo hablar con Ollama.");
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setDraft(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`gatechat-shell ${settingsOpen ? "" : "settings-closed"}`}>
      <aside className="chat-sidebar">
        <div className="brand">
          <span><Sparkles size={22} /></span>
          <div>
            <strong>GateChat</strong>
            <small>ChatGPT local con Ollama</small>
          </div>
        </div>
        <button className="new-chat" onClick={() => void newChat()} disabled={busy}>
          <MessageSquarePlus size={18} />
          <span>Nuevo chat</span>
        </button>
        <div className="session-list">
          {sessions.map((session) => (
            <button key={session.id} className={`session-item ${session.id === activeId ? "active" : ""}`} onClick={() => void selectSession(session)}>
              <strong>{session.title}</strong>
              <small>{sessionSubtitle(session)}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="chat-main">
        <header className="chat-header">
          <div>
            <h1>{activeSession?.title || "GateChat"}</h1>
            <p>
              <Cpu size={14} /> {settings.model}
              <span>ctx {visibleTokenUsage.prompt_tokens_estimate}/{visibleTokenUsage.context_window}</span>
            </p>
          </div>
          <div className="header-actions">
            <TokenRing usage={visibleTokenUsage} />
            <button className="icon-btn" onClick={() => setSettingsOpen((value) => !value)} title="Mostrar configuracion">
              <PanelRight size={18} />
            </button>
            <button className="icon-btn danger" onClick={() => void deleteActive()} disabled={sessions.length <= 1 || busy} title="Eliminar chat">
              <Trash2 size={18} />
            </button>
          </div>
        </header>

        <div className="message-thread" ref={threadRef}>
          {messages.length === 0 && (
            <div className="empty-state">
              <Bot size={34} />
              <h2>Que quieres probar?</h2>
              <p>Mueve la temperatura, cambia el system prompt y compara respuestas del modelo local.</p>
            </div>
          )}
          {messages.map((message) => (
            <article key={message.id} className={`message-row ${message.role}`}>
              {message.role !== "user" && <div className="avatar"><Bot size={16} /></div>}
              <div className="bubble">
                <header>
                  <strong>{message.role === "user" ? "Tu" : "GateChat"}</strong>
                  <span>{formatTime(message.created_at)}{message.duration_ms ? ` · ${message.duration_ms} ms` : ""}</span>
                </header>
                <CodeAwareMessage content={message.content} />
              </div>
            </article>
          ))}
          {busy && <div className="thinking"><span /> Pensando con {settings.model}...</div>}
        </div>

        {error && <div className="error-bar">{error}</div>}
        <form className="composer" onSubmit={submit}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Escribe un mensaje..."
            rows={1}
          />
          <button disabled={busy || !draft.trim()}><Send size={19} /></button>
        </form>
      </section>

      {settingsOpen && (
        <aside className="settings-panel">
          <div className="settings-title">
            <span><SlidersHorizontal size={19} /></span>
            <div>
              <strong>Parametros</strong>
              <small>Cambian este chat</small>
            </div>
          </div>

          <label className="field">
            <span>Titulo</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className="field">
            <span>Modelo</span>
            <div className="select-wrap">
              <select value={settings.model} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))}>
                {models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
                {!models.some((model) => model.name === settings.model) && <option value={settings.model}>{settings.model}</option>}
              </select>
              <ChevronDown size={16} />
            </div>
          </label>

          <label className="field">
            <span>System prompt</span>
            <textarea value={settings.system_prompt} onChange={(event) => setSettings((current) => ({ ...current, system_prompt: event.target.value }))} rows={7} />
          </label>

          <SettingSlider label="Temperature" value={settings.temperature} min={0} max={2} step={0.05} hint="Bajo: preciso. Alto: creativo." onChange={(value) => setSettings((current) => ({ ...current, temperature: value }))} />
          <SettingSlider label="Top P" value={settings.top_p} min={0.05} max={1} step={0.01} hint="Controla variedad de tokens." onChange={(value) => setSettings((current) => ({ ...current, top_p: value }))} />
          <SettingSlider label="Top K" value={settings.top_k} min={1} max={200} step={1} hint="Limita opciones candidatas." onChange={(value) => setSettings((current) => ({ ...current, top_k: value }))} />
          <SettingSlider label="Repeat penalty" value={settings.repeat_penalty} min={0.5} max={2} step={0.05} hint="Reduce repeticiones." onChange={(value) => setSettings((current) => ({ ...current, repeat_penalty: value }))} />
          <SettingSlider label="Num ctx" value={settings.num_ctx} min={1024} max={32768} step={1024} hint="Mas contexto usa mas memoria." onChange={(value) => setSettings((current) => ({ ...current, num_ctx: value }))} />

          <section className="token-card">
            <div className="token-card-header">
              <strong>Contexto</strong>
              <span>{Math.round(visibleTokenUsage.context_usage_ratio * 100)}%</span>
            </div>
            <div className="token-meter">
              <span style={{ width: `${Math.min(100, Math.round(visibleTokenUsage.context_usage_ratio * 100))}%` }} />
            </div>
            <div className="token-grid">
              <div>
                <b>{visibleTokenUsage.prompt_tokens_estimate}</b>
                <small>tokens enviados</small>
              </div>
              <div>
                <b>{visibleTokenUsage.stored_tokens_estimate}</b>
                <small>tokens guardados</small>
              </div>
              <div>
                <b>{visibleTokenUsage.messages_sent}/{visibleTokenUsage.messages_stored}</b>
                <small>mensajes</small>
              </div>
              <div>
                <b>{visibleTokenUsage.context_window}</b>
                <small>num ctx</small>
              </div>
            </div>
            <p>Estimacion {visibleTokenUsage.estimator}. Ollama puede tokenizar distinto segun el modelo.</p>
          </section>

          <button className="save-btn" onClick={() => void saveSettings()}>
            <Save size={17} />
            <span>Guardar parametros</span>
          </button>

          <div className="settings-note">
            <Settings2 size={16} />
            <p>Los parametros tambien se envian automaticamente al mandar un mensaje, asi puedes experimentar sin guardar primero.</p>
          </div>
        </aside>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
