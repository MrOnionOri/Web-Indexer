import {
  AppWindow,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  KeyRound,
  Layers3,
  LogOut,
  Search,
  ShieldCheck,
  ShieldX,
  UserCog,
  UploadCloud,
  Users,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { api, Me, ProjectUpload, RegisteredApp, Template, User } from "./api";

type View = "dashboard" | "users" | "apps" | "projects" | "security" | "integration";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [apps, setApps] = useState<RegisteredApp[]>([]);
  const [projects, setProjects] = useState<ProjectUpload[]>([]);
  const [allPermissions, setAllPermissions] = useState<{ id: string; code: string; description: string }[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  const can = useMemo(() => new Set(me?.permissions ?? []), [me]);

  const checkMaintenance = (err: any) => {
    if (err && (err.code === "0XDEADFA11" || String(err).includes("0XDEADFA11"))) {
      setIsMaintenance(true);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("gatestack_token");
    if (token) {
      api.me()
        .then(setMe)
        .catch((err) => {
          checkMaintenance(err);
          localStorage.removeItem("gatestack_token");
        });
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    setLoadError("");
    
    if (can.has("users:view")) {
      api.users()
        .then(setUsers)
        .catch((err) => {
          checkMaintenance(err);
          setLoadError(String(err));
        });
    }
    if (can.has("templates:view")) {
      api.templates()
        .then(setTemplates)
        .catch((err) => {
          checkMaintenance(err);
          setLoadError(String(err));
        });
    }
    if (can.has("apps:view")) {
      api.apps()
        .then(setApps)
        .catch((err) => {
          checkMaintenance(err);
          setLoadError(String(err));
        });
    }
    if (can.has("projects:review")) {
      api.projects()
        .then(setProjects)
        .catch((err) => {
          checkMaintenance(err);
          setLoadError(String(err));
        });
    }
    if (can.has("users:permissions")) {
      api.permissions()
        .then(setAllPermissions)
        .catch((err) => {
          checkMaintenance(err);
          setLoadError(String(err));
        });
    }
  }, [me, can, refreshCount]);

  // Polling for building or pending review projects
  useEffect(() => {
    const hasBuilding = projects.some((p) => p.status === "building" || p.status === "approved");
    if (!hasBuilding || !me || !can.has("projects:review")) return;

    const interval = setInterval(() => {
      api.projects().then(setProjects).catch(() => {});
    }, 3000);

    return () => clearInterval(interval);
  }, [projects, me, can]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const fullName = String(form.get("fullName") ?? "");

    try {
      if (mode === "register") {
        await api.register(email, fullName, password);
        setError("Registro enviado. Un admin debe aprobar tu acceso.");
        setMode("login");
      } else {
        const token = await api.login(email, password);
        localStorage.setItem("gatestack_token", token.access_token);
        setMe(await api.me());
      }
    } catch (authError: any) {
      checkMaintenance(authError);
      setError(authError instanceof Error ? authError.message : "No se pudo autenticar");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("gatestack_token");
    setMe(null);
    setView("dashboard");
  }

  if (isMaintenance) {
    return (
      <main className="maintenance-shell">
        <div className="maintenance-card">
          <div className="maintenance-icon">
            <ShieldX size={64} />
          </div>
          <h1>SISTEMA EN MANTENIMIENTO</h1>
          <p>
            No se ha podido establecer la conexión con la base de datos principal MySQL.
            El acceso a la consola está temporalmente inhabilitado.
          </p>
          <div className="error-code-badge">
            CÓDIGO DE ERROR: <code>0XDEADFA11</code>
          </div>
          <button className="primary" onClick={() => window.location.reload()}>
            Reintentar Conexión
          </button>
        </div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="auth-shell">
        <section className="auth-intro">
          <div className="brand-mark">
            <ShieldCheck size={32} />
          </div>
          <h1>GateStack</h1>
          <p>Una consola limpia para controlar acceso, permisos y revisión segura de aplicaciones internas.</p>
          <div className="auth-grid">
            <Metric icon={<KeyRound />} label="Identity" value="Approval flow" />
            <Metric icon={<Layers3 />} label="Access matrix" value="Templates" />
            <Metric icon={<UploadCloud />} label="Deploy intake" value="Pre-review" />
          </div>
        </section>
        <form className="auth-panel" onSubmit={handleAuth}>
          <div className="tabs">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
              Entrar
            </button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
              Registro
            </button>
          </div>
          {mode === "register" && <input name="fullName" placeholder="Nombre completo" required minLength={2} />}
          <input name="email" placeholder="Email" type="email" required />
          <input name="password" placeholder="Password" type="password" required minLength={10} />
          <button className="primary" disabled={loading}>
            {loading ? "Procesando..." : mode === "login" ? "Iniciar sesión" : "Solicitar acceso"}
          </button>
          {error && <p className="form-note">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <ShieldCheck />
          <strong>GateStack</strong>
        </div>
        <NavButton icon={<Database />} active={view === "dashboard"} onClick={() => setView("dashboard")} label="Dashboard" />
        {can.has("users:view") && <NavButton icon={<Users />} active={view === "users"} onClick={() => setView("users")} label="Usuarios" />}
        {can.has("apps:view") && <NavButton icon={<AppWindow />} active={view === "apps"} onClick={() => setView("apps")} label="Apps" />}
        {can.has("projects:review") && (
          <NavButton icon={<UploadCloud />} active={view === "projects"} onClick={() => setView("projects")} label="Proyectos" />
        )}
        {can.has("templates:view") && (
          <NavButton icon={<ShieldCheck />} active={view === "security"} onClick={() => setView("security")} label="Seguridad" />
        )}
        <NavButton icon={<KeyRound />} active={view === "integration"} onClick={() => setView("integration")} label="Integración API" />
        
        <button className="nav logout" onClick={logout}>
          <LogOut />
          Salir
        </button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">Portal principal</span>
            <h2>{viewTitle(view)}</h2>
          </div>
          <div className="user-pill">
            <span>{me.full_name}</span>
            <small>{me.is_platform_admin ? "Platform admin" : "Usuario aprobado"}</small>
          </div>
        </header>

        {view === "dashboard" && <Dashboard users={users} apps={apps} projects={projects} permissions={me.permissions} />}
        {loadError && <p className="load-error">{loadError}</p>}
        {view === "users" && (
          <UsersView
            users={users}
            me={me}
            templates={templates}
            allPermissions={allPermissions}
            refresh={() => setRefreshCount((c) => c + 1)}
          />
        )}
        {view === "apps" && <AppsView apps={apps} />}
        {view === "projects" && <ProjectsView projects={projects} permissions={me.permissions} refresh={() => setRefreshCount((c) => c + 1)} />}
        {view === "security" && <SecurityView templates={templates} permissions={me.permissions} />}
        {view === "integration" && <IntegrationView />}
      </section>
    </main>
  );
}

function Dashboard({
  users,
  apps,
  projects,
  permissions,
}: {
  users: User[];
  apps: RegisteredApp[];
  projects: ProjectUpload[];
  permissions: string[];
}) {
  const pendingUsers = users.filter((user) => user.status === "pending").length;
  const pendingProjects = projects.filter((project) => project.status === "pending_review").length;
  return (
    <div className="dashboard">
      <Metric icon={<Users />} label="Usuarios pendientes" value={String(pendingUsers)} />
      <Metric icon={<AppWindow />} label="Apps registradas" value={String(apps.length)} />
      <Metric icon={<Clock3 />} label="Proyectos en revisión" value={String(pendingProjects)} />
      <Metric icon={<ShieldCheck />} label="Permisos activos" value={String(permissions.length)} />
    </div>
  );
}

function UsersView({
  users,
  me,
  templates,
  allPermissions,
  refresh,
}: {
  users: User[];
  me: Me;
  templates: Template[];
  allPermissions: { id: string; code: string; description: string }[];
  refresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [templateSelection, setTemplateSelection] = useState<Record<string, string>>({});
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // View modes: "permissions" or "crud"
  const [viewMode, setViewMode] = useState<"permissions" | "crud">("permissions");

  // CRUD Direct Add States
  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addTemplateId, setAddTemplateId] = useState("");
  const [addStatus, setAddStatus] = useState<User["status"]>("approved");

  // CRUD Editing Profile States
  const [editingProfileUserId, setEditingProfileUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // Banning/Sanctioning states
  const [sanctioningUser, setSanctioningUser] = useState<User | null>(null);
  const [sanctionStatus, setSanctionStatus] = useState<User["status"]>("suspended");
  const [sanctionReason, setSanctionReason] = useState("");

  const filteredUsers = users.filter((user) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return `${user.full_name} ${user.email} ${user.status}`.toLowerCase().includes(normalizedQuery);
  });

  async function updateAccess(user: User, status: User["status"]) {
    const selectedTemplate = templateSelection[user.id];
    const templateIds = selectedTemplate ? [selectedTemplate] : user.template_ids;
    await api.updateUserAccess(user.id, status, templateIds);
    refresh();
  }

  async function applyTemplate(user: User) {
    const selectedTemplate = templateSelection[user.id];
    await api.updateUserAccess(user.id, user.status, selectedTemplate ? [selectedTemplate] : []);
    refresh();
  }

  // Handle CRUD manual creation
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const templateIds = addTemplateId ? [addTemplateId] : [];
      await api.createUser(addEmail, addName, addPassword, templateIds, addStatus);
      setShowAddForm(false);
      setAddEmail("");
      setAddName("");
      setAddPassword("");
      setAddTemplateId("");
      refresh();
    } catch (err: any) {
      alert(err.message ?? "Error al crear usuario");
    }
  };

  // Handle profile update
  const handleUpdateProfile = async (userId: string) => {
    try {
      await api.updateUser(userId, editName, editEmail);
      setEditingProfileUserId(null);
      refresh();
    } catch (err: any) {
      alert(err.message ?? "Error al actualizar perfil");
    }
  };

  // Handle delete user
  const handleDeleteUser = async (userId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este usuario permanentemente?")) return;
    try {
      await api.deleteUser(userId);
      refresh();
    } catch (err: any) {
      alert(err.message ?? "Error al eliminar usuario");
    }
  };

  // Handle sanction submit (ban/suspend/reject with reason)
  const handleSanctionSubmit = async () => {
    if (!sanctioningUser) return;
    try {
      await api.updateUserAccess(sanctioningUser.id, sanctionStatus, sanctioningUser.template_ids, sanctionReason);
      setSanctioningUser(null);
      setSanctionReason("");
      refresh();
    } catch (err: any) {
      alert(err.message ?? "Error al sancionar usuario");
    }
  };

  // Quick Alta / Approve (removes reason)
  const handleActivateUser = async (user: User) => {
    try {
      await api.updateUserAccess(user.id, "approved", user.template_ids, null);
      refresh();
    } catch (err: any) {
      alert(err.message ?? "Error al activar usuario");
    }
  };

  return (
    <div className="users-layout">
      <section className="admin-summary">
        <Metric icon={<Users />} label="Total usuarios" value={String(users.length)} />
        <Metric icon={<Clock3 />} label="Pendientes" value={String(users.filter((user) => user.status === "pending").length)} />
        <Metric icon={<ShieldCheck />} label="Aprobados" value={String(users.filter((user) => user.status === "approved").length)} />
      </section>

      <div className="table-surface">
        <div className="toolbar split-toolbar user-toolbar-controls">
          <label className="search-box">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuario, email o estado" />
          </label>
          
          <div className="view-mode-selector">
            <label>Vista de control:</label>
            <select value={viewMode} onChange={(e) => setViewMode(e.target.value as "permissions" | "crud")}>
              <option value="permissions">Gestión de Permisos y Templates</option>
              <option value="crud">Administración y CRUD de Cuentas</option>
            </select>
          </div>

          {viewMode === "crud" && (
            <button className="primary compact add-user-btn" onClick={() => setShowAddForm(true)}>
              Agregar Usuario
            </button>
          )}
        </div>

        {filteredUsers.length === 0 && <EmptyState text="No hay usuarios que coincidan con la búsqueda." />}

        {/* View Mode 1: Permissions Management */}
        {viewMode === "permissions" && filteredUsers.map((user) => {
          const selectedTemplate = templateSelection[user.id] ?? user.template_ids[0] ?? "";
          
          const inheritedPermissions = new Set<string>();
          user.template_ids.forEach((tId) => {
            const template = templates.find((t) => t.id === tId);
            if (template) {
              template.permissions.forEach((p) => inheritedPermissions.add(p));
            }
          });

          return (
            <div key={user.id} className="user-block">
              <article className="user-row">
                <div className="user-main">
                  <div className="avatar">{initials(user.full_name)}</div>
                  <div>
                    <div className="user-title">
                      <strong>{user.full_name}</strong>
                      {user.id === me.id && <span className="self-badge">Tu cuenta</span>}
                      {user.is_platform_admin && <span className="admin-badge">Platform admin</span>}
                    </div>
                    <span>{user.email}</span>
                    <div className="chips compact">
                      {(user.template_names.length ? user.template_names : ["Sin template"]).map((templateName) => (
                        <code key={templateName}>{templateName}</code>
                      ))}
                    </div>
                  </div>
                </div>

                <StatusBadge value={user.status} />

                <div className="user-controls">
                  <select
                    value={selectedTemplate}
                    onChange={(event) =>
                      setTemplateSelection((current) => ({
                        ...current,
                        [user.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Sin template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <button className="secondary-action" onClick={() => applyTemplate(user)}>
                    <UserCog />
                    Aplicar
                  </button>
                </div>

                <div className="row-actions">
                  <button className="icon-action" onClick={() => updateAccess(user, "approved")} title="Aprobar usuario">
                    <CheckCircle2 />
                  </button>
                  <button className="icon-action neutral" onClick={() => updateAccess(user, "suspended")} title="Suspender usuario">
                    <ShieldX />
                  </button>
                  <button className="icon-action danger" onClick={() => updateAccess(user, "rejected")} title="Rechazar usuario">
                    <Eye />
                  </button>
                </div>

                <div className="permission-preview">
                  <div className="chips">
                    {user.permissions.slice(0, 8).map((permission) => (
                      <code key={permission}>{permission}</code>
                    ))}
                    {user.permissions.length > 8 && <code>+{user.permissions.length - 8} más</code>}
                  </div>
                  <button 
                    className="secondary-action compact customize-perms-btn" 
                    onClick={() => setEditingUserId(editingUserId === user.id ? null : user.id)}
                  >
                    Personalizar Permisos
                  </button>
                </div>
              </article>

              {editingUserId === user.id && (
                <div className="override-panel">
                  <h4>Personalizar Permisos de Seguridad</h4>
                  <p className="override-desc">Define reglas exclusivas que sobrescriban las asignaciones de las plantillas.</p>
                  
                  <div className="override-list">
                    {allPermissions.map((perm) => {
                      const isDefaultGranted = inheritedPermissions.has(perm.code);
                      const override = user.overrides?.find((o) => o.permission_id === perm.id);
                      const currentEffect = override ? override.effect : "default";

                      const handleOverride = async (effect: "allow" | "deny" | "default") => {
                        try {
                          if (effect === "default") {
                            await api.deletePermissionOverride(user.id, perm.id);
                          } else {
                            await api.setPermissionOverride(user.id, perm.id, effect);
                          }
                          refresh();
                        } catch (err: any) {
                          alert(err.message ?? "Error guardando override");
                        }
                      };

                      return (
                        <div className="override-item" key={perm.id}>
                          <div className="override-info">
                            <strong>{perm.code}</strong>
                            <span>{perm.description}</span>
                            <small>Estado plantilla: {isDefaultGranted ? "Permitido (Heredado)" : "Denegado (Heredado)"}</small>
                          </div>
                          <div className="override-choices">
                            <label className={`choice-label ${currentEffect === "default" ? "active" : ""}`}>
                              <input
                                type="radio"
                                name={`override-${user.id}-${perm.id}`}
                                checked={currentEffect === "default"}
                                onChange={() => handleOverride("default")}
                              />
                              Heredar
                            </label>
                            <label className={`choice-label allow ${currentEffect === "allow" ? "active" : ""}`}>
                              <input
                                type="radio"
                                name={`override-${user.id}-${perm.id}`}
                                checked={currentEffect === "allow"}
                                onChange={() => handleOverride("allow")}
                              />
                              Permitir
                            </label>
                            <label className={`choice-label deny ${currentEffect === "deny" ? "active" : ""}`}>
                              <input
                                type="radio"
                                name={`override-${user.id}-${perm.id}`}
                                checked={currentEffect === "deny"}
                                onChange={() => handleOverride("deny")}
                              />
                              Denegar
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* View Mode 2: CRUD Account Administration */}
        {viewMode === "crud" && filteredUsers.map((user) => {
          const isEditingProfile = editingProfileUserId === user.id;

          return (
            <div key={user.id} className="user-block crud-block">
              <article className="user-row crud-row">
                <div className="user-main">
                  <div className="avatar">{initials(user.full_name)}</div>
                  {isEditingProfile ? (
                    <div className="edit-profile-fields">
                      <input 
                        value={editName} 
                        onChange={(e) => setEditName(e.target.value)} 
                        placeholder="Nombre completo" 
                        required 
                      />
                      <input 
                        value={editEmail} 
                        onChange={(e) => setEditEmail(e.target.value)} 
                        placeholder="Email" 
                        type="email" 
                        required 
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="user-title">
                        <strong>{user.full_name}</strong>
                        {user.id === me.id && <span className="self-badge">Tu cuenta</span>}
                        {user.is_platform_admin && <span className="admin-badge">Platform admin</span>}
                      </div>
                      <span>{user.email}</span>
                      {user.status_reason && (
                        <p className="status-reason-tag">
                          <strong>Motivo:</strong> {user.status_reason}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <StatusBadge value={user.status} />

                {/* Edit / Action controls */}
                <div className="crud-control-group">
                  {isEditingProfile ? (
                    <>
                      <button className="primary compact" onClick={() => handleUpdateProfile(user.id)}>
                        Guardar
                      </button>
                      <button className="secondary-action compact" onClick={() => setEditingProfileUserId(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        className="secondary-action compact" 
                        onClick={() => {
                          setEditingProfileUserId(user.id);
                          setEditName(user.full_name);
                          setEditEmail(user.email);
                        }}
                      >
                        Editar
                      </button>
                      
                      {/* Baja/Alta toggles */}
                      {user.status === "approved" ? (
                        <>
                          <button 
                            className="secondary-action compact" 
                            onClick={() => updateAccess(user, "rejected")}
                          >
                            Dar de Baja
                          </button>
                          <button 
                            className="primary danger compact" 
                            onClick={() => {
                              setSanctioningUser(user);
                              setSanctionStatus("suspended");
                              setSanctionReason("");
                            }}
                          >
                            Banear
                          </button>
                        </>
                      ) : (
                        <button className="primary success compact" onClick={() => handleActivateUser(user)}>
                          Dar de Alta
                        </button>
                      )}

                      <button 
                        className="icon-action danger" 
                        onClick={() => handleDeleteUser(user.id)}
                        title="Eliminar usuario permanentemente"
                        disabled={user.id === me.id}
                      >
                        <ShieldX size={16} />
                      </button>
                    </>
                  )}
                </div>
              </article>
            </div>
          );
        })}
      </div>

      {/* Direct Add User Modal Form */}
      {showAddForm && (
        <div className="modal-backdrop">
          <form className="modal-box crud-form-layout" onSubmit={handleCreateUser}>
            <h3>Agregar Nuevo Usuario</h3>
            <p>Registra una cuenta de acceso directamente sin pasar por aprobación.</p>
            
            <div className="modal-field">
              <label>Nombre Completo:</label>
              <input 
                value={addName} 
                onChange={(e) => setAddName(e.target.value)} 
                placeholder="Ej: John Doe" 
                required 
                minLength={2}
              />
            </div>

            <div className="modal-field">
              <label>Email de Acceso:</label>
              <input 
                value={addEmail} 
                onChange={(e) => setAddEmail(e.target.value)} 
                placeholder="email@gatestack.dev" 
                type="email" 
                required 
              />
            </div>

            <div className="modal-field">
              <label>Contraseña Inicial:</label>
              <input 
                value={addPassword} 
                onChange={(e) => setAddPassword(e.target.value)} 
                placeholder="Mínimo 10 caracteres" 
                type="password" 
                required 
                minLength={10}
              />
            </div>

            <div className="modal-field">
              <label>Template Inicial:</label>
              <select value={addTemplateId} onChange={(e) => setAddTemplateId(e.target.value)}>
                <option value="">Sin template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="modal-field">
              <label>Estado de Cuenta:</label>
              <select value={addStatus} onChange={(e) => setAddStatus(e.target.value as User["status"])}>
                <option value="approved">Aprobado / Activo (approved)</option>
                <option value="pending">Pendiente de Aprobación (pending)</option>
                <option value="suspended">Suspendido / Baneado (suspended)</option>
              </select>
            </div>

            <div className="modal-buttons">
              <button className="primary" type="submit">Crear Cuenta</button>
              <button className="secondary-action" type="button" onClick={() => setShowAddForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Custom Ban/Suspension Reason Modal */}
      {sanctioningUser && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h3>Suspender / Banear Usuario</h3>
            <p>Indica la justificación para sancionar la cuenta de <strong>{sanctioningUser.full_name}</strong>.</p>
            
            <div className="modal-field">
              <label>Estado administrativo:</label>
              <select value={sanctionStatus} onChange={(e) => setSanctionStatus(e.target.value as User["status"])}>
                <option value="suspended">Suspender Acceso (suspended)</option>
                <option value="rejected">Rechazar Acceso (rejected)</option>
              </select>
            </div>

            <div className="modal-field">
              <label>Escribe el motivo del baneo:</label>
              <textarea
                value={sanctionReason}
                onChange={(e) => setSanctionReason(e.target.value)}
                placeholder="Ej: Uso indebido de credenciales del API..."
                rows={3}
                required
              />
            </div>

            <div className="modal-buttons">
              <button 
                className="primary danger" 
                onClick={handleSanctionSubmit} 
                disabled={!sanctionReason.trim()}
              >
                Suspender y Banear
              </button>
              <button className="secondary-action" onClick={() => setSanctioningUser(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AppsView({ apps }: { apps: RegisteredApp[] }) {
  return (
    <div className="cards-grid">
      {apps.length === 0 && <EmptyState text="Todavía no hay aplicaciones registradas." />}
      {apps.map((app) => (
        <article className="item-card" key={app.id}>
          <AppWindow />
          <h3>{app.name}</h3>
          <p>{app.description || "Sin descripción"}</p>
          <code>{app.slug}</code>
        </article>
      ))}
    </div>
  );
}

function ProjectsView({
  projects,
  permissions,
  refresh,
}: {
  projects: ProjectUpload[];
  permissions: string[];
  refresh: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [reviewingProject, setReviewingProject] = useState<ProjectUpload | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const canReview = permissions.includes("projects:review");
  const canUpload = permissions.includes("projects:upload");

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      await api.uploadProject(file);
      refresh();
    } catch (err: any) {
      setUploadError(err.message ?? "Falló la subida del proyecto");
    } finally {
      setUploading(false);
    }
  };

  const handleReviewSubmit = async (status: "approved" | "review_failed") => {
    if (!reviewingProject) return;
    try {
      await api.reviewProject(reviewingProject.id, status, reviewNotes);
      setReviewingProject(null);
      setReviewNotes("");
      refresh();
    } catch (err: any) {
      alert(err.message ?? "Falló al guardar revisión");
    }
  };

  return (
    <div className="projects-layout">
      {canUpload && (
        <section className="table-surface upload-box">
          <h3>Subir código fuente (.zip)</h3>
          <p className="toolbar-note">Sube el código empaquetado para auditoría antes de levantarlo en producción.</p>
          <div className="dropzone-area">
            <UploadCloud size={36} />
            <span className="dropzone-text">{uploading ? "Subiendo archivo..." : "Haz clic para buscar tu archivo .zip"}</span>
            <input type="file" accept=".zip" onChange={handleFileChange} disabled={uploading} className="hidden-file-input" />
          </div>
          {uploadError && <p className="load-error">{uploadError}</p>}
        </section>
      )}

      <div className="table-surface">
        <h3>Historial de despliegues</h3>
        {projects.length === 0 && <EmptyState text="No hay proyectos registrados para revisión." />}
        {projects.map((project) => (
          <div className="row project-row-layout" key={project.id}>
            <div className="project-desc">
              <strong>{project.original_filename}</strong>
              <div className="project-meta-chips">
                <span className="stack-badge">{project.detected_stack ?? "Stack Desconocido"}</span>
                <small>{new Date(project.created_at).toLocaleString()}</small>
              </div>
              {project.review_notes && (
                <div className="review-notes-box">
                  <strong>Notas del auditor:</strong>
                  <pre>{project.review_notes}</pre>
                </div>
              )}
            </div>

            <div className="project-status-col">
              <StatusBadge value={project.status} />
              {project.status === "building" && <span className="status-pulse-dot"></span>}
              {project.status === "running" && <span className="status-active-dot"></span>}
            </div>

            <div className="project-action-col">
              {canReview && project.status === "pending_review" && (
                <button
                  className="secondary-action compact"
                  onClick={() => {
                    setReviewingProject(project);
                    setReviewNotes(project.review_notes ?? "");
                  }}
                >
                  Auditar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {reviewingProject && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h3>Auditoría del Proyecto</h3>
            <p>Verifica que el código no contenga exploits ni scripts inseguros.</p>
            
            <div className="modal-field">
              <strong>Stack Detectado:</strong> <code>{reviewingProject.detected_stack}</code>
            </div>

            <div className="modal-field">
              <label>Notas de revisión:</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Indica el resultado de tu revisión aquí..."
                rows={4}
              />
            </div>

            <div className="modal-buttons">
              <button className="primary success" onClick={() => handleReviewSubmit("approved")}>
                Aprobar y Desplegar
              </button>
              <button className="primary danger" onClick={() => handleReviewSubmit("review_failed")}>
                Rechazar
              </button>
              <button className="secondary-action" onClick={() => setReviewingProject(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityView({ templates, permissions }: { templates: Template[]; permissions: string[] }) {
  return (
    <div className="security-layout">
      <section className="table-surface">
        <h3>Templates</h3>
        {templates.map((template) => (
          <article className="template-block" key={template.id}>
            <strong>{template.name}</strong>
            <p>{template.description}</p>
            <div className="chips">
              {template.permissions.map((permission) => (
                <code key={permission}>{permission}</code>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="table-surface">
        <h3>Mis permisos efectivos</h3>
        <div className="chips">
          {permissions.map((permission) => (
            <code key={permission}>{permission}</code>
          ))}
        </div>
      </section>
    </div>
  );
}

function IntegrationView() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const pythonCode = `from fastapi import Depends, HTTPException, status
from jose import jwt, JWTError

SECRET_KEY = "change-this-secret-key"
ALGORITHM = "HS256"

def get_current_user_permissions(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # El payload contiene los permisos del usuario de GateStack
        permissions = payload.get("permissions", [])
        return permissions
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de GateStack inválido o expirado"
        )

def require_permission(perm: str):
    def dependency(permissions: list = Depends(get_current_user_permissions)):
        if perm not in permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Falta el permiso requerido: {perm}"
            )
        return True
    return dependency
`;

  const reactCode = `import { useState, useEffect } from 'react';

export function useGateStackAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('gatestack_token');
    if (!token) {
      setLoading(false);
      return;
    }

    fetch('http://localhost:8000/auth/me', {
      headers: { 'Authorization': \`Bearer \${token}\` }
    })
    .then(res => res.json())
    .then(data => {
      setUser(data);
      setLoading(false);
    })
    .catch(() => {
      localStorage.removeItem('gatestack_token');
      setLoading(false);
    });
  }, []);

  const hasPermission = (code) => {
    return user?.permissions?.includes(code) || false;
  };

  return { user, loading, hasPermission };
}
`;

  return (
    <div className="integration-view">
      <div className="table-surface header-box">
        <h3>Integración con la Matriz de Seguridad</h3>
        <p className="section-desc">
          GateStack funciona emitiendo tokens JWT firmados que contienen la lista de permisos efectivos del usuario.
          Puedes validar estos tokens en tus microservicios y aplicaciones cliente usando las siguientes directrices.
        </p>

        <div className="client-secrets-panel">
          <h4>Credenciales del API</h4>
          <div className="secret-row">
            <span>Clave Secreta JWT:</span>
            <code>change-this-secret-key</code>
          </div>
          <div className="secret-row">
            <span>Algoritmo de Firma:</span>
            <code>HS256</code>
          </div>
          <div className="secret-row">
            <span>Endpoint de Validación:</span>
            <code>http://localhost:8000/auth/me</code>
          </div>
        </div>
      </div>

      <div className="code-snippets-grid">
        <div className="table-surface code-card">
          <div className="code-header">
            <h4>FastAPI Backend (Middleware / Dependencia)</h4>
            <button className="secondary-action compact" onClick={() => copyToClipboard(pythonCode, "python")}>
              {copied === "python" ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          <pre><code>{pythonCode}</code></pre>
        </div>

        <div className="table-surface code-card">
          <div className="code-header">
            <h4>React Frontend (Hook useGateStackAuth)</h4>
            <button className="secondary-action compact" onClick={() => copyToClipboard(reactCode, "react")}>
              {copied === "react" ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          <pre><code>{reactCode}</code></pre>
        </div>
      </div>
    </div>
  );
}

function NavButton({ icon, active, label, onClick }: { icon: ReactNode; active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`nav ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{value.replace("_", " ")}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function viewTitle(view: View) {
  const titles: Record<View, string> = {
    dashboard: "Dashboard",
    users: "Gestión de usuarios",
    apps: "Aplicaciones",
    projects: "Revisión de proyectos",
    security: "Permisos y templates",
    integration: "Integración API",
  };
  return titles[view];
}
