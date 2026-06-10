import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, CheckCircle2, Database, Download, FileText, Folder, FolderPlus, Grid2X2, HardDrive, Home, Info, List, LogOut, MoveRight, Plus, RefreshCw, Search, ShieldCheck, Trash2, Upload, UserPlus, Users, X, XCircle } from "lucide-react";
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
  owner_user_id?: string;
  workspace_key: string;
  workspace_name: string;
  owner_name: string;
  owner_email: string;
  quota_bytes: number;
  used_bytes: number;
  status: string;
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
  created_at?: string | null;
};

type UserListItem = {
  email: string;
  full_name: string;
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
  users: () => request<UserListItem[]>("/api/users"),
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
          <FileManager workspace={activeWorkspace} currentUser={me} onBack={() => setActiveWorkspace(null)} onChanged={refresh} />
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

function FileManager({ workspace, currentUser, onBack, onChanged }: { workspace: StorageWorkspace; currentUser: UserProfile; onBack: () => void; onChanged: () => void }) {
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [localWorkspace, setLocalWorkspace] = useState(workspace);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentFolder, setCurrentFolder] = useState("");
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

  useEffect(() => {
    setLocalWorkspace(workspace);
    setCurrentFolder("");
    setSearchText("");
    setSelectedEntry(null);
  }, [workspace.id]);

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
    if (!files?.length) return;
    await uploadDroppedFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadDroppedFiles(files: FileList | File[]) {
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
        </div>
      </section>

      <section className="panel file-toolbar">
        <div className="drive-command-row">
          <div className="new-menu-wrap">
            <button
              type="button"
              className="new-button"
              onClick={(event) => {
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
              <button type="button" onClick={() => beginMove(selectedEntry)}><MoveRight /> Mover</button>
              <button type="button" className="danger-soft" onClick={() => selectedEntry.type === "folder" ? handleDeleteFolder(selectedEntry) : handleDeleteFile(selectedEntry)}><Trash2 /> Eliminar</button>
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
              onDoubleClick={() => entry.type === "folder" && openFolder(entry.path)}
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
              <strong>{selectedEntry.name}</strong>
              <span>{selectedEntry.type === "folder" ? "Carpeta" : selectedEntry.content_type || "Archivo"}</span>
              <p>{selectedEntry.path}</p>
              {selectedEntry.type === "file" && <p>{formatBytes(selectedEntry.size_bytes)} · {selectedEntry.uploaded_by_name || "usuario"}</p>}
            </div>
          ) : (
            <p className="muted">Selecciona un archivo o carpeta para ver sus detalles.</p>
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
                <button className="ghost-button" onClick={() => addMember(memberSearch)} disabled={!memberSearch.trim() || busy}>Agregar</button>
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
