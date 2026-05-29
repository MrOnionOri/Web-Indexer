import { Template } from "../api";

export function SecurityView({ templates, permissions }: { templates: Template[]; permissions: string[] }) {
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
