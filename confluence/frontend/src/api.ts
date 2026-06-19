export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  permissions: string[];
  is_platform_admin: boolean;
  badges?: {
    id: string;
    code: string;
    label: string;
    description: string;
    color: string;
    icon: string;
    logo_url: string | null;
  }[];
}

export interface UserBadge {
  id: string;
  code: string;
  label: string;
  description: string;
  color: string;
  icon: string;
  logo_url: string | null;
}

const serverProtocol = (import.meta.env.VITE_SERVER_PROTOCOL || window.location.protocol.replace(":", "")).trim();
const serverHost = (import.meta.env.VITE_SERVER_HOST || window.location.hostname).trim();
const backendPort = (import.meta.env.VITE_GATEWIKI_BACKEND_PORT || "8001").trim();
const configuredBackendUrl = import.meta.env.VITE_GATEWIKI_BACKEND_URL?.trim();
const API_BASE_URL = (configuredBackendUrl || `${serverProtocol}://${serverHost}:${backendPort}`).replace(/\/$/, "");
export const GATESTACK_CHAT_EMBED_URL = `${serverProtocol}://${serverHost}:${(import.meta.env.VITE_GATESTACK_FRONTEND_PORT || "5173").trim()}/support/embed?source=gatewiki`;

export interface Space {
  id: string;
  name: string;
  key: string;
  description: string;
  created_by_id?: string;
  is_restricted?: boolean;
  allowed_emails?: string;
  created_at: string;
}

export interface Page {
  id: string;
  space_key: string;
  title: string;
  content: string;
  subtopics?: string;
  sort_order?: number;
  created_by_email: string;
  created_by_name: string;
  created_by_id: string;
  created_by_badges?: UserBadge[];
  is_restricted: boolean;
  allowed_emails: string;
  comments_allowed: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserListItem {
  email: string;
  full_name: string;
}

export interface CommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  user_name: string;
  emoji: string;
}

export interface Comment {
  id: string;
  page_id: string;
  parent_id?: string;
  author_email: string;
  author_name: string;
  author_id: string;
  author_badges?: UserBadge[];
  content: string;
  created_at: string;
  reactions: CommentReaction[];
}

export interface LoginResponse {
  access_token: string | null;
  token_type: string;
  must_reset_password: boolean;
  reset_token: string | null;
}

export interface FeedbackItem {
  id: string;
  source_app: string;
  title: string;
  message: string;
  status: string;
  page_id?: string | null;
  page_title?: string | null;
  space_key?: string | null;
  created_by_name: string;
  created_by_email: string;
  public_response?: string | null;
  responded_by_name?: string | null;
  responded_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StorageWorkspace {
  id: string;
  source_app: string;
  external_workspace_id: string | null;
  workspace_key: string;
  workspace_name: string;
  owner_user_id: string;
  owner_name: string;
  owner_email: string;
  quota_bytes: number;
  used_bytes: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface StorageRequest {
  id: string;
  source_app: string;
  external_workspace_id: string | null;
  workspace_key: string;
  workspace_name: string;
  owner_user_id: string;
  owner_name: string;
  owner_email: string;
  requested_bytes: number;
  status: string;
  reason: string;
  admin_notes: string;
  reviewed_by_user_id: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiChatSource {
  page_id?: string | null;
  page_title: string;
  space_key: string;
  source_type?: "page" | "workspace" | string;
  subtopic_title?: string | null;
  excerpt: string;
  score: number;
}

export interface AiChatResponse {
  answer: string;
  sources: AiChatSource[];
  searched_pages: number;
}

export type AiReviewStatus = "unreviewed" | "expected" | "unexpected";

export interface AiInteraction {
  id: string;
  session_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  question: string;
  answer: string;
  scope_type: "all" | "space" | "page";
  space_key?: string | null;
  page_id?: string | null;
  page_title?: string | null;
  engine: "system" | "ollama" | "retrieval" | string;
  model_name?: string | null;
  searched_pages: number;
  source_count: number;
  sources: AiChatSource[];
  duration_ms: number;
  review_status: AiReviewStatus;
  review_note: string;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

type RequestOptions = Omit<RequestInit, "headers"> & {
  token?: string | null;
  headers?: HeadersInit;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const hasBody = options.body !== undefined;
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = (options.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    const csrfToken = readCookie("gatestack_csrf");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, cache: "no-store", credentials: "include" });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const detail = errorPayload.detail || "La solicitud no pudo completarse.";
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

function readCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: (_token?: string | null) => request<UserProfile>("/auth/me"),
  users: (token: string | null) => request<UserListItem[]>("/api/users", { token }),
  myFeedback: (token: string | null) => request<FeedbackItem[]>("/api/feedback/my", { token }),
  adminFeedback: (token: string | null) => request<FeedbackItem[]>("/api/feedback/admin", { token }),
  adminAiInteractions: (token: string | null, reviewStatus?: AiReviewStatus) =>
    request<AiInteraction[]>(`/api/ai-interactions/admin${reviewStatus ? `?review_status=${reviewStatus}` : ""}`, { token }),
  reviewAiInteraction: (token: string | null, interactionId: string, reviewStatus: AiReviewStatus, reviewNote: string) =>
    request<AiInteraction>(`/api/ai-interactions/${interactionId}/review`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ review_status: reviewStatus, review_note: reviewNote })
    }),
  createFeedback: (token: string | null, payload: unknown) =>
    request<FeedbackItem>("/api/feedback", { method: "POST", token, body: JSON.stringify(payload) }),
  respondFeedback: (token: string | null, feedbackId: string, publicResponse: string) =>
    request<FeedbackItem>(`/api/feedback/${feedbackId}/response`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ public_response: publicResponse, status: "resolved" })
    }),
  updateFeedbackStatus: (token: string | null, feedbackId: string, status: "open" | "in_progress" | "resolved" | "closed") =>
    request<FeedbackItem>(`/api/feedback/${feedbackId}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status })
    }),
  spaces: (token: string | null) => request<Space[]>("/api/spaces", { token }),
  pages: (token: string | null) => request<Page[]>("/api/pages", { token }),
  page: (token: string | null, pageId: string) => request<Page>(`/api/pages/${pageId}`, { token }),
  createSpace: (token: string | null, payload: unknown) =>
    request<Space>("/api/spaces", { method: "POST", token, body: JSON.stringify(payload) }),
  updateSpace: (token: string | null, spaceId: string, payload: unknown) =>
    request<Space>(`/api/spaces/${spaceId}`, { method: "PUT", token, body: JSON.stringify(payload) }),
  deleteSpace: (token: string | null, spaceId: string) =>
    request<void>(`/api/spaces/${spaceId}`, { method: "DELETE", token }),
  spaceStorage: (token: string | null, spaceId: string) =>
    request<StorageWorkspace | null>(`/api/spaces/${spaceId}/storage`, { token }),
  spaceStorageRequest: (token: string | null, spaceId: string) =>
    request<StorageRequest | null>(`/api/spaces/${spaceId}/storage/request`, { token }),
  requestSpaceStorage: (token: string | null, spaceId: string, requestedGb: number, reason: string) =>
    request<StorageRequest>(`/api/spaces/${spaceId}/storage/request`, {
      method: "POST",
      token,
      body: JSON.stringify({ requested_gb: requestedGb, reason })
    }),
  savePage: (token: string | null, pageId: string | null, payload: unknown) =>
    request<Page>(pageId ? `/api/pages/${pageId}` : "/api/pages", {
      method: pageId ? "PUT" : "POST",
      token,
      body: JSON.stringify(payload)
    }),
  deletePage: (token: string | null, pageId: string) =>
    request<void>(`/api/pages/${pageId}`, { method: "DELETE", token }),
  reorderPages: (token: string | null, spaceKey: string, pageIds: string[]) =>
    request<Page[]>("/api/page-order", {
      method: "PUT",
      token,
      body: JSON.stringify({ space_key: spaceKey, page_ids: pageIds })
    }),
  comments: (token: string | null, pageId: string) =>
    request<Comment[]>(`/api/pages/${pageId}/comments`, { token }),
  addComment: (token: string | null, pageId: string, content: string, parentId?: string) =>
    request<Comment>(`/api/pages/${pageId}/comments`, {
      method: "POST",
      token,
      body: JSON.stringify({ content, parent_id: parentId || null })
    }),
  toggleReaction: (token: string | null, commentId: string, emoji: string) =>
    request<CommentReaction[]>(`/api/comments/${commentId}/react`, {
      method: "POST",
      token,
      body: JSON.stringify({ emoji })
    }),
  deleteComment: (token: string | null, commentId: string) =>
    request<void>(`/api/comments/${commentId}`, { method: "DELETE", token }),
  seed: (token: string | null) => request<{ message: string }>("/api/seed", { method: "POST", token }),
  aiChat: (token: string | null, payload: { message: string; session_id: string; history?: Array<{ question: string; answer: string }>; space_key?: string | null; page_id?: string | null }) =>
    request<AiChatResponse>("/api/ai-chat", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    })
};
