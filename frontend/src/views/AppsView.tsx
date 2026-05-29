import { AppWindow } from "lucide-react";
import { RegisteredApp } from "../api";
import { EmptyState } from "../components/ui";

export function AppsView({ apps }: { apps: RegisteredApp[] }) {
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

