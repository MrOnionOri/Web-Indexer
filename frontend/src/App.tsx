import {
  AppWindow,
  Database,
  KeyRound,
  Layers3,
  LogOut,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  UploadCloud,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, Me, PortalHomeSettings, ProjectUpload, RegisteredApp, Template, User, UserBadge } from "./api";
import { Metric, NavButton } from "./components/ui";
import { AppsView } from "./views/AppsView";
import { DashboardView } from "./views/DashboardView";
import { FeedbackView } from "./views/FeedbackView";
import { HomeAdminView } from "./views/HomeAdminView";
import { IntegrationView } from "./views/IntegrationView";
import { PasswordResetView } from "./views/PasswordResetView";
import { ProjectsView } from "./views/ProjectsView";
import { SecurityView } from "./views/SecurityView";
import { UserViewMode, UsersView } from "./views/UsersView";

type View = "dashboard" | "apps" | "users" | "admin-apps" | "admin-home" | "feedback" | "projects" | "security" | "integration";

function routeState(pathname: string): { view: View; userViewMode: UserViewMode } {
  if (pathname.startsWith("/admin/users/accounts")) return { view: "users", userViewMode: "crud" };
  if (pathname.startsWith("/admin/users")) return { view: "users", userViewMode: "permissions" };
  if (pathname.startsWith("/admin/apps")) return { view: "admin-apps", userViewMode: "permissions" };
  if (pathname.startsWith("/admin/home")) return { view: "admin-home", userViewMode: "permissions" };
  if (pathname.startsWith("/admin/feedback")) return { view: "feedback", userViewMode: "permissions" };
  if (pathname.startsWith("/admin/projects")) return { view: "projects", userViewMode: "permissions" };
  if (pathname.startsWith("/admin/security")) return { view: "security", userViewMode: "permissions" };
  if (pathname.startsWith("/admin/integration")) return { view: "integration", userViewMode: "permissions" };
  if (pathname.startsWith("/apps")) return { view: "apps", userViewMode: "permissions" };
  return { view: "dashboard", userViewMode: "permissions" };
}

function routePath(view: View, userViewMode: UserViewMode = "permissions") {
  if (view === "dashboard") return "/dashboard";
  if (view === "apps") return "/apps";
  if (view === "users") return userViewMode === "crud" ? "/admin/users/accounts" : "/admin/users/permissions";
  if (view === "admin-apps") return "/admin/apps";
  if (view === "admin-home") return "/admin/home";
  if (view === "feedback") return "/admin/feedback";
  if (view === "projects") return "/admin/projects";
  if (view === "security") return "/admin/security";
  if (view === "integration") return "/admin/integration";
  return `/${view}`;
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [apps, setApps] = useState<RegisteredApp[]>([]);
  const [homeSettings, setHomeSettings] = useState<PortalHomeSettings | null>(null);
  const [projects, setProjects] = useState<ProjectUpload[]>([]);
  const [allPermissions, setAllPermissions] = useState<{ id: string; code: string; description: string }[]>([]);
  const initialRoute = routeState(window.location.pathname);
  const [view, setView] = useState<View>(initialRoute.view);
  const [userViewMode, setUserViewMode] = useState<UserViewMode>(initialRoute.userViewMode);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [resetToken, setResetToken] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  const can = useMemo(() => new Set(me?.permissions ?? []), [me]);
  const adminViews: View[] = ["users", "admin-apps", "admin-home", "feedback", "projects", "security", "integration"];
  const adminToolsActive = adminViews.includes(view);
  const canUseAdminTools =
    can.has("users:view") ||
    can.has("apps:manage") ||
    can.has("portal:manage") ||
    can.has("feedback:view") ||
    can.has("projects:review") ||
    can.has("templates:view") ||
    can.has("users:permissions");

  function navigate(nextView: View, nextUserViewMode: UserViewMode = "permissions") {
    window.history.pushState({}, "", routePath(nextView, nextUserViewMode));
    setView(nextView);
    setUserViewMode(nextUserViewMode);
  }

  const checkMaintenance = (err: any) => {
    if (err && (err.code === "0XDEADFA11" || String(err).includes("0XDEADFA11"))) {
      setIsMaintenance(true);
    }
  };

  useEffect(() => {
    const splashStartedAt = Date.now();
    const finishAuthCheck = () => {
      const elapsed = Date.now() - splashStartedAt;
      const remaining = Math.max(0, 1500 - elapsed);
      window.setTimeout(() => setAuthChecking(false), remaining);
    };
    const tokenFromUrl = new URLSearchParams(window.location.search).get("reset_token");
    if (tokenFromUrl) {
      setResetToken(tokenFromUrl);
    }
    let token = localStorage.getItem("gatestack_token");
    if (!token) {
      const match = document.cookie.match(/(?:^|; )gatestack_token=([^;]*)/);
      if (match) {
        token = match[1];
        localStorage.setItem("gatestack_token", token);
      }
    }
    if (!token) {
      finishAuthCheck();
      return;
    }
    if (token) {
      api.me()
        .then(setMe)
        .catch((err) => {
          checkMaintenance(err);
          localStorage.removeItem("gatestack_token");
          document.cookie = "gatestack_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
          setAuthChecking(false);
        })
        .then(finishAuthCheck);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const next = routeState(window.location.pathname);
      setView(next.view);
      setUserViewMode(next.userViewMode);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
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
    if (can.has("users:badges") || me.is_platform_admin) {
      api.badges()
        .then(setBadges)
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
    api.apps()
      .then(setApps)
      .catch((err) => {
        checkMaintenance(err);
        setLoadError(String(err));
      });
    api.homeSettings()
      .then(setHomeSettings)
      .catch((err) => {
        checkMaintenance(err);
        setLoadError(String(err));
      });
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
        if (token.must_reset_password && token.reset_token) {
          setResetToken(token.reset_token);
          setError("Debes cambiar tu contraseña antes de continuar.");
          return;
        }
        if (token.access_token) {
          localStorage.setItem("gatestack_token", token.access_token);
          document.cookie = `gatestack_token=${token.access_token}; path=/; max-age=1209600; SameSite=Lax`;
          setMe(await api.me());
        }
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
    document.cookie = "gatestack_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
    setMe(null);
    navigate("dashboard");
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

  if (authChecking) {
    return <GateStackSplash />;
  }

  if (!me) {
    if (resetToken) {
      return <PasswordResetView token={resetToken} done={resetDone} onDone={() => setResetDone(true)} onBack={() => setResetToken("")} />;
    }
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
        <div className="nav-section-label">Portal</div>
        <NavButton icon={<Database />} active={view === "dashboard"} onClick={() => navigate("dashboard")} label="Dashboard" />
        <NavButton icon={<AppWindow />} active={view === "apps"} onClick={() => navigate("apps")} label="Apps" />
        {canUseAdminTools && (
          <div className="nav-category">
            <div className={`nav-category-title ${adminToolsActive ? "active" : ""}`}>
              <SlidersHorizontal />
              <span>Admin tools</span>
            </div>
            <div className="subnav expanded">
              {can.has("users:view") && (
                <>
                  <button className={`subnav-item ${view === "users" ? "active" : ""}`} onClick={() => navigate("users", "permissions")}>
                    Usuarios
                  </button>
                  {view === "users" && (
                    <div className="subnav-nested">
                      <button
                        className={`subnav-item ${userViewMode === "permissions" ? "active" : ""}`}
                        onClick={() => navigate("users", "permissions")}
                      >
                        Permisos y templates
                      </button>
                      <button
                        className={`subnav-item ${userViewMode === "crud" ? "active" : ""}`}
                        onClick={() => navigate("users", "crud")}
                      >
                        Cuentas
                      </button>
                    </div>
                  )}
                </>
              )}
              {can.has("apps:manage") && (
                <button className={`subnav-item ${view === "admin-apps" ? "active" : ""}`} onClick={() => navigate("admin-apps")}>
                  Aplicaciones
                </button>
              )}
              {can.has("portal:manage") && (
                <button className={`subnav-item ${view === "admin-home" ? "active" : ""}`} onClick={() => navigate("admin-home")}>
                  Home
                </button>
              )}
              {can.has("feedback:view") && (
                <button className={`subnav-item ${view === "feedback" ? "active" : ""}`} onClick={() => navigate("feedback")}>
                  Feedback
                </button>
              )}
              {can.has("projects:review") && (
                <button className={`subnav-item ${view === "projects" ? "active" : ""}`} onClick={() => navigate("projects")}>
                  Proyectos
                </button>
              )}
              {can.has("templates:view") && (
                <button className={`subnav-item ${view === "security" ? "active" : ""}`} onClick={() => navigate("security")}>
                  Seguridad
                </button>
              )}
              <button className={`subnav-item ${view === "integration" ? "active" : ""}`} onClick={() => navigate("integration")}>
                Integracion API
              </button>
            </div>
          </div>
        )}
        
        <button className="nav logout" onClick={logout}>
          <LogOut />
          Salir
        </button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">{adminToolsActive ? "Admin tools" : "Portal principal"}</span>
            <h2>{viewTitle(view)}</h2>
          </div>
          <div className="user-pill">
            <span>{me.full_name}</span>
            <small>{me.is_platform_admin ? "Platform admin" : "Usuario aprobado"}</small>
          </div>
        </header>

        {view === "dashboard" && (
          <DashboardView
            users={users}
            apps={apps}
            projects={projects}
            permissions={me.permissions}
            homeSettings={homeSettings}
          />
        )}
        {loadError && <p className="load-error">{loadError}</p>}
        {view === "users" && (
          <UsersView
            users={users}
            me={me}
            templates={templates}
            badges={badges}
            allPermissions={allPermissions}
            viewMode={userViewMode}
            refresh={() => setRefreshCount((c) => c + 1)}
          />
        )}
        {view === "apps" && <AppsView apps={apps} permissions={me.permissions} refresh={() => setRefreshCount((c) => c + 1)} />}
        {view === "admin-apps" && (
          <AppsView apps={apps} permissions={me.permissions} refresh={() => setRefreshCount((c) => c + 1)} mode="admin" />
        )}
        {view === "admin-home" && (
          <HomeAdminView
            settings={homeSettings}
            refresh={() => api.homeSettings().then(setHomeSettings).catch((err) => setLoadError(String(err)))}
          />
        )}
        {view === "feedback" && <FeedbackView permissions={me.permissions} />}
        {view === "projects" && <ProjectsView projects={projects} permissions={me.permissions} refresh={() => setRefreshCount((c) => c + 1)} />}
        {view === "security" && <SecurityView templates={templates} permissions={me.permissions} />}
        {view === "integration" && <IntegrationView />}
      </section>
    </main>
  );
}

function GateStackSplash() {
  return (
    <main className="splash-shell">
      <section className="splash-panel">
        <div className="splash-mark">
          <ShieldCheck />
        </div>
        <div>
          <span className="eyebrow">GateStack</span>
          <h1>Preparando tu sesion</h1>
          <p>Validando credenciales y cargando el portal.</p>
        </div>
        <div className="splash-loader" aria-label="Cargando">
          <span />
        </div>
      </section>
    </main>
  );
}

function viewTitle(view: View) {
  const titles: Record<View, string> = {
    dashboard: "Dashboard",
    apps: "Aplicaciones",
    users: "Gestion de usuarios",
    "admin-apps": "Admin de aplicaciones",
    "admin-home": "Personalizar home",
    feedback: "Feedback",
    projects: "Revision de proyectos",
    security: "Permisos y templates",
    integration: "Integracion API",
  };
  return titles[view];
}
