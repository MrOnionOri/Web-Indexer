export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  permissions: string[];
  is_platform_admin: boolean;
}

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
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(path, { ...options, headers, cache: "no-store" });
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

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  me: (token: string) => request<UserProfile>("/auth/me", { token }),
  users: (token: string | null) => request<UserListItem[]>("/api/users", { token }),
  myFeedback: (token: string | null) => request<FeedbackItem[]>("/api/feedback/my", { token }),
  createFeedback: (token: string | null, payload: unknown) =>
    request<FeedbackItem>("/api/feedback", { method: "POST", token, body: JSON.stringify(payload) }),
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
  seed: (token: string | null) => request<{ message: string }>("/api/seed", { method: "POST", token })
};
