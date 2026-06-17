import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, Award, CheckCircle2, Copy, Database, Download, FileText, Folder, FolderPlus, Globe2, Grid2X2, HardDrive, Home, Info, List, LogOut, MessageSquare, MessageSquarePlus, Moon, MoveRight, Plus, RefreshCw, Search, Send, ShieldCheck, Sun, Trash2, Upload, UserPlus, Users, X, XCircle } from "lucide-react";
import "./style.css";

type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  permissions: string[];
  is_platform_admin: boolean;
  badges?: UserBadge[];
};

type UserBadge = {
  id: string;
  code: string;
  label: string;
  description?: string | null;
  color: string;
  logo_url?: string | null;
};

type StorageRequest = {
  id: string;
  source_app: string;
  workspace_key: string;
  workspace_name: string;
  owner_name: string;
  owner_email: string;
  requested_bytes: number;
  status: string;
  reason: string;
  admin_notes: string;
  created_at: string;
};

type StorageWorkspace = {
  id: string;
  source_app: string;
  owner_user_id?: string;
  workspace_key: string;
  workspace_name: string;
  owner_name: string;
  owner_email: string;
  quota_bytes: number;
  used_bytes: number;
  status: string;
  status_message: string;
  member_emails?: string[];
};

type StorageFile = {
  id: string;
  workspace_id: string;
  original_filename: string;
  relative_path: string;
  content_type: string | null;
  size_bytes: number;
  uploaded_by_user_id: string;
  uploaded_by_name: string;
  is_public: boolean;
  public_url: string | null;
  created_at: string;
};

type StorageEntry = {
  type: "folder" | "file";
  name: string;
  path: string;
  id?: string | null;
  workspace_id?: string | null;
  original_filename?: string | null;
  relative_path?: string | null;
  content_type?: string | null;
  size_bytes: number;
  uploaded_by_user_id?: string | null;
  uploaded_by_name?: string | null;
  is_public?: boolean;
  public_url?: string | null;
  created_at?: string | null;
};

type UserListItem = {
  email: string;
  full_name: string;
};

type FeedbackCategory = "support" | "bug" | "quota" | "admin_contact";

type FeedbackItem = {
  id: string;
  source_app: string;
  category: FeedbackCategory;
  title: string;
  message: string;
  status: string;
  workspace_id: string | null;
  workspace_name: string | null;
  created_by_name: string;
  created_by_email: string;
  public_response: string | null;
  responded_by_name: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

const API_BASE_URL = import.meta.env.VITE_GATESTORAGE_BACKEND_URL ?? "http://192.168.1.150:8002";

type StorageView = "mine" | "admin";

type StorageRoute = {
  view: StorageView;
  workspaceId: string | null;
  folder: string;
};

function routeFromLocation(): StorageRoute {
  const params = new URLSearchParams(window.location.search);
  const folder = params.get("folder") || "";
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments[0] === "admin") {
    return { view: "admin", workspaceId: segments[1] === "workspaces" ? segments[2] || null : null, folder };
  }
  if (segments[0] === "workspaces") {
    return { view: "mine", workspaceId: segments[1] || null, folder };
  }
  return { view: "mine", workspaceId: null, folder: "" };
}

function pathForRoute(route: StorageRoute) {
  const base = route.view === "admin"
    ? route.workspaceId ? `/admin/workspaces/${route.workspaceId}` : "/admin"
    : route.workspaceId ? `/workspaces/${route.workspaceId}` : "/workspaces";
  const query = route.folder ? `?folder=${encodeURIComponent(route.folder)}` : "";
  return `${base}${query}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const method = (options.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    const csrfToken = readCookie("gatestack_csrf");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
    credentials: "include"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : JSON.stringify(payload.detail)
    );
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

const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string | null; must_reset_password: boolean; reset_token: string | null }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<UserProfile>("/auth/me"),
  requests: () => request<StorageRequest[]>("/api/storage-requests"),
  myRequests: () => request<StorageRequest[]>("/api/my/storage-requests"),
  users: () => request<UserListItem[]>("/api/users"),
  feedback: () => request<FeedbackItem[]>("/api/feedback/my"),
  adminFeedback: () => request<FeedbackItem[]>("/api/feedback/admin"),
  createFeedback: (payload: { category: FeedbackCategory; title: string; message: string; workspace_id?: string | null; workspace_name?: string | null }) =>
    request<FeedbackItem>("/api/feedback", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  respondFeedback: (feedbackId: string, publicResponse: string) =>
    request<FeedbackItem>(`/api/feedback/${feedbackId}/response`, {
      method: "PATCH",
      body: JSON.stringify({ public_response: publicResponse, status: "resolved" })
    }),
  updateFeedbackStatus: (feedbackId: string, status: "open" | "in_progress" | "resolved" | "closed") =>
    request<FeedbackItem>(`/api/feedback/${feedbackId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),
  workspaces: () => request<StorageWorkspace[]>("/api/workspaces"),
  myWorkspaces: () => request<StorageWorkspace[]>("/api/my/workspaces"),
  entries: (workspaceId: string, folder = "") =>
    request<StorageEntry[]>(`/api/workspaces/${workspaceId}/entries?folder=${encodeURIComponent(folder)}`),
  files: (workspaceId: string) => request<StorageFile[]>(`/api/workspaces/${workspaceId}/files`),
  createFolder: (workspaceId: string, folder: string) =>
    request<StorageEntry>(`/api/workspaces/${workspaceId}/folders`, {
      method: "POST",
      body: JSON.stringify({ folder })
    }),
  deleteFolder: (workspaceId: string, folder: string, recursive = false) =>
    request<void>(`/api/workspaces/${workspaceId}/folders?folder=${encodeURIComponent(folder)}&recursive=${recursive ? "true" : "false"}`, { method: "DELETE" }),
  moveFolder: (workspaceId: string, source: string, target: string) =>
    request<StorageEntry>(`/api/workspaces/${workspaceId}/folders/move`, {
      method: "PATCH",
      body: JSON.stringify({ source, target })
    }),
  updateMembers: (sourceApp: string, workspaceKey: string, memberEmails: string[]) =>
    request<StorageWorkspace>(`/api/workspaces/${sourceApp}/${workspaceKey}/members`, {
      method: "PUT",
      body: JSON.stringify({ member_emails: memberEmails })
    }),
  uploadFile: (workspaceId: string, file: File, folder = "") => {
    const body = new FormData();
    body.append("file", file);
    body.append("folder", folder);
    return request<StorageFile>(`/api/workspaces/${workspaceId}/files`, { method: "POST", body });
  },
  moveFile: (fileId: string, folder: string, filename?: string) =>
    request<StorageFile>(`/api/files/${fileId}/move`, {
      method: "PATCH",
      body: JSON.stringify({ folder, filename })
    }),
  setFilePublic: (fileId: string, isPublic: boolean) =>
    request<StorageFile>(`/api/files/${fileId}/public`, {
      method: "PATCH",
      body: JSON.stringify({ is_public: isPublic })
    }),
  deleteFile: (fileId: string) => request<void>(`/api/files/${fileId}`, { method: "DELETE" }),
  downloadFile: async (file: StorageFile) => {
    const headers = new Headers();
    const response = await fetch(`${API_BASE_URL}/api/files/${file.id}/download`, { headers, cache: "no-store", credentials: "include" });
    if (!response.ok) throw new Error("No se pudo descargar el archivo");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.original_filename;
    anchor.click();
    URL.revokeObjectURL(url);
  },
  review: (requestId: string, status: "approved" | "rejected", quotaGb: number, adminNotes: string) =>
    request<StorageRequest>(`/api/storage-requests/${requestId}/review`, {
      method: "PATCH",
      body: JSON.stringify({ status, quota_bytes: gbToBytes(quotaGb), admin_notes: adminNotes })
    }),
  updateWorkspaceAdmin: (workspaceId: string, quotaGb: number, status: string, statusMessage: string) =>
    request<StorageWorkspace>(`/api/workspaces/${workspaceId}/admin`, {
      method: "PATCH",
      body: JSON.stringify({ quota_bytes: gbToBytes(quotaGb), status, status_message: statusMessage })
    })
};

function gbToBytes(gb: number) {
  return Math.max(0, Math.round(gb * 1024 * 1024 * 1024));
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 GB";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function App() {
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("gatestorage_theme") as "dark" | "light") || (localStorage.getItem("gatewiki_theme") as "dark" | "light") || "dark"
  );
  const [me, setMe] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [requests, setRequests] = useState<StorageRequest[]>([]);
  const [myRequests, setMyRequests] = useState<StorageRequest[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [adminFeedbackItems, setAdminFeedbackItems] = useState<FeedbackItem[]>([]);
  const [workspaces, setWorkspaces] = useState<StorageWorkspace[]>([]);
  const [myWorkspaces, setMyWorkspaces] = useState<StorageWorkspace[]>([]);
  const initialRoute = routeFromLocation();
  const initialFeedbackOpen = window.location.pathname.split("/").filter(Boolean)[0] === "feedback";
  const [activeWorkspace, setActiveWorkspace] = useState<StorageWorkspace | null>(null);
  const [activeView, setActiveView] = useState<StorageView>(initialRoute.view);
  const [feedbackOpen, setFeedbackOpen] = useState(initialFeedbackOpen);
  const [adminTab, setAdminTab] = useState<"workspaces" | "settings" | "chat" | "feedback">("workspaces");
  const [routeWorkspaceId, setRouteWorkspaceId] = useState<string | null>(initialRoute.workspaceId);
  const [routeFolder, setRouteFolder] = useState(initialRoute.folder);
  const permissions = useMemo(() => new Set(me?.permissions ?? []), [me]);
  const canAdmin = !!me?.is_platform_admin || permissions.has("gatestorage:admin");

  useEffect(() => {
    document.body.classList.toggle("light-theme", theme === "light");
    localStorage.setItem("gatestorage_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.removeItem("gatestorage_token");
    document.cookie = "gatestack_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
    api.me().then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    if (!me) return;
    refresh();
  }, [me]);

  useEffect(() => {
    const onPopState = () => {
      const nextRoute = routeFromLocation();
      setActiveView(nextRoute.view);
      setRouteWorkspaceId(nextRoute.workspaceId);
      setRouteFolder(nextRoute.folder);
      if (!nextRoute.workspaceId) setActiveWorkspace(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!routeWorkspaceId) return;
    const workspace = [...myWorkspaces, ...workspaces].find((item) => item.id === routeWorkspaceId);
    if (workspace) {
      setActiveWorkspace(workspace);
    }
  }, [routeWorkspaceId, myWorkspaces, workspaces]);

  function navigate(route: StorageRoute) {
    window.history.pushState({}, "", pathForRoute(route));
    setActiveView(route.view);
    setRouteWorkspaceId(route.workspaceId);
    setRouteFolder(route.folder);
    if (!route.workspaceId) setActiveWorkspace(null);
  }

  function openWorkspace(workspace: StorageWorkspace, view = activeView) {
    setActiveWorkspace(workspace);
    navigate({ view, workspaceId: workspace.id, folder: "" });
  }

  async function refresh() {
    const mine = await Promise.all([
      api.myRequests().catch(() => []),
      api.myWorkspaces().catch(() => []),
      api.feedback().catch(() => [])
    ]);
    setMyRequests(mine[0]);
    setMyWorkspaces(mine[1]);
    setFeedbackItems(mine[2]);
    if (canAdmin) {
      const admin = await Promise.all([api.requests(), api.workspaces(), api.adminFeedback().catch(() => [])]);
      setRequests(admin[0]);
      setWorkspaces(admin[1]);
      setAdminFeedbackItems(admin[2]);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.login(email, password);
      if (result.must_reset_password) throw new Error("Debes restablecer tu contrasena en GateStack primero.");
      setMe(await api.me());
    } catch (err: any) {
      setError(err.message ?? "No se pudo iniciar sesion");
    }
  }

  async function logout() {
    await api.logout().catch(() => {});
    setMe(null);
    setActiveWorkspace(null);
    window.history.pushState({}, "", "/");
  }

  if (!me) {
    return (
      <main className="auth-shell">
        <section className="auth-copy">
          <HardDrive />
          <h1>GateStorage</h1>
          <p>Cuotas, requests y almacenamiento por workspace.</p>
        </section>
        <form className="auth-panel" onSubmit={handleLogin}>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email" required />
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" required />
          <button>Entrar</button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><HardDrive /> GateStorage</div>
        <button className={activeView === "mine" ? "active" : ""} onClick={() => navigate({ view: "mine", workspaceId: null, folder: "" })}><Database /> Mis workspaces</button>
        {canAdmin && <button className={activeView === "admin" ? "active" : ""} onClick={() => navigate({ view: "admin", workspaceId: null, folder: "" })}><ShieldCheck /> Admin</button>}
        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">{getInitials(me.full_name)}</div>
            <div className="user-info">
              <span className="user-name">{me.full_name}</span>
              <span className="user-email">{me.email}</span>
              {!!me.badges?.length && (
                <div className="profile-badges">
                  {me.badges.slice(0, 3).map((badge) => (
                    <span className="profile-badge" style={{ borderColor: badge.color, color: badge.color }} title={badge.description || badge.label} key={badge.id}>
                      {badge.logo_url ? <img className="profile-badge-logo" src={badge.logo_url} alt="" /> : <Award />}
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button className="btn-logout" onClick={logout} title="Cerrar sesion"><LogOut /></button>
          </div>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <span>GateStorage</span>
            <h2>{activeWorkspace ? activeWorkspace.workspace_name : activeView === "mine" ? "Mis workspaces" : "Admin de storage"}</h2>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((value) => value === "light" ? "dark" : "light")}
              title={theme === "light" ? "Cambiar a modo noche" : "Cambiar a modo dia"}
            >
              {theme === "light" ? <Moon /> : <Sun />}
            </button>
            <button type="button" className="topbar-feedback-button" onClick={() => setFeedbackOpen(true)}>
              <MessageSquarePlus />
              <span>Feedback</span>
            </button>
          </div>
        </header>

        {activeWorkspace ? (
          <FileManager
            workspace={activeWorkspace}
            currentUser={me}
            initialFolder={routeWorkspaceId === activeWorkspace.id ? routeFolder : ""}
            onBack={() => navigate({ view: activeView, workspaceId: null, folder: "" })}
            onChanged={refresh}
            onFolderChange={(folder) => navigate({ view: activeView, workspaceId: activeWorkspace.id, folder })}
          />
        ) : activeView === "mine" && (
          <StorageHub
            workspaces={myWorkspaces}
            requests={myRequests}
            onOpen={(workspace) => openWorkspace(workspace, "mine")}
          />
        )}

        {activeView === "admin" && (
          <>
            <div className="admin-tabs">
              <button className={adminTab === "workspaces" ? "active" : ""} onClick={() => setAdminTab("workspaces")}>Workspaces</button>
              <button className={adminTab === "settings" ? "active" : ""} onClick={() => setAdminTab("settings")}>Configurar</button>
              <button className={adminTab === "chat" ? "active" : ""} onClick={() => setAdminTab("chat")}>Chat</button>
              <button className={adminTab === "feedback" ? "active" : ""} onClick={() => setAdminTab("feedback")}>Feedback</button>
            </div>
            {adminTab === "workspaces" ? (
              <div className="grid">
                <Panel title="Solicitudes pendientes">
                  {requests.length === 0 && <p className="muted">No hay solicitudes.</p>}
                  {requests.map((item) => <AdminRequest request={item} onDone={refresh} key={item.id} />)}
                </Panel>
                <Panel title="Todos los workspaces">
                  {workspaces.length === 0 && <p className="muted">No hay workspaces asignados.</p>}
                  {workspaces.map((workspace) => <WorkspaceCard workspace={workspace} onOpen={(item) => openWorkspace(item, "admin")} key={workspace.id} />)}
                </Panel>
              </div>
            ) : adminTab === "settings" ? (
              <WorkspaceAdminSettings workspaces={workspaces} onChanged={refresh} />
            ) : adminTab === "chat" ? (
              <AdminFeedbackInbox items={adminFeedbackItems} onChanged={refresh} mode="chat" />
            ) : (
              <AdminFeedbackInbox items={adminFeedbackItems} onChanged={refresh} mode="tickets" />
            )}
          </>
        )}

        {feedbackOpen && (
          <div className="modal-backdrop feedback-modal-backdrop" onClick={() => {
            setFeedbackOpen(false);
            if (window.location.pathname === "/feedback") navigate({ view: "mine", workspaceId: null, folder: "" });
          }}>
            <div className="feedback-modal-shell" onClick={(event) => event.stopPropagation()}>
              <div className="feedback-modal-header">
                <div>
                  <span>GateStorage</span>
                  <h3>Feedback</h3>
                </div>
                <button className="icon-button" onClick={() => {
                  setFeedbackOpen(false);
                  if (window.location.pathname === "/feedback") navigate({ view: "mine", workspaceId: null, folder: "" });
                }} title="Cerrar"><X /></button>
              </div>
              <FeedbackCenter
                feedbackItems={feedbackItems}
                workspaces={myWorkspaces}
                onCreated={(item) => setFeedbackItems((current) => [item, ...current])}
                onReloaded={setFeedbackItems}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel"><h3>{title}</h3>{children}</section>;
}

function RequestCard({ request }: { request: StorageRequest }) {
  return (
    <article className="item">
      <strong>{request.workspace_name}</strong>
      <span>{request.source_app} / {request.workspace_key}</span>
      <p>{formatBytes(request.requested_bytes)} solicitado · {request.status}</p>
    </article>
  );
}

function StorageHub({
  workspaces,
  requests,
  onOpen,
}: {
  workspaces: StorageWorkspace[];
  requests: StorageRequest[];
  onOpen: (workspace: StorageWorkspace) => void;
}) {
  const totalUsed = workspaces.reduce((sum, workspace) => sum + workspace.used_bytes, 0);
  const totalQuota = workspaces.reduce((sum, workspace) => sum + workspace.quota_bytes, 0);
  const pendingRequests = requests.filter((request) => request.status === "pending").length;

  return (
    <div className="storage-hub">
      <section className="welcome-banner">
        <div>
          <h1>Hub de almacenamiento</h1>
          <p>Administra tus workspaces, archivos publicos y solicitudes de cuota desde una experiencia alineada con GateWiki.</p>
        </div>
        <div className="banner-icon"><HardDrive /></div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <div className="metric-icon primary-color"><Database /></div>
          <div className="metric-info">
            <span className="metric-value">{workspaces.length}</span>
            <span className="metric-label">Workspaces</span>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-icon success-color"><HardDrive /></div>
          <div className="metric-info">
            <span className="metric-value">{formatBytes(totalUsed)}</span>
            <span className="metric-label">Usado de {formatBytes(totalQuota)}</span>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-icon warning-color"><MessageSquare /></div>
          <div className="metric-info">
            <span className="metric-value">{pendingRequests}</span>
            <span className="metric-label">Solicitudes pendientes</span>
          </div>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="card grid-main">
          <div className="card-header">
            <h2>Workspaces</h2>
          </div>
          {workspaces.length === 0 ? (
            <div className="empty-hub-card">
              <HardDrive />
              <strong>No hay storage aprobado</strong>
              <p className="muted">Cuando un admin apruebe una solicitud, el workspace aparecera aqui.</p>
            </div>
          ) : (
            <div className="spaces-hub-grid">
              {workspaces.map((workspace) => (
                <WorkspaceCard workspace={workspace} onOpen={onOpen} key={workspace.id} />
              ))}
            </div>
          )}
        </section>

        <section className="card grid-side">
          <div className="card-header">
            <h2>Solicitudes</h2>
          </div>
          {requests.length === 0 && <p className="muted">Sin solicitudes.</p>}
          <div className="hub-request-list">
            {requests.map((item) => <RequestCard request={item} key={item.id} />)}
          </div>
        </section>
      </div>
    </div>
  );
}

function WorkspaceCard({ workspace, onOpen }: { workspace: StorageWorkspace; onOpen?: (workspace: StorageWorkspace) => void }) {
  const percent = workspace.quota_bytes ? Math.round((workspace.used_bytes / workspace.quota_bytes) * 100) : 0;
  return (
    <button className="item workspace-card space-hub-card" type="button" onClick={() => onOpen?.(workspace)}>
      <div className="space-hub-top">
        <span className="space-nav-badge">{workspace.workspace_key}</span>
        <span className={`status-pill ${workspace.status}`}>{workspace.status}</span>
      </div>
      <strong>{workspace.workspace_name}</strong>
      <span>{workspace.source_app} / propietario {workspace.owner_name}</span>
      <p>{formatBytes(workspace.used_bytes)} usados de {formatBytes(workspace.quota_bytes)}</p>
      <div className="bar"><i style={{ width: `${Math.min(100, percent)}%` }} /></div>
      <small>Abrir gestor de archivos</small>
    </button>
  );
}

function WorkspaceAdminSettings({ workspaces, onChanged }: { workspaces: StorageWorkspace[]; onChanged: () => void }) {
  return (
    <section className="panel workspace-settings-panel">
      <div className="section-title">
        <h3>Configurar workspaces</h3>
        <span>{workspaces.length} workspaces</span>
      </div>
      {workspaces.length === 0 && <p className="muted">No hay workspaces para configurar.</p>}
      <div className="workspace-settings-list">
        {workspaces.map((workspace) => (
          <WorkspaceSettingsRow workspace={workspace} onChanged={onChanged} key={workspace.id} />
        ))}
      </div>
    </section>
  );
}

function WorkspaceSettingsRow({ workspace, onChanged }: { workspace: StorageWorkspace; onChanged: () => void }) {
  const [quotaGb, setQuotaGb] = useState(Math.max(0, Math.round(workspace.quota_bytes / 1024 / 1024 / 1024)));
  const [status, setStatus] = useState(workspace.status || "active");
  const [message, setMessage] = useState(workspace.status_message || "");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const minQuota = Math.ceil(workspace.used_bytes / 1024 / 1024 / 1024);

  useEffect(() => {
    setQuotaGb(Math.max(0, Math.round(workspace.quota_bytes / 1024 / 1024 / 1024)));
    setStatus(workspace.status || "active");
    setMessage(workspace.status_message || "");
  }, [workspace.id, workspace.quota_bytes, workspace.status, workspace.status_message]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      await api.updateWorkspaceAdmin(workspace.id, quotaGb, status, message);
      setNotice("Guardado.");
      onChanged();
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="workspace-settings-row" onSubmit={save}>
      <div className="workspace-settings-name">
        <strong>{workspace.workspace_name}</strong>
        <span>{workspace.source_app} / {workspace.workspace_key}</span>
        <small>{formatBytes(workspace.used_bytes)} usados</small>
      </div>
      <label>
        Cuota GB
        <input type="number" min={minQuota} value={quotaGb} onChange={(event) => setQuotaGb(Number(event.target.value))} />
      </label>
      <label>
        Estado
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="active">Activo</option>
          <option value="suspended">Suspendido</option>
          <option value="archived">Archivado</option>
        </select>
      </label>
      <label className="workspace-message-cell">
        Mensaje
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Mensaje visible al entrar al workspace" />
      </label>
      <button className="full-width-action" disabled={saving}>Guardar</button>
      {notice && <p className="row-notice">{notice}</p>}
    </form>
  );
}

const FEEDBACK_LABELS: Record<FeedbackCategory, string> = {
  support: "Soporte de storage",
  bug: "Reportar problema",
  quota: "Solicitar o cambiar cuota",
  admin_contact: "Comunicarse con un admin"
};

function FeedbackCenter({
  feedbackItems,
  workspaces,
  onCreated,
  onReloaded,
  mode = "both",
}: {
  feedbackItems: FeedbackItem[];
  workspaces: StorageWorkspace[];
  onCreated: (item: FeedbackItem) => void;
  onReloaded: (items: FeedbackItem[]) => void;
  mode?: "chat" | "feedback" | "both";
}) {
  const [category, setCategory] = useState<FeedbackCategory>("support");
  const [workspaceId, setWorkspaceId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [chatSaving, setChatSaving] = useState(false);
  const [reopenChat, setReopenChat] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const chatItems = feedbackItems.filter((item) => item.category === "admin_contact").slice().reverse();
  const supportItems = feedbackItems.filter((item) => item.category !== "admin_contact");
  const latestChat = chatItems[chatItems.length - 1];
  const chatClosed = latestChat?.status === "closed" && !reopenChat;

  useEffect(() => {
    const timer = window.setInterval(() => {
      api.feedback().then(onReloaded).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [onReloaded]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatItems.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setSaving(true);
    try {
      const item = await api.createFeedback({
        category,
        title: title.trim(),
        message: message.trim(),
        workspace_id: selectedWorkspace?.id ?? null,
        workspace_name: selectedWorkspace?.workspace_name ?? null
      });
      onCreated(item);
      setTitle("");
      setMessage("");
      setNotice("Feedback enviado.");
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo enviar el feedback.");
    } finally {
      setSaving(false);
    }
  }

  async function sendChat(event: FormEvent) {
    event.preventDefault();
    const body = chatMessage.trim();
    if (!body) return;
    setNotice("");
    setChatSaving(true);
    try {
      const item = await api.createFeedback({
        category: "admin_contact",
        title: "Chat con admin",
        message: body.length < 5 ? body.padEnd(5, " ") : body,
        workspace_id: selectedWorkspace?.id ?? null,
        workspace_name: selectedWorkspace?.workspace_name ?? null
      });
      onCreated(item);
      setChatMessage("");
      setReopenChat(false);
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo enviar el mensaje.");
    } finally {
      setChatSaving(false);
    }
  }

  return (
    <div className={`feedback-layout feedback-layout-${mode}`}>
      {mode !== "feedback" && <section className="panel admin-chat-panel">
        <div className="section-title">
          <h3>Chat con admin</h3>
          <span>Actualiza en vivo</span>
        </div>
        <label className="chat-workspace-picker">
          Workspace
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            <option value="">General</option>
            {workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.workspace_name}</option>)}
          </select>
        </label>
        <div className="chat-thread" ref={chatScrollRef}>
          {chatItems.length === 0 && (
            <div className="chat-empty">
              <MessageSquare />
              <strong>Sin mensajes todavia</strong>
              <span>Escribe abajo para abrir una conversacion con administracion.</span>
            </div>
          )}
          {chatItems.map((item) => (
            <React.Fragment key={item.id}>
              <div className="chat-bubble mine">
                <p>{item.message}</p>
                <span>{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {item.status}</span>
              </div>
              {item.public_response && (
                <div className="chat-bubble admin">
                  <strong>{item.responded_by_name || "Admin"}</strong>
                  <p>{item.public_response}</p>
                  {item.responded_at && <span>{new Date(item.responded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
        <form className="chat-composer" onSubmit={sendChat}>
          {chatClosed ? (
            <>
              <input value="Este chat fue cerrado por admin." readOnly />
              <button type="button" onClick={() => setReopenChat(true)}>Abrir nuevo chat</button>
            </>
          ) : (
            <>
              <input value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} placeholder="Escribe un mensaje para admin..." />
              <button disabled={chatSaving || !chatMessage.trim()} title="Enviar"><Send /></button>
            </>
          )}
        </form>
        {notice && <p className="row-notice">{notice}</p>}
      </section>}

      {mode !== "chat" && <section className="panel feedback-compose">
        <div className="section-title">
          <h3>Feedback</h3>
          <span>Soporte, bugs y cuota</span>
        </div>
        <form className="feedback-form" onSubmit={submit}>
          <label>
            Categoria
            <select value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)}>
              {Object.entries(FEEDBACK_LABELS)
                .filter(([value]) => value !== "admin_contact")
                .map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Workspace
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              <option value="">General</option>
              {workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.workspace_name}</option>)}
            </select>
          </label>
          <label className="feedback-wide">
            Asunto
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Necesito ayuda con permisos" required minLength={3} maxLength={160} />
          </label>
          <label className="feedback-wide">
            Mensaje
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Cuenta que necesitas revisar con el admin" required minLength={5} maxLength={4000} />
          </label>
          <button className="full-width-action" disabled={saving}><Send /> Enviar feedback</button>
          {notice && <p className="row-notice">{notice}</p>}
        </form>
        <div className="feedback-mini-history">
          <div className="section-title">
            <h3>Seguimiento</h3>
            <span>{supportItems.length} tickets</span>
          </div>
          {supportItems.length === 0 && <p className="muted">Todavia no has enviado feedback de soporte.</p>}
          {supportItems.map((item) => (
            <article className="feedback-item" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{FEEDBACK_LABELS[item.category] ?? "Soporte"} {item.workspace_name ? `- ${item.workspace_name}` : ""}</span>
              </div>
              <span className={`status-pill ${item.status}`}>{item.status}</span>
              <p>{item.message}</p>
              {item.public_response && (
                <div className="feedback-response">
                  <strong>Respuesta de admin</strong>
                  <p>{item.public_response}</p>
                  {item.responded_by_name && <span>{item.responded_by_name}</span>}
                </div>
              )}
              <small>{new Date(item.created_at).toLocaleString()}</small>
            </article>
          ))}
        </div>
      </section>}
    </div>
  );
}

function AdminFeedbackInbox({ items, onChanged, mode = "both" }: { items: FeedbackItem[]; onChanged: () => void; mode?: "chat" | "tickets" | "both" }) {
  const [replyById, setReplyById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState("");
  const [notice, setNotice] = useState("");
  const chatItems = items.filter((item) => item.category === "admin_contact");
  const ticketItems = items.filter((item) => item.category !== "admin_contact");
  const chatThreads = useMemo(() => {
    const grouped = new Map<string, FeedbackItem[]>();
    for (const item of chatItems) {
      const key = `${item.created_by_email}::${item.workspace_id || "general"}`;
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    return Array.from(grouped.entries()).map(([key, threadItems]) => {
      const sorted = threadItems.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const latest = sorted[sorted.length - 1];
      const pending = sorted.slice().reverse().find((item) => !item.public_response && item.status !== "closed") || latest;
      return { key, items: sorted, latest, pending };
    }).sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime());
  }, [chatItems]);

  async function respond(item: FeedbackItem) {
    const response = (replyById[item.id] || "").trim();
    if (!response) return;
    setSavingId(item.id);
    setNotice("");
    try {
      await api.respondFeedback(item.id, response);
      setReplyById((current) => ({ ...current, [item.id]: "" }));
      setNotice("Respuesta enviada.");
      onChanged();
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
      await api.updateFeedbackStatus(item.id, "closed");
      setNotice("Chat cerrado.");
      onChanged();
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo cerrar el chat.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="panel admin-feedback-panel">
      {mode !== "tickets" && <div className="section-title">
        <h3>Chat con usuarios</h3>
        <span>{chatThreads.length} conversaciones</span>
      </div>}
      {notice && <p className="row-notice">{notice}</p>}
      {mode !== "tickets" && chatThreads.length === 0 && <p className="muted">Todavia no hay conversaciones de chat.</p>}
      {mode !== "tickets" && <div className="admin-chat-list">
        {chatThreads.map((thread) => (
          <article className="admin-chat-thread" key={thread.key}>
            <div className="admin-feedback-head">
              <div>
                <strong>{thread.latest.created_by_name}</strong>
                <span>{thread.latest.created_by_email} {thread.latest.workspace_name ? `- ${thread.latest.workspace_name}` : "- General"}</span>
              </div>
              <span className={`status-pill ${thread.latest.status === "closed" ? "closed" : thread.pending.public_response ? "resolved" : "open"}`}>{thread.latest.status === "closed" ? "closed" : thread.pending.public_response ? "resolved" : "open"}</span>
            </div>
            <div className="admin-chat-messages">
              {thread.items.map((item) => (
                <React.Fragment key={item.id}>
                  <div className="chat-bubble mine admin-view-user">
                    <p>{item.message}</p>
                    <span>{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  {item.public_response && (
                    <div className="chat-bubble admin admin-view-reply">
                      <strong>{item.responded_by_name || "Admin"}</strong>
                      <p>{item.public_response}</p>
                      {item.responded_at && <span>{new Date(item.responded_at).toLocaleString()}</span>}
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
            {thread.latest.status === "closed" ? (
              <p className="muted">Chat cerrado. Si el usuario escribe de nuevo se abrira otro hilo.</p>
            ) : (
              <div className="admin-feedback-reply">
                <textarea
                  value={replyById[thread.pending.id] || ""}
                  onChange={(event) => setReplyById((current) => ({ ...current, [thread.pending.id]: event.target.value }))}
                  placeholder="Responder en esta conversacion..."
                />
                <button className="full-width-action" disabled={savingId === thread.pending.id || !(replyById[thread.pending.id] || "").trim()} onClick={() => respond(thread.pending)}>
                  <Send /> Responder
                </button>
                <button className="secondary-action" disabled={savingId === thread.latest.id} onClick={() => closeChat(thread.latest)}>
                  Cerrar chat
                </button>
              </div>
            )}
          </article>
        ))}
      </div>}

      {mode !== "chat" && <div className={mode === "tickets" ? "admin-ticket-section" : "feedback-mini-history admin-ticket-section"}>
        <div className="section-title">
          <h3>Feedback formal</h3>
          <span>{ticketItems.length} tickets</span>
        </div>
        {ticketItems.length === 0 && <p className="muted">Sin feedback formal.</p>}
        <div className="admin-feedback-list">
        {ticketItems.map((item) => (
          <article className="admin-feedback-item" key={item.id}>
            <div className="admin-feedback-head">
              <div>
                <strong>{item.title}</strong>
                <span>{FEEDBACK_LABELS[item.category] ?? "Feedback"} {item.workspace_name ? `- ${item.workspace_name}` : ""}</span>
              </div>
              <span className={`status-pill ${item.status}`}>{item.status}</span>
            </div>
            <p>{item.message}</p>
            <small>{item.created_by_name} - {item.created_by_email} - {new Date(item.created_at).toLocaleString()}</small>
            {item.public_response && (
              <div className="feedback-response">
                <strong>Respuesta enviada</strong>
                <p>{item.public_response}</p>
                {item.responded_by_name && <span>{item.responded_by_name}</span>}
              </div>
            )}
            <div className="admin-feedback-reply">
              <textarea
                value={replyById[item.id] || ""}
                onChange={(event) => setReplyById((current) => ({ ...current, [item.id]: event.target.value }))}
                placeholder="Responder al usuario..."
              />
              <button className="full-width-action" disabled={savingId === item.id || !(replyById[item.id] || "").trim()} onClick={() => respond(item)}>
                <Send /> Responder
              </button>
            </div>
          </article>
        ))}
        </div>
      </div>}
    </section>
  );
}

function FileManager({
  workspace,
  currentUser,
  initialFolder,
  onBack,
  onChanged,
  onFolderChange,
}: {
  workspace: StorageWorkspace;
  currentUser: UserProfile;
  initialFolder: string;
  onBack: () => void;
  onChanged: () => void;
  onFolderChange: (folder: string) => void;
}) {
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [localWorkspace, setLocalWorkspace] = useState(workspace);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentFolder, setCurrentFolder] = useState(initialFolder);
  const [newFolderName, setNewFolderName] = useState("");
  const [searchText, setSearchText] = useState("");
  const [moveEntry, setMoveEntry] = useState<StorageEntry | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedEntry, setSelectedEntry] = useState<StorageEntry | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: StorageEntry | null } | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const usedPercent = localWorkspace.quota_bytes ? Math.round((localWorkspace.used_bytes / localWorkspace.quota_bytes) * 100) : 0;
  const canManageAccess = currentUser.is_platform_admin || currentUser.permissions.includes("gatestorage:admin") || localWorkspace.owner_user_id === currentUser.id;
  const isWorkspaceWritable = localWorkspace.status === "active";
  const canPublishSelectedFile =
    selectedEntry?.type === "file" &&
    (canManageAccess || selectedEntry.uploaded_by_user_id === currentUser.id);

  useEffect(() => {
    setLocalWorkspace(workspace);
    setCurrentFolder(initialFolder);
    setSearchText("");
    setSelectedEntry(null);
  }, [workspace.id, initialFolder]);

  useEffect(() => {
    refreshEntries();
  }, [workspace.id, currentFolder]);

  useEffect(() => {
    api.users().then(setAllUsers).catch(() => setAllUsers([]));
  }, []);

  async function refreshEntries() {
    const nextEntries = await api.entries(workspace.id, currentFolder).catch((err) => {
      setNotice(err.message ?? "No se pudo cargar esta carpeta.");
      return [];
    });
    setEntries(Array.isArray(nextEntries) ? nextEntries : []);
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) return;
    setBusy(true);
    setNotice("");
    try {
      const uploadedFile = await api.uploadFile(workspace.id, selectedFile, currentFolder);
      await refreshEntries();
      setLocalWorkspace((current) => ({ ...current, used_bytes: current.used_bytes + uploadedFile.size_bytes }));
      setSelectedFile(null);
      onChanged();
      setNotice(`Archivo subido en ${currentFolder || "raiz"}.`);
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleHiddenFileInput(files: FileList | null) {
    if (!isWorkspaceWritable) {
      setNotice(localWorkspace.status_message || "Storage no esta activo.");
      return;
    }
    if (!files?.length) return;
    await uploadDroppedFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadDroppedFiles(files: FileList | File[]) {
    if (!isWorkspaceWritable) {
      setNotice(localWorkspace.status_message || "Storage no esta activo.");
      return;
    }
    const nextFiles = Array.from(files);
    if (!nextFiles.length) return;
    setBusy(true);
    setNotice("");
    try {
      let uploadedBytes = 0;
      for (const file of nextFiles) {
        const uploadedFile = await api.uploadFile(workspace.id, file, currentFolder);
        uploadedBytes += uploadedFile.size_bytes;
      }
      await refreshEntries();
      setLocalWorkspace((current) => ({ ...current, used_bytes: current.used_bytes + uploadedBytes }));
      onChanged();
      setNotice(`${nextFiles.length} archivo(s) subido(s).`);
    } catch (err: any) {
      setNotice(err.message ?? "No se pudieron subir los archivos.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateFolder(event: FormEvent) {
    event.preventDefault();
    const folderName = newFolderName.trim();
    if (!folderName) return;
    setBusy(true);
    setNotice("");
    try {
      const folderPath = [currentFolder, folderName].filter(Boolean).join("/");
      await api.createFolder(workspace.id, folderPath);
      setNewFolderName("");
      await refreshEntries();
      setNotice("Carpeta creada.");
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo crear la carpeta.");
    } finally {
      setBusy(false);
    }
  }

  function openFolderDialog() {
    setNewFolderName("");
    setFolderDialogOpen(true);
    setNewMenuOpen(false);
    setContextMenu(null);
  }

  async function createFolderFromDialog(event?: FormEvent) {
    event?.preventDefault();
    const folderName = newFolderName.trim();
    if (!isWorkspaceWritable) {
      setNotice(localWorkspace.status_message || "Storage no esta activo.");
      setFolderDialogOpen(false);
      return;
    }
    if (!folderName) return;
    setBusy(true);
    setNotice("");
    try {
      const folderPath = [currentFolder, folderName].filter(Boolean).join("/");
      await api.createFolder(workspace.id, folderPath);
      await refreshEntries();
      setNotice("Carpeta creada.");
      setFolderDialogOpen(false);
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo crear la carpeta.");
    } finally {
      setBusy(false);
      setNewFolderName("");
    }
  }

  async function handleDeleteFile(file: StorageEntry) {
    if (!file.id || !window.confirm(`Eliminar ${file.name}?`)) return;
    setBusy(true);
    setNotice("");
    try {
      await api.deleteFile(file.id);
      await refreshEntries();
      setLocalWorkspace((current) => ({ ...current, used_bytes: Math.max(0, current.used_bytes - file.size_bytes) }));
      onChanged();
      setNotice("Archivo eliminado.");
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo eliminar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFolder(folder: StorageEntry) {
    if (!window.confirm(`Eliminar la carpeta ${folder.name} y todo su contenido?`)) return;
    setBusy(true);
    setNotice("");
    try {
      await api.deleteFolder(workspace.id, folder.path, true);
      await refreshEntries();
      setSelectedEntry(null);
      setNotice("Carpeta eliminada.");
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo eliminar la carpeta.");
    } finally {
      setBusy(false);
    }
  }

  function beginMove(entry: StorageEntry) {
    setMoveEntry(entry);
    setMoveTarget(currentFolder);
    setRenameValue(entry.name);
    setNotice("");
    setContextMenu(null);
  }

  async function handleMoveEntry(event: FormEvent) {
    event.preventDefault();
    if (!moveEntry) return;
    setBusy(true);
    setNotice("");
    try {
      if (moveEntry.type === "file" && moveEntry.id) {
        await api.moveFile(moveEntry.id, moveTarget, renameValue);
      } else {
        const target = [moveTarget, renameValue].filter(Boolean).join("/");
        await api.moveFolder(workspace.id, moveEntry.path, target);
      }
      setMoveEntry(null);
      await refreshEntries();
      onChanged();
      setNotice("Elemento movido.");
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo mover el archivo.");
    } finally {
      setBusy(false);
    }
  }

  async function updateMembers(nextMembers: string[]) {
    setBusy(true);
    setNotice("");
    try {
      const updated = await api.updateMembers(localWorkspace.source_app, localWorkspace.workspace_key, nextMembers);
      setLocalWorkspace(updated);
      onChanged();
      setMemberSearch("");
      setNotice("Acceso actualizado.");
    } catch (err: any) {
      setNotice(err.message ?? "No se pudieron actualizar los permisos.");
    } finally {
      setBusy(false);
    }
  }

  function addMember(email: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    const currentMembers = localWorkspace.member_emails || [];
    if (currentMembers.map((member) => member.toLowerCase()).includes(normalized)) return;
    updateMembers([...currentMembers, normalized]);
  }

  function removeMember(email: string) {
    updateMembers((localWorkspace.member_emails || []).filter((member) => member.toLowerCase() !== email.toLowerCase()));
  }

  async function togglePublicFile(file: StorageEntry, isPublic: boolean) {
    if (file.type !== "file" || !file.id) return;
    setBusy(true);
    setNotice("");
    try {
      const updated = await api.setFilePublic(file.id, isPublic);
      setEntries((current) =>
        current.map((entry) =>
          entry.id === updated.id
            ? { ...entry, is_public: updated.is_public, public_url: updated.public_url }
            : entry
        )
      );
      setSelectedEntry((current) =>
        current?.id === updated.id
          ? { ...current, is_public: updated.is_public, public_url: updated.public_url }
          : current
      );
      setNotice(isPublic ? "Archivo publico activado." : "Archivo privado nuevamente.");
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo cambiar la visibilidad publica.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPublicLink(url?: string | null) {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setNotice("Link publico copiado.");
  }

  const folders = entries.filter((entry) => entry.type === "folder");
  const files = entries.filter((entry) => entry.type === "file");
  const allFolderPaths = useMemo(() => {
    const paths = new Set<string>([""]);
    for (const entry of entries) {
      if (entry.type === "folder") paths.add(entry.path);
    }
    if (currentFolder) paths.add(currentFolder);
    const selectedPath = selectedEntry?.type === "folder" ? selectedEntry.path : selectedEntry?.path?.split("/").slice(0, -1).join("/");
    if (selectedPath) paths.add(selectedPath);
    return Array.from(paths).sort((a, b) => a.localeCompare(b));
  }, [entries, currentFolder, selectedEntry]);
  const visibleEntries = [...folders, ...files].filter((entry) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return entry.name.toLowerCase().includes(q) || entry.path.toLowerCase().includes(q);
  });
  const breadcrumbs = currentFolder ? currentFolder.split("/") : [];

  function openFolder(path: string) {
    setCurrentFolder(path);
    onFolderChange(path);
    setSearchText("");
    setNotice("");
    setSelectedEntry(null);
    setContextMenu(null);
  }

  function selectEntry(entry: StorageEntry) {
    setSelectedEntry(entry);
    setShowDetails(true);
    setContextMenu(null);
  }

  function showContextMenu(event: React.MouseEvent, entry: StorageEntry | null) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedEntry(entry);
    setContextMenu({ x: event.clientX, y: event.clientY, entry });
    setNewMenuOpen(false);
  }

  async function runContextAction(action: "open" | "download" | "move" | "delete" | "details" | "folder" | "upload") {
    const entry = contextMenu?.entry || selectedEntry;
    setContextMenu(null);
    if (["folder", "upload", "move", "delete"].includes(action) && !isWorkspaceWritable) {
      setNotice(localWorkspace.status_message || "Storage no esta activo.");
      return;
    }
    if (action === "folder") {
      openFolderDialog();
      return;
    }
    if (action === "upload") {
      fileInputRef.current?.click();
      return;
    }
    if (!entry) return;
    if (action === "open" && entry.type === "folder") openFolder(entry.path);
    if (action === "download" && entry.type === "file") api.downloadFile(entry as StorageFile).catch((err) => setNotice(err.message ?? "No se pudo descargar el archivo."));
    if (action === "move") beginMove(entry);
    if (action === "delete") entry.type === "folder" ? handleDeleteFolder(entry) : handleDeleteFile(entry);
    if (action === "details") {
      setSelectedEntry(entry);
      setShowDetails(true);
    }
  }

  const memberSuggestions = allUsers.filter((user) => {
    const q = memberSearch.trim().toLowerCase();
    const isSelected = (localWorkspace.member_emails || []).some((email) => email.toLowerCase() === user.email.toLowerCase());
    if (isSelected || user.email.toLowerCase() === localWorkspace.owner_email.toLowerCase()) return false;
    if (!q) return false;
    return user.full_name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);
  });

  return (
    <div
      className={showDetails ? "file-manager file-manager-with-panel" : "file-manager"}
      onClick={() => {
        setContextMenu(null);
        setNewMenuOpen(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!isWorkspaceWritable) {
          setNotice(localWorkspace.status_message || "Storage no esta activo.");
          return;
        }
        uploadDroppedFiles(event.dataTransfer.files);
      }}
    >
      <button className="back-button" onClick={onBack}><ArrowLeft /> Volver</button>
      <section className="panel workspace-hero">
        <div>
          <span>{localWorkspace.source_app} / {localWorkspace.workspace_key}</span>
          <h3>{localWorkspace.workspace_name}</h3>
          <p>{formatBytes(localWorkspace.used_bytes)} usados de {formatBytes(localWorkspace.quota_bytes)} disponibles</p>
          {!!localWorkspace.member_emails?.length && <small>{localWorkspace.member_emails.length} miembros con acceso</small>}
        </div>
        <div className="quota-widget">
          <strong>{Math.min(100, usedPercent)}%</strong>
          <div className="bar"><i style={{ width: `${Math.min(100, usedPercent)}%` }} /></div>
          <span className={`status-pill ${localWorkspace.status}`}>{localWorkspace.status}</span>
        </div>
      </section>

      {localWorkspace.status !== "active" && (
        <section className="workspace-status-banner">
          <ShieldCheck />
          <div>
            <strong>Storage {localWorkspace.status}</strong>
            <p>{localWorkspace.status_message || "Un administrador pauso las operaciones de escritura en este workspace."}</p>
          </div>
        </section>
      )}

      <section className="panel file-toolbar">
        <div className="drive-command-row">
          <div className="new-menu-wrap">
            <button
              type="button"
              className="new-button"
              disabled={!isWorkspaceWritable}
              onClick={(event) => {
                if (!isWorkspaceWritable) return;
                event.stopPropagation();
                setNewMenuOpen((value) => !value);
                setContextMenu(null);
              }}
            >
              <Plus /> Nuevo
            </button>
            {newMenuOpen && (
              <div className="drive-menu new-menu" onClick={(event) => event.stopPropagation()}>
                <button type="button" onClick={openFolderDialog}><FolderPlus /> Carpeta</button>
                <button type="button" onClick={() => fileInputRef.current?.click()}><Upload /> Subir archivo</button>
              </div>
            )}
          </div>
          {selectedEntry && (
            <div className="selection-actions">
              <span>{selectedEntry.name}</span>
              {selectedEntry.type === "folder" && <button type="button" onClick={() => openFolder(selectedEntry.path)}>Abrir</button>}
              {selectedEntry.type === "file" && <button type="button" onClick={() => api.downloadFile(selectedEntry as StorageFile).catch((err) => setNotice(err.message ?? "No se pudo descargar el archivo."))}><Download /> Descargar</button>}
              <button type="button" disabled={!isWorkspaceWritable} onClick={() => beginMove(selectedEntry)}><MoveRight /> Mover</button>
              <button type="button" disabled={!isWorkspaceWritable} className="danger-soft" onClick={() => selectedEntry.type === "folder" ? handleDeleteFolder(selectedEntry) : handleDeleteFile(selectedEntry)}><Trash2 /> Eliminar</button>
            </div>
          )}
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            multiple
            onChange={(event) => handleHiddenFileInput(event.target.files)}
          />
        </div>
        <div className="breadcrumb-row">
          <button type="button" className={!currentFolder ? "crumb active" : "crumb"} onClick={() => openFolder("")}>
            <Home /> Raiz
          </button>
          {breadcrumbs.map((part, index) => {
            const path = breadcrumbs.slice(0, index + 1).join("/");
            return (
              <button type="button" className="crumb" onClick={() => openFolder(path)} key={path}>
                {part}
              </button>
            );
          })}
        </div>
        <div className="tool-row">
          <label className="search-box">
            <Search />
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Buscar en esta carpeta" />
          </label>
          <button type="button" className={viewMode === "list" ? "icon-button active" : "icon-button"} onClick={() => setViewMode("list")} title="Vista lista"><List /></button>
          <button type="button" className={viewMode === "grid" ? "icon-button active" : "icon-button"} onClick={() => setViewMode("grid")} title="Vista cuadrícula"><Grid2X2 /></button>
          <button type="button" className={showDetails ? "icon-button active" : "icon-button"} onClick={() => setShowDetails((value) => !value)} title="Detalles"><Info /></button>
          <button type="button" className="icon-button" onClick={refreshEntries} disabled={busy} title="Actualizar"><RefreshCw /></button>
        </div>
      </section>

      <section
        className="panel file-canvas"
        onContextMenu={(event) => {
          const target = event.target as HTMLElement;
          if (!target.closest(".entry-row") && !target.closest(".entry-tile")) showContextMenu(event, null);
        }}
      >
        <div className="section-title">
          <h3>{currentFolder || "Raiz"}</h3>
          <span>{folders.length} carpetas · {files.length} archivos</span>
        </div>
        {notice && <p className="muted">{notice}</p>}
        {visibleEntries.length === 0 && (
          <div className="empty-drive-state">
            <Upload />
            <strong>Esta carpeta esta vacia</strong>
            <span>Arrastra archivos aqui o usa click derecho para crear/subir.</span>
          </div>
        )}
        <div className={viewMode === "grid" ? "entry-grid" : "entry-list"}>
          {visibleEntries.map((entry) => (
            <article
              className={[
                viewMode === "grid" ? "entry-tile" : "entry-row",
                entry.type === "folder" ? "folder-entry" : "",
                selectedEntry?.path === entry.path ? "selected-entry" : ""
              ].filter(Boolean).join(" ")}
              key={`${entry.type}-${entry.path}-${entry.id || ""}`}
              onClick={() => selectEntry(entry)}
              onContextMenu={(event) => showContextMenu(event, entry)}
              onDoubleClick={() =>
                entry.type === "folder"
                  ? openFolder(entry.path)
                  : api.downloadFile(entry as StorageFile).catch((err) => setNotice(err.message ?? "No se pudo descargar el archivo."))
              }
            >
              {entry.type === "folder" ? <Folder /> : <FileText />}
              <div>
                <strong>{entry.name}</strong>
                <span>
                  {entry.type === "folder"
                    ? entry.path
                    : `${formatBytes(entry.size_bytes)} - subido por ${entry.uploaded_by_name || "usuario"}`}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {folderDialogOpen && (
        <div className="modal-backdrop" onClick={() => setFolderDialogOpen(false)}>
          <form className="drive-dialog" onSubmit={createFolderFromDialog} onClick={(event) => event.stopPropagation()}>
            <div className="dialog-icon"><FolderPlus /></div>
            <div>
              <h3>Nueva carpeta</h3>
              <p>Se creara dentro de {currentFolder || "Raiz"}.</p>
            </div>
            <label>
              Nombre
              <input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Ej. Documentos del proyecto" />
            </label>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={() => setFolderDialogOpen(false)}>Cancelar</button>
              <button disabled={busy || !newFolderName.trim()}><FolderPlus /> Crear</button>
            </div>
          </form>
        </div>
      )}

      {moveEntry && (
        <div className="modal-backdrop" onClick={() => setMoveEntry(null)}>
          <form className="drive-dialog" onSubmit={handleMoveEntry} onClick={(event) => event.stopPropagation()}>
            <div className="dialog-icon">{moveEntry.type === "folder" ? <Folder /> : <FileText />}</div>
            <div>
              <h3>Mover o renombrar</h3>
              <p>{moveEntry.name}</p>
            </div>
            <label>
              Nombre visible
              <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
            </label>
            <label>
              Destino
              <select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>
                {allFolderPaths.map((path) => (
                  <option value={path} key={path}>{path || "Raiz"}</option>
                ))}
              </select>
            </label>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={() => setMoveEntry(null)}>Cancelar</button>
              <button disabled={busy || !renameValue.trim()}><MoveRight /> Aplicar</button>
            </div>
          </form>
        </div>
      )}

      {contextMenu && (
        <div className="drive-menu context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          {contextMenu.entry ? (
            <>
              {contextMenu.entry.type === "folder" && <button type="button" onClick={() => runContextAction("open")}><Folder /> Abrir</button>}
              {contextMenu.entry.type === "file" && <button type="button" onClick={() => runContextAction("download")}><Download /> Descargar</button>}
              <button type="button" onClick={() => runContextAction("details")}><Info /> Ver detalles</button>
              <button type="button" onClick={() => runContextAction("move")}><MoveRight /> Mover o renombrar</button>
              <button type="button" className="danger-menu-item" onClick={() => runContextAction("delete")}><Trash2 /> Eliminar</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => runContextAction("folder")}><FolderPlus /> Nueva carpeta</button>
              <button type="button" onClick={() => runContextAction("upload")}><Upload /> Subir archivo</button>
              <button type="button" onClick={refreshEntries}><RefreshCw /> Actualizar</button>
            </>
          )}
        </div>
      )}

      {showDetails && (
        <aside className="panel details-panel">
          <div className="details-header">
            <h3>Detalles</h3>
            <button className="icon-button" onClick={() => setShowDetails(false)} title="Cerrar"><X /></button>
          </div>
          {selectedEntry ? (
            <div className="details-stack">
              <div className="details-preview">{selectedEntry.type === "folder" ? <Folder /> : <FileText />}</div>
              <div>
                <strong>{selectedEntry.name}</strong>
                <span>{selectedEntry.type === "folder" ? "Carpeta" : selectedEntry.content_type || "Archivo"}</span>
              </div>
              <p>{selectedEntry.path}</p>
              {selectedEntry.type === "file" && <p>{formatBytes(selectedEntry.size_bytes)} - subido por {selectedEntry.uploaded_by_name || "usuario"}</p>}
              {selectedEntry.type === "file" && canPublishSelectedFile && (
                <div className={selectedEntry.is_public ? "public-share-box active" : "public-share-box"}>
                  <div className="public-share-title">
                    <Globe2 />
                    <div>
                      <strong>{selectedEntry.is_public ? "Archivo publico" : "Archivo privado"}</strong>
                      <span>{selectedEntry.is_public ? "Cualquiera con el link puede descargarlo." : "Solo usuarios con acceso al workspace."}</span>
                    </div>
                  </div>
                  {selectedEntry.public_url && (
                    <div className="public-link-row">
                      <input value={selectedEntry.public_url} readOnly />
                      <button type="button" className="icon-button" title="Copiar link" onClick={() => copyPublicLink(selectedEntry.public_url)}>
                        <Copy />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className={selectedEntry.is_public ? "danger-soft full-width-action" : "full-width-action"}
                    disabled={busy}
                    onClick={() => togglePublicFile(selectedEntry, !selectedEntry.is_public)}
                  >
                    <Globe2 />
                    {selectedEntry.is_public ? "Quitar acceso publico" : "Hacer publico"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="details-empty">
              <Info />
              <p>Selecciona un archivo o carpeta para ver detalles, acceso y opciones de publicacion.</p>
            </div>
          )}

          <div className="access-panel">
            <div className="access-title"><Users /> <strong>Acceso</strong></div>
            <div className="member-list">
              <span className="member-chip">{localWorkspace.owner_name} · propietario</span>
              {(localWorkspace.member_emails || []).map((email) => (
                <span className="member-chip" key={email}>
                  {email}
                  {canManageAccess && <button onClick={() => removeMember(email)} title="Quitar acceso"><X /></button>}
                </span>
              ))}
            </div>
            {canManageAccess && (
              <div className="member-picker">
                <label><UserPlus /> Agregar usuario</label>
                <input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addMember(memberSearch);
                    }
                  }}
                  placeholder="Nombre o correo"
                />
                {memberSuggestions.length > 0 && (
                  <div className="member-suggestions">
                    {memberSuggestions.slice(0, 6).map((user) => (
                      <button type="button" onClick={() => addMember(user.email)} key={user.email}>
                        <strong>{user.full_name}</strong>
                        <span>{user.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button className="ghost-button full-width-action" onClick={() => addMember(memberSearch)} disabled={!memberSearch.trim() || busy}>Agregar usuario</button>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function AdminRequest({ request, onDone }: { request: StorageRequest; onDone: () => void }) {
  const [quotaGb, setQuotaGb] = useState(Math.max(1, Math.round(request.requested_bytes / 1024 / 1024 / 1024)));
  const [notes, setNotes] = useState("");

  async function review(status: "approved" | "rejected") {
    await api.review(request.id, status, quotaGb, notes);
    onDone();
  }

  return (
    <article className="item admin-item">
      <strong>{request.workspace_name}</strong>
      <span>{request.owner_name} · {request.owner_email}</span>
      <p>{formatBytes(request.requested_bytes)} solicitado · {request.status}</p>
      {request.reason && <p>{request.reason}</p>}
      {request.status === "pending" && (
        <div className="review-row">
          <input type="number" min={1} value={quotaGb} onChange={(event) => setQuotaGb(Number(event.target.value))} />
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas admin" />
          <button onClick={() => review("approved")}><CheckCircle2 /> Aprobar</button>
          <button className="danger" onClick={() => review("rejected")}><XCircle /> Rechazar</button>
        </div>
      )}
    </article>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
