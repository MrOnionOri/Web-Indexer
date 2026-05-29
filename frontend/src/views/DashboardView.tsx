import { AppWindow, Clock3, ShieldCheck, Users } from "lucide-react";
import { ProjectUpload, RegisteredApp, User } from "../api";
import { Metric } from "../components/ui";

export function DashboardView({
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

