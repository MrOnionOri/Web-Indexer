const serverProtocol = (import.meta.env.VITE_SERVER_PROTOCOL || window.location.protocol.replace(":", "")).trim();
const serverHost = (import.meta.env.VITE_SERVER_HOST || window.location.hostname).trim();
const backendPort = (import.meta.env.VITE_GATECHAT_BACKEND_PORT || "8013").trim();
const configuredBackendUrl = import.meta.env.VITE_GATECHAT_BACKEND_URL?.trim();
const API_BASE_URL = (configuredBackendUrl || `${serverProtocol}://${serverHost}:${backendPort}`).replace(/\/$/, "");

export interface ChatSettings {
  model: string;
  system_prompt: string;
  temperature: number;
  top_p: number;
  top_k: number;
  repeat_penalty: number;
  num_ctx: number;
}

export interface ChatSession extends ChatSettings {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  duration_ms: number;
  created_at: string;
}

export interface TokenUsage {
  stored_tokens_estimate: number;
  prompt_tokens_estimate: number;
  context_window: number;
  context_usage_ratio: number;
  messages_stored: number;
  messages_sent: number;
  estimator: string;
}

export interface ModelInfo {
  name: string;
  modified_at?: string | null;
  size?: number | null;
}

export interface ChatResponse {
  session: ChatSession;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  token_usage: TokenUsage;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "No se pudo completar la solicitud.");
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const defaultSettings: ChatSettings = {
  model: "qwen2.5:7b-instruct",
  system_prompt: "Eres GateChat, un asistente conversacional local. Responde en espanol de forma clara, util y natural.",
  temperature: 0.6,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.1,
  num_ctx: 8192
};

export const api = {
  models: () => request<ModelInfo[]>("/api/models"),
  sessions: () => request<ChatSession[]>("/api/sessions"),
  createSession: (payload: Partial<ChatSettings> & { title?: string }) =>
    request<ChatSession>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title: "Nuevo chat", ...defaultSettings, ...payload })
    }),
  updateSession: (sessionId: string, payload: Partial<ChatSession>) =>
    request<ChatSession>(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteSession: (sessionId: string) => request<void>(`/api/sessions/${sessionId}`, { method: "DELETE" }),
  messages: (sessionId: string) => request<ChatMessage[]>(`/api/sessions/${sessionId}/messages`),
  tokenUsage: (sessionId: string) => request<TokenUsage>(`/api/sessions/${sessionId}/token-usage`),
  chat: (sessionId: string, message: string, settings: ChatSettings) =>
    request<ChatResponse>(`/api/sessions/${sessionId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message, settings })
    })
};
