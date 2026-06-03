import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, CheckCircle2, Database, Download, FileText, HardDrive, LogOut, ShieldCheck, Trash2, Upload, XCircle } from "lucide-react";
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

type StorageFile = {
  id: string;
  workspace_id: string;
  original_filename: string;
  content_type: string | null;
  size_bytes: number;
  uploaded_by_user_id: string;
  uploaded_by_name: string;
  created_at: string;
};

const API_BASE_URL = import.meta.env.VITE_GATESTORAGE_BACKEND_URL ?? "http://192.168.1.150:8002";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("gatestorage_token");
  const headers = new Headers(options.headers);

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
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

  if (response.status === 204) {
    return undefined as T;
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
  files: (workspaceId: string) => request<StorageFile[]>(`/api/workspaces/${workspaceId}/files`),
  uploadFile: (workspaceId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<StorageFile>(`/api/workspaces/${workspaceId}/files`, { method: "POST", body });
  },
  deleteFile: (fileId: string) => request<void>(`/api/files/${fileId}`, { method: "DELETE" }),
  downloadFile: async (file: StorageFile) => {
    const token = localStorage.getItem("gatestorage_token");
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_BASE_URL}/api/files/${file.id}/download`, { headers, cache: "no-store" });
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
  const [activeWorkspace, setActiveWorkspace] = useState<StorageWorkspace | null>(null);
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
        <button className={activeView === "mine" ? "active" : ""} onClick={() => { setActiveWorkspace(null); setActiveView("mine"); }}><Database /> Mis workspaces</button>
        {canAdmin && <button className={activeView === "admin" ? "active" : ""} onClick={() => { setActiveWorkspace(null); setActiveView("admin"); }}><ShieldCheck /> Admin</button>}
        <button className="logout" onClick={logout}><LogOut /> Salir</button>
      </aside>
      <section className="content">
        <header>
          <div>
            <span>GateStorage</span>
            <h2>{activeWorkspace ? activeWorkspace.workspace_name : activeView === "mine" ? "Mis workspaces" : "Admin de storage"}</h2>
          </div>
          <div className="user-pill">{me.full_name}<small>{me.email}</small></div>
        </header>

        {activeWorkspace ? (
          <FileManager workspace={activeWorkspace} onBack={() => setActiveWorkspace(null)} onChanged={refresh} />
        ) : activeView === "mine" && (
          <div className="grid">
            <Panel title="Storage asignado">
              {myWorkspaces.length === 0 && <p className="muted">Aun no tienes workspaces con storage aprobado.</p>}
              {myWorkspaces.map((workspace) => <WorkspaceCard workspace={workspace} onOpen={setActiveWorkspace} key={workspace.id} />)}
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
              {workspaces.map((workspace) => <WorkspaceCard workspace={workspace} onOpen={setActiveWorkspace} key={workspace.id} />)}
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

function WorkspaceCard({ workspace, onOpen }: { workspace: StorageWorkspace; onOpen?: (workspace: StorageWorkspace) => void }) {
  const percent = workspace.quota_bytes ? Math.round((workspace.used_bytes / workspace.quota_bytes) * 100) : 0;
  return (
    <button className="item workspace-card" type="button" onClick={() => onOpen?.(workspace)}>
      <strong>{workspace.workspace_name}</strong>
      <span>{workspace.source_app} / {workspace.workspace_key}</span>
      <p>{formatBytes(workspace.used_bytes)} usados de {formatBytes(workspace.quota_bytes)}</p>
      <div className="bar"><i style={{ width: `${Math.min(100, percent)}%` }} /></div>
      <small>Abrir gestor de archivos</small>
    </button>
  );
}

function FileManager({ workspace, onBack, onChanged }: { workspace: StorageWorkspace; onBack: () => void; onChanged: () => void }) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [localWorkspace, setLocalWorkspace] = useState(workspace);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const usedPercent = localWorkspace.quota_bytes ? Math.round((localWorkspace.used_bytes / localWorkspace.quota_bytes) * 100) : 0;

  useEffect(() => {
    setLocalWorkspace(workspace);
    refreshFiles();
  }, [workspace.id]);

  async function refreshFiles() {
    const nextFiles = await api.files(workspace.id).catch(() => []);
    setFiles(Array.isArray(nextFiles) ? nextFiles : []);
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) return;
    setBusy(true);
    setNotice("");
    try {
      const uploadedFile = await api.uploadFile(workspace.id, selectedFile);
      setFiles((currentFiles) => [uploadedFile, ...(Array.isArray(currentFiles) ? currentFiles : [])]);
      setLocalWorkspace((current) => ({ ...current, used_bytes: current.used_bytes + uploadedFile.size_bytes }));
      setSelectedFile(null);
      onChanged();
      setNotice("Archivo subido correctamente.");
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(file: StorageFile) {
    if (!window.confirm(`Eliminar ${file.original_filename}?`)) return;
    setBusy(true);
    setNotice("");
    try {
      await api.deleteFile(file.id);
      setFiles((currentFiles) => (Array.isArray(currentFiles) ? currentFiles.filter((item) => item.id !== file.id) : []));
      setLocalWorkspace((current) => ({ ...current, used_bytes: Math.max(0, current.used_bytes - file.size_bytes) }));
      onChanged();
      setNotice("Archivo eliminado.");
    } catch (err: any) {
      setNotice(err.message ?? "No se pudo eliminar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  const visibleFiles = Array.isArray(files) ? files : [];

  return (
    <div className="file-manager">
      <button className="back-button" onClick={onBack}><ArrowLeft /> Volver</button>
      <section className="panel workspace-hero">
        <div>
          <span>{localWorkspace.source_app} / {localWorkspace.workspace_key}</span>
          <h3>{localWorkspace.workspace_name}</h3>
          <p>{formatBytes(localWorkspace.used_bytes)} usados de {formatBytes(localWorkspace.quota_bytes)} disponibles</p>
        </div>
        <div className="quota-widget">
          <strong>{Math.min(100, usedPercent)}%</strong>
          <div className="bar"><i style={{ width: `${Math.min(100, usedPercent)}%` }} /></div>
        </div>
      </section>

      <section className="panel">
        <h3>Subir archivo</h3>
        <form className="upload-row" onSubmit={handleUpload}>
          <input type="file" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
          <button disabled={!selectedFile || busy}><Upload /> Subir</button>
        </form>
        {notice && <p className="muted">{notice}</p>}
      </section>

      <section className="panel">
        <h3>Archivos</h3>
        {visibleFiles.length === 0 && <p className="muted">Todavia no hay archivos en este workspace.</p>}
        <div className="file-list">
          {visibleFiles.map((file) => (
            <article className="file-row" key={file.id}>
              <FileText />
              <div>
                <strong>{file.original_filename}</strong>
                <span>{formatBytes(file.size_bytes)} - subido por {file.uploaded_by_name}</span>
              </div>
              <button onClick={() => api.downloadFile(file).catch((err) => setNotice(err.message ?? "No se pudo descargar el archivo."))} title="Descargar"><Download /></button>
              <button className="danger-icon" onClick={() => handleDelete(file)} disabled={busy} title="Eliminar"><Trash2 /></button>
            </article>
          ))}
        </div>
      </section>
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
