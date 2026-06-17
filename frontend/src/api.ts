const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://192.168.1.150:8000";

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

export interface UserBadge {
  id: string;
  code: string;
  label: string;
  description: string;
  color: string;
  icon: string;
  logo_url: string | null;
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
  badges: UserBadge[];
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
  logo_url: string | null;
  required_permission_code: string | null;
  has_access: boolean;
  access_request_status: "pending" | "approved" | "rejected" | null;
}

export interface AppAccessRequest {
  id: string;
  app_id: string;
  app_name: string;
  app_slug: string;
  user_id: string;
  user_full_name: string;
  user_email: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  admin_notes: string;
  created_at: string;
  reviewed_at: string | null;
}

export interface PermissionOption {
  id: string;
  code: string;
  description: string;
}

export type FeedbackStatus = "open" | "in_progress" | "resolved" | "closed";

export interface FeedbackInternalNote {
  id: string;
  feedback_id: string;
  author_user_id: string;
  author_name: string;
  note: string;
  created_at: string;
}

export interface FeedbackItem {
  id: string;
  source_app: string;
  title: string;
  message: string;
  status: FeedbackStatus;
  page_id: string | null;
  page_title: string | null;
  space_key: string | null;
  created_by_user_id: string;
  created_by_name: string;
  created_by_email: string;
  public_response: string;
  responded_by_user_id: string | null;
  responded_by_name: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  internal_notes: FeedbackInternalNote[];
}

export interface PortalHomeSettings {
  id: string;
  headline: string;
  subheadline: string;
  welcome_message: string;
  hero_image_url: string | null;
  announcement: string;
  updated_at: string;
}

export interface ProjectUpload {
  id: string;
  original_filename: string;
  status: ProjectStatus;
  detected_stack: string | null;
  review_notes: string | null;
  created_at: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const isFormData = options.body instanceof FormData;
  const method = (options.method ?? "GET").toUpperCase();
  if (!isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    const csrfToken = readCookie("gatestack_csrf");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: "include" });
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

function readCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
}

export const api = {
  async login(email: string, password: string) {
    return request<{ access_token: string | null; must_reset_password: boolean; reset_token: string | null }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  logout: () =>
    request<void>("/auth/logout", {
      method: "POST",
    }),
  async register(email: string, fullName: string, password: string) {
    return request<Me>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, full_name: fullName, password }),
    });
  },
  me: () => request<Me>("/auth/me"),
  users: () => request<User[]>("/admin/users"),
  badges: () => request<UserBadge[]>("/admin/badges"),
  createBadge: (code: string, label: string, description: string, color: string, icon: string, logoUrl: string | null) =>
    request<UserBadge>("/admin/badges", {
      method: "POST",
      body: JSON.stringify({ code, label, description, color, icon, logo_url: logoUrl }),
    }),
  assignBadge: (userId: string, badgeId: string) =>
    request<User>(`/admin/users/${userId}/badges`, {
      method: "POST",
      body: JSON.stringify({ badge_id: badgeId }),
    }),
  removeBadge: (userId: string, badgeId: string) =>
    request<User>(`/admin/users/${userId}/badges/${badgeId}`, {
      method: "DELETE",
    }),
  templates: () => request<Template[]>("/admin/templates"),
  apps: () => request<RegisteredApp[]>("/apps"),
  appPermissionOptions: () => request<PermissionOption[]>("/apps/permission-options"),
  createApp: (
    name: string,
    slug: string,
    description: string,
    homepageUrl: string | null,
    logoUrl: string | null,
    requiredPermissionCode: string | null,
  ) =>
    request<RegisteredApp>("/apps", {
      method: "POST",
      body: JSON.stringify({
        name,
        slug,
        description,
        homepage_url: homepageUrl,
        logo_url: logoUrl,
        required_permission_code: requiredPermissionCode,
      }),
    }),
  updateApp: (
    appId: string,
    name: string,
    slug: string,
    description: string,
    homepageUrl: string | null,
    logoUrl: string | null,
    requiredPermissionCode: string,
  ) =>
    request<RegisteredApp>(`/apps/${appId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        slug,
        description,
        homepage_url: homepageUrl,
        logo_url: logoUrl,
        required_permission_code: requiredPermissionCode,
      }),
    }),
  requestAppAccess: (appId: string, reason: string) =>
    request<AppAccessRequest>(`/apps/${appId}/access-requests`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  appAccessRequests: () => request<AppAccessRequest[]>("/apps/access-requests"),
  reviewAppAccessRequest: (requestId: string, status: "approved" | "rejected", adminNotes: string) =>
    request<AppAccessRequest>(`/apps/access-requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, admin_notes: adminNotes }),
    }),
  feedback: () => request<FeedbackItem[]>("/feedback"),
  respondFeedback: (feedbackId: string, publicResponse: string, status: FeedbackStatus = "resolved") =>
    request<FeedbackItem>(`/feedback/${feedbackId}/respond`, {
      method: "POST",
      body: JSON.stringify({ public_response: publicResponse, status }),
    }),
  updateFeedbackStatus: (feedbackId: string, status: FeedbackStatus) =>
    request<FeedbackItem>(`/feedback/${feedbackId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  addFeedbackInternalNote: (feedbackId: string, note: string) =>
    request<FeedbackItem>(`/feedback/${feedbackId}/internal-notes`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  homeSettings: () => request<PortalHomeSettings>("/portal/home"),
  updateHomeSettings: (settings: Omit<PortalHomeSettings, "id" | "updated_at">) =>
    request<PortalHomeSettings>("/portal/home", {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),
  projects: () => request<ProjectUpload[]>("/projects"),
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
    const headers = new Headers();
    const csrfToken = readCookie("gatestack_csrf");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
    const body = new FormData();
    body.append("file", file);

    const response = await fetch(`${API_BASE_URL}/projects/upload`, {
      method: "POST",
      headers,
      body,
      credentials: "include",
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
