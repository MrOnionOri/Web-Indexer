const serverProtocol = (import.meta.env.VITE_SERVER_PROTOCOL || window.location.protocol.replace(":", "")).trim();
const serverHost = (import.meta.env.VITE_SERVER_HOST || window.location.hostname).trim();
const backendPort = (import.meta.env.VITE_GATECHAT_BACKEND_PORT || "8013").trim();
const configuredBackendUrl = import.meta.env.VITE_GATECHAT_BACKEND_URL?.trim();
const API_BASE_URL = (configuredBackendUrl || `${serverProtocol}://${serverHost}:${backendPort}`).replace(/\/$/, "");
const ENCRYPT_REQUESTS = (import.meta.env.VITE_GATECHAT_ENCRYPT_REQUESTS || "true").trim().toLowerCase() !== "false";
const REQUIRE_HTTPS = (import.meta.env.VITE_GATECHAT_REQUIRE_HTTPS || "false").trim().toLowerCase() === "true";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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

interface PublicKeyResponse {
  public_key: string;
  fingerprint: string;
  algorithm: string;
}

interface EncryptedEnvelope {
  encrypted: true;
  key: string;
  nonce: string;
  payload: string;
}

const textEncoder = new TextEncoder();
let publicKeyPromise: Promise<PublicKeyResponse> | null = null;
let cryptoKeyPromise: Promise<CryptoKey> | null = null;

function base64FromBytes(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function bytesFromPem(pem: string) {
  const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function assertSecureTransport() {
  const apiUrl = new URL(API_BASE_URL);
  const pageIsLocal = LOCAL_HOSTS.has(window.location.hostname);
  const apiIsLocal = LOCAL_HOSTS.has(apiUrl.hostname);
  if (REQUIRE_HTTPS && apiUrl.protocol !== "https:" && !(pageIsLocal && apiIsLocal)) {
    throw new Error("GateChat requiere HTTPS para proteger las peticiones fuera de localhost.");
  }
}

async function loadPublicKey() {
  if (!publicKeyPromise) {
    publicKeyPromise = fetch(`${API_BASE_URL}/api/security/public-key`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("No se pudo obtener la llave publica de GateChat.");
      return response.json() as Promise<PublicKeyResponse>;
    });
  }
  return publicKeyPromise;
}

async function importPublicKey() {
  if (!cryptoKeyPromise) {
    cryptoKeyPromise = loadPublicKey().then((keyInfo) =>
      crypto.subtle.importKey(
        "spki",
        bytesFromPem(keyInfo.public_key),
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"]
      )
    );
  }
  return cryptoKeyPromise;
}

async function encryptJsonBody(body: BodyInit | null | undefined): Promise<EncryptedEnvelope | null> {
  if (!body || typeof body !== "string" || !ENCRYPT_REQUESTS) return null;
  assertSecureTransport();
  const publicKey = await importPublicKey();
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", aesKey));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encryptedPayload = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, textEncoder.encode(body)));
  const encryptedKey = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawKey));
  return {
    encrypted: true,
    key: base64FromBytes(encryptedKey),
    nonce: base64FromBytes(nonce),
    payload: base64FromBytes(encryptedPayload)
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body = options.body;
  const encryptedBody = await encryptJsonBody(options.body);
  if (encryptedBody) {
    body = JSON.stringify(encryptedBody);
    headers.set("Content-Type", "application/json");
    headers.set("X-GateChat-Encryption", "aes256gcm+rsa-oaep-sha256");
  } else if (body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, body, headers, cache: "no-store" });
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
  security: () => loadPublicKey(),
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
