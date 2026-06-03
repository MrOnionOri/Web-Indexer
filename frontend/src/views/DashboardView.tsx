import { AppWindow, Clock3, ExternalLink, ShieldCheck, Users } from "lucide-react";
import { PortalHomeSettings, ProjectUpload, RegisteredApp, User } from "../api";
import { EmptyState, Metric } from "../components/ui";

const defaultHeroImage =
  "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1600&q=80";

export function DashboardView({
  users,
  apps,
  projects,
  permissions,
  homeSettings,
}: {
  users: User[];
  apps: RegisteredApp[];
  projects: ProjectUpload[];
  permissions: string[];
  homeSettings: PortalHomeSettings | null;
}) {
  const pendingUsers = users.filter((user) => user.status === "pending").length;
  const pendingProjects = projects.filter((project) => project.status === "pending_review").length;
  const settings = homeSettings ?? {
    id: "",
    headline: "GateStack",
    subheadline: "Portal principal de aplicaciones internas",
    welcome_message: "Accede a tus aplicaciones aprobadas desde un solo lugar.",
    hero_image_url: null,
    announcement: "",
    updated_at: "",
  };

  return (
    <div className="home-layout">
      <section
        className="home-hero"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(6, 9, 16, 0.86), rgba(6, 9, 16, 0.32)), url("${settings.hero_image_url || defaultHeroImage}")` }}
      >
        <div className="home-hero-content">
          {settings.announcement && <span className="home-announcement">{settings.announcement}</span>}
          <h1>{settings.headline}</h1>
          <p className="home-subheadline">{settings.subheadline}</p>
          <p className="home-message">{settings.welcome_message}</p>
        </div>
      </section>

      <div className="dashboard">
        <Metric icon={<Users />} label="Usuarios pendientes" value={String(pendingUsers)} />
        <Metric icon={<AppWindow />} label="Apps registradas" value={String(apps.length)} />
        <Metric icon={<Clock3 />} label="Proyectos en revision" value={String(pendingProjects)} />
        <Metric icon={<ShieldCheck />} label="Permisos activos" value={String(permissions.length)} />
      </div>

      <section className="table-surface">
        <div className="split-toolbar">
          <div>
            <h3>Aplicaciones disponibles</h3>
            <p className="toolbar-note">Accesos registrados dentro de GateStack.</p>
          </div>
        </div>
        {apps.length === 0 && <EmptyState text="Todavia no hay aplicaciones registradas." />}
        <div className="home-app-grid">
          {apps.map((app) => (
            <article className="home-app-card" key={app.id}>
              <AppWindow />
              <div>
                <strong>{app.name}</strong>
                <span>{app.description || app.slug}</span>
              </div>
              {app.homepage_url && (
                <a className="icon-action" href={app.homepage_url} target="_blank" rel="noreferrer" aria-label={`Abrir ${app.name}`}>
                  <ExternalLink />
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

    </div>
  );
}
