const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type UserStatus = "pending" | "approved" | "rejected" | "suspended";
export type ProjectStatus =
  | "uploaded"
  | "pending_review"
  | "review_failed"
  | "approved"
  | "building"
  | "build_failed"
  | "running"
  | "stopped"
  | "suspended"
  | "archived";

export interface UserOverride {
  permission_id: string;
  permission_code: string;
  effect: "allow" | "deny";
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  status: UserStatus;
  is_platform_admin: boolean;
  created_at: string;
  template_ids: string[];
  template_names: string[];
  permissions: string[];
  overrides: UserOverride[];
  status_reason?: string | null;
  must_reset_password: boolean;
}

export interface Me extends User {
  permissions: string[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: string[];
}

export interface RegisteredApp {
  id: string;
  name: string;
  slug: string;
  description: string;
  homepage_url: string | null;
}

export interface ProjectUpload {
  id: string;
  original_filename: string;
  status: ProjectStatus;
  detected_stack: string | null;
  review_notes: string | null;
  created_at: string;
}

export type WikiPageStatus = "draft" | "published" | "archived";

export interface KnowledgeSpace {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgePage {
  id: string;
  space_id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: WikiPageStatus;
  created_at: string;
  updated_at: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("gatestack_token");
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    const err = new Error(error.detail ?? "Request failed");
    if (error.code) {
      (err as any).code = error.code;
    }
    throw err;
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  async login(email: string, password: string) {
    return request<{ access_token: string | null; must_reset_password: boolean; reset_token: string | null }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  async register(email: string, fullName: string, password: string) {
    return request<Me>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, full_name: fullName, password }),
    });
  },
  me: () => request<Me>("/auth/me"),
  users: () => request<User[]>("/admin/users"),
  templates: () => request<Template[]>("/admin/templates"),
  apps: () => request<RegisteredApp[]>("/apps"),
  projects: () => request<ProjectUpload[]>("/projects"),
  knowledgeSpaces: () => request<KnowledgeSpace[]>("/knowledge/spaces"),
  knowledgePages: (spaceId?: string, query?: string) => {
    const params = new URLSearchParams();
    if (spaceId) params.set("space_id", spaceId);
    if (query) params.set("q", query);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<KnowledgePage[]>(`/knowledge/pages${suffix}`);
  },
  createKnowledgeSpace: (name: string, slug: string, description: string) =>
    request<KnowledgeSpace>("/knowledge/spaces", {
      method: "POST",
      body: JSON.stringify({ name, slug, description }),
    }),
  createKnowledgePage: (
    spaceId: string,
    title: string,
    slug: string,
    summary: string,
    content: string,
    status: WikiPageStatus,
  ) =>
    request<KnowledgePage>("/knowledge/pages", {
      method: "POST",
      body: JSON.stringify({ space_id: spaceId, title, slug, summary, content, status }),
    }),
  updateKnowledgePage: (
    pageId: string,
    payload: Partial<Pick<KnowledgePage, "title" | "slug" | "summary" | "content" | "status">>,
  ) =>
    request<KnowledgePage>(`/knowledge/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateUserAccess: (userId: string, status: UserStatus, templateIds: string[], statusReason?: string | null) =>
    request<User>(`/admin/users/${userId}/approval`, {
      method: "PATCH",
      body: JSON.stringify({ status, template_ids: templateIds, status_reason: statusReason }),
    }),
  createUser: (email: string, fullName: string, password: string, templateIds: string[], status: UserStatus = "approved") =>
    request<User>("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, full_name: fullName, password, template_ids: templateIds, status }),
    }),
  updateUser: (userId: string, fullName: string, email: string) =>
    request<User>(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ full_name: fullName, email }),
    }),
  deleteUser: (userId: string) =>
    request<void>(`/admin/users/${userId}`, {
      method: "DELETE",
    }),
  createPasswordResetLink: (userId: string) =>
    request<{ reset_token: string; reset_url: string }>(`/admin/users/${userId}/password-reset-link`, {
      method: "POST",
    }),
  forcePasswordReset: (userId: string, force: boolean) =>
    request<User>(`/admin/users/${userId}/force-password-reset`, {
      method: "PATCH",
      body: JSON.stringify({ force }),
    }),
  confirmPasswordReset: (token: string, newPassword: string) =>
    request<void>("/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),
  permissions: () => request<{ id: string; code: string; description: string }[]>("/admin/permissions"),
  async setPermissionOverride(userId: string, permissionId: string, effect: "allow" | "deny") {
    return request<void>(`/admin/users/${userId}/permission-overrides`, {
      method: "POST",
      body: JSON.stringify({ permission_id: permissionId, effect }),
    });
  },
  async deletePermissionOverride(userId: string, permissionId: string) {
    return request<void>(`/admin/users/${userId}/permission-overrides/${permissionId}`, {
      method: "DELETE",
    });
  },
  async uploadProject(file: File) {
    const token = localStorage.getItem("gatestack_token");
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const body = new FormData();
    body.append("file", file);

    const response = await fetch(`${API_BASE_URL}/projects/upload`, {
      method: "POST",
      headers,
      body,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(error.detail ?? "Upload failed");
    }
    return response.json() as Promise<ProjectUpload>;
  },
  async reviewProject(projectId: string, status: ProjectStatus, notes: string | null) {
    return request<ProjectUpload>(`/projects/${projectId}/review`, {
      method: "PATCH",
      body: JSON.stringify({ status, review_notes: notes }),
    });
  },
};
