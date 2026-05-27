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

type View = "dashboard" | "users" | "apps" | "projects" | "security";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [apps, setApps] = useState<RegisteredApp[]>([]);
  const [projects, setProjects] = useState<ProjectUpload[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);

  const can = useMemo(() => new Set(me?.permissions ?? []), [me]);

  useEffect(() => {
    const token = localStorage.getItem("gatestack_token");
    if (token) {
      api.me().then(setMe).catch(() => localStorage.removeItem("gatestack_token"));
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    setLoadError("");
    if (can.has("users:view")) api.users().then(setUsers).catch((issue) => setLoadError(String(issue)));
    if (can.has("templates:view")) api.templates().then(setTemplates).catch((issue) => setLoadError(String(issue)));
    if (can.has("apps:view")) api.apps().then(setApps).catch((issue) => setLoadError(String(issue)));
    if (can.has("projects:review")) api.projects().then(setProjects).catch((issue) => setLoadError(String(issue)));
  }, [me, can]);

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
    } catch (authError) {
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

  if (!me) {
    return (
      <main className="auth-shell">
        <section className="auth-intro">
          <div className="brand-mark">
            <ShieldCheck size={32} />
          </div>
          <h1>GateStack</h1>
          <p>Una consola limpia para controlar acceso, permisos y revision segura de aplicaciones internas.</p>
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
            {loading ? "Procesando..." : mode === "login" ? "Iniciar sesion" : "Solicitar acceso"}
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
        {view === "users" && <UsersView users={users} me={me} templates={templates} refresh={() => api.users().then(setUsers)} />}
        {view === "apps" && <AppsView apps={apps} />}
        {view === "projects" && <ProjectsView projects={projects} />}
        {view === "security" && <SecurityView templates={templates} permissions={me.permissions} />}
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
      <Metric icon={<Clock3 />} label="Proyectos en revision" value={String(pendingProjects)} />
      <Metric icon={<ShieldCheck />} label="Permisos activos" value={String(permissions.length)} />
    </div>
  );
}

function UsersView({ users, me, templates, refresh }: { users: User[]; me: Me; templates: Template[]; refresh: () => void }) {
  const [query, setQuery] = useState("");
  const [templateSelection, setTemplateSelection] = useState<Record<string, string>>({});

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

  return (
    <div className="users-layout">
      <section className="admin-summary">
        <Metric icon={<Users />} label="Total usuarios" value={String(users.length)} />
        <Metric icon={<Clock3 />} label="Pendientes" value={String(users.filter((user) => user.status === "pending").length)} />
        <Metric icon={<ShieldCheck />} label="Aprobados" value={String(users.filter((user) => user.status === "approved").length)} />
      </section>

      <div className="table-surface">
        <div className="toolbar split-toolbar">
          <label className="search-box">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuario, email o estado" />
          </label>
          <span className="toolbar-note">Tambien puedes gestionar tu propia cuenta desde aqui.</span>
        </div>
        {filteredUsers.length === 0 && <EmptyState text="No hay usuarios que coincidan con la busqueda." />}
        {filteredUsers.map((user) => {
          const selectedTemplate = templateSelection[user.id] ?? user.template_ids[0] ?? "";
          return (
            <article className="user-row" key={user.id}>
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
                {user.permissions.slice(0, 8).map((permission) => (
                  <code key={permission}>{permission}</code>
                ))}
                {user.permissions.length > 8 && <code>+{user.permissions.length - 8} mas</code>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function AppsView({ apps }: { apps: RegisteredApp[] }) {
  return (
    <div className="cards-grid">
      {apps.length === 0 && <EmptyState text="Todavia no hay aplicaciones registradas." />}
      {apps.map((app) => (
        <article className="item-card" key={app.id}>
          <AppWindow />
          <h3>{app.name}</h3>
          <p>{app.description || "Sin descripcion"}</p>
          <code>{app.slug}</code>
        </article>
      ))}
    </div>
  );
}

function ProjectsView({ projects }: { projects: ProjectUpload[] }) {
  return (
    <div className="table-surface">
      {projects.length === 0 && <EmptyState text="No hay proyectos subidos para revision." />}
      {projects.map((project) => (
        <div className="row" key={project.id}>
          <div>
            <strong>{project.original_filename}</strong>
            <span>{project.detected_stack ?? "Stack desconocido"}</span>
          </div>
          <StatusBadge value={project.status} />
        </div>
      ))}
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
    users: "Gestion de usuarios",
    apps: "Aplicaciones",
    projects: "Revision de proyectos",
    security: "Permisos y templates",
  };
  return titles[view];
}
