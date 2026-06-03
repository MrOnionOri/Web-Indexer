import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CheckCircle2, Database, HardDrive, LogOut, ShieldCheck, XCircle } from "lucide-react";
import "./style.css";

type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  permissions: string[];
  is_platform_admin: boolean;
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
  workspace_key: string;
  workspace_name: string;
  owner_name: string;
  owner_email: string;
  quota_bytes: number;
  used_bytes: number;
  status: string;
};

// async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
//   const token = localStorage.getItem("gatestorage_token");
//   const headers = new Headers(options.headers);
//   if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
//   if (token) headers.set("Authorization", `Bearer ${token}`);
//   const response = await fetch(path, { ...options, headers, cache: "no-store" });
//   if (!response.ok) {
//     const payload = await response.json().catch(() => ({ detail: "Request failed" }));
//     throw new Error(typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail));
//   }
//   return response.json();
// }

const API_BASE_URL = import.meta.env.VITE_GATESTORAGE_BACKEND_URL ?? "http://192.168.1.150:8002";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("gatestorage_token");
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : JSON.stringify(payload.detail)
    );
  }

  return response.json();
}

const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string | null; must_reset_password: boolean; reset_token: string | null }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  me: () => request<UserProfile>("/auth/me"),
  requests: () => request<StorageRequest[]>("/api/storage-requests"),
  myRequests: () => request<StorageRequest[]>("/api/my/storage-requests"),
  workspaces: () => request<StorageWorkspace[]>("/api/workspaces"),
  myWorkspaces: () => request<StorageWorkspace[]>("/api/my/workspaces"),
  review: (requestId: string, status: "approved" | "rejected", quotaGb: number, adminNotes: string) =>
    request<StorageRequest>(`/api/storage-requests/${requestId}/review`, {
      method: "PATCH",
      body: JSON.stringify({ status, quota_bytes: gbToBytes(quotaGb), admin_notes: adminNotes })
    })
};

function gbToBytes(gb: number) {
  return Math.max(0, Math.round(gb * 1024 * 1024 * 1024));
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 GB";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function App() {
  const [me, setMe] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [requests, setRequests] = useState<StorageRequest[]>([]);
  const [myRequests, setMyRequests] = useState<StorageRequest[]>([]);
  const [workspaces, setWorkspaces] = useState<StorageWorkspace[]>([]);
  const [myWorkspaces, setMyWorkspaces] = useState<StorageWorkspace[]>([]);
  const [activeView, setActiveView] = useState<"mine" | "admin">("mine");
  const permissions = useMemo(() => new Set(me?.permissions ?? []), [me]);
  const canAdmin = !!me?.is_platform_admin || permissions.has("gatestorage:admin");

  useEffect(() => {
    const cookieToken = document.cookie.match(/(?:^|; )gatestack_token=([^;]*)/)?.[1];
    if (cookieToken && !localStorage.getItem("gatestorage_token")) localStorage.setItem("gatestorage_token", cookieToken);
    if (!localStorage.getItem("gatestorage_token")) return;
    api.me().then(setMe).catch(() => localStorage.removeItem("gatestorage_token"));
  }, []);

  useEffect(() => {
    if (!me) return;
    refresh();
  }, [me]);

  async function refresh() {
    const mine = await Promise.all([
      api.myRequests().catch(() => []),
      api.myWorkspaces().catch(() => [])
    ]);
    setMyRequests(mine[0]);
    setMyWorkspaces(mine[1]);
    if (canAdmin) {
      const admin = await Promise.all([api.requests(), api.workspaces()]);
      setRequests(admin[0]);
      setWorkspaces(admin[1]);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.login(email, password);
      if (!result.access_token) throw new Error("GateStack no devolvio token.");
      localStorage.setItem("gatestorage_token", result.access_token);
      document.cookie = `gatestack_token=${result.access_token}; path=/; max-age=1209600; SameSite=Lax`;
      setMe(await api.me());
    } catch (err: any) {
      setError(err.message ?? "No se pudo iniciar sesion");
    }
  }

  function logout() {
    localStorage.removeItem("gatestorage_token");
    setMe(null);
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
        <button className={activeView === "mine" ? "active" : ""} onClick={() => setActiveView("mine")}><Database /> Mis workspaces</button>
        {canAdmin && <button className={activeView === "admin" ? "active" : ""} onClick={() => setActiveView("admin")}><ShieldCheck /> Admin</button>}
        <button className="logout" onClick={logout}><LogOut /> Salir</button>
      </aside>
      <section className="content">
        <header>
          <div>
            <span>GateStorage</span>
            <h2>{activeView === "mine" ? "Mis workspaces" : "Admin de storage"}</h2>
          </div>
          <div className="user-pill">{me.full_name}<small>{me.email}</small></div>
        </header>

        {activeView === "mine" && (
          <div className="grid">
            <Panel title="Storage asignado">
              {myWorkspaces.length === 0 && <p className="muted">Aun no tienes workspaces con storage aprobado.</p>}
              {myWorkspaces.map((workspace) => <WorkspaceCard workspace={workspace} key={workspace.id} />)}
            </Panel>
            <Panel title="Mis solicitudes">
              {myRequests.length === 0 && <p className="muted">Sin solicitudes.</p>}
              {myRequests.map((item) => <RequestCard request={item} key={item.id} />)}
            </Panel>
          </div>
        )}

        {activeView === "admin" && (
          <div className="grid">
            <Panel title="Solicitudes pendientes">
              {requests.length === 0 && <p className="muted">No hay solicitudes.</p>}
              {requests.map((item) => <AdminRequest request={item} onDone={refresh} key={item.id} />)}
            </Panel>
            <Panel title="Workspaces asignados">
              {workspaces.length === 0 && <p className="muted">No hay workspaces asignados.</p>}
              {workspaces.map((workspace) => <WorkspaceCard workspace={workspace} key={workspace.id} />)}
            </Panel>
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

function WorkspaceCard({ workspace }: { workspace: StorageWorkspace }) {
  const percent = workspace.quota_bytes ? Math.round((workspace.used_bytes / workspace.quota_bytes) * 100) : 0;
  return (
    <article className="item">
      <strong>{workspace.workspace_name}</strong>
      <span>{workspace.source_app} / {workspace.workspace_key}</span>
      <p>{formatBytes(workspace.used_bytes)} usados de {formatBytes(workspace.quota_bytes)}</p>
      <div className="bar"><i style={{ width: `${Math.min(100, percent)}%` }} /></div>
    </article>
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
