import { AppWindow, CheckCircle2, ExternalLink, LockKeyhole, Plus, Send, XCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api, AppAccessRequest, PermissionOption, RegisteredApp } from "../api";
import { EmptyState, StatusBadge } from "../components/ui";

export function AppsView({
  apps,
  permissions,
  refresh,
  mode = "catalog",
}: {
  apps: RegisteredApp[];
  permissions: string[];
  refresh: () => void;
  mode?: "catalog" | "admin";
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accessRequests, setAccessRequests] = useState<AppAccessRequest[]>([]);
  const [permissionOptions, setPermissionOptions] = useState<PermissionOption[]>([]);
  const [requestingApp, setRequestingApp] = useState<RegisteredApp | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const canManageApps = permissions.includes("apps:manage");
  const showAdminTools = mode === "admin" && canManageApps;

  useEffect(() => {
    if (!showAdminTools) return;
    api.appAccessRequests().then(setAccessRequests).catch(() => {});
    api.appPermissionOptions().then(setPermissionOptions).catch(() => {});
  }, [showAdminTools]);

  async function handleCreateApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const slug = String(form.get("slug") ?? "").trim().toLowerCase();
    const description = String(form.get("description") ?? "").trim();
    const homepageUrl = String(form.get("homepageUrl") ?? "").trim();
    const logoUrl = String(form.get("logoUrl") ?? "").trim();
    const requiredPermissionCode = String(form.get("requiredPermissionCode") ?? "").trim();

    try {
      await api.createApp(name, slug, description, homepageUrl || null, logoUrl || null, requiredPermissionCode || null);
      event.currentTarget.reset();
      setShowForm(false);
      refresh();
    } catch (err: any) {
      setError(err.message ?? "No se pudo registrar la aplicacion");
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestingApp) return;
    setRequestMessage("");
    try {
      await api.requestAppAccess(requestingApp.id, requestReason);
      setRequestMessage("Solicitud enviada. Un admin revisara tu acceso.");
      setRequestingApp(null);
      setRequestReason("");
      refresh();
    } catch (err: any) {
      setRequestMessage(err.message ?? "No se pudo enviar la solicitud");
    }
  }

  async function handleReviewAccess(requestId: string, status: "approved" | "rejected") {
    const adminNotes = window.prompt(status === "approved" ? "Notas de aprobacion" : "Motivo del rechazo", "") ?? "";
    try {
      await api.reviewAppAccessRequest(requestId, status, adminNotes);
      setAccessRequests(await api.appAccessRequests());
      refresh();
    } catch (err: any) {
      alert(err.message ?? "No se pudo revisar la solicitud");
    }
  }

  return (
    <div className="apps-layout">
      {showAdminTools && (
        <section className="table-surface app-register-panel">
          <div className="split-toolbar">
            <div>
              <h3>Registro de aplicaciones</h3>
              <p className="toolbar-note">Elige el permiso minimo que debe tener un usuario para que salga Abrir.</p>
            </div>
            <button className="primary compact" type="button" onClick={() => setShowForm((value) => !value)}>
              <Plus />
              {showForm ? "Cerrar" : "Agregar app"}
            </button>
          </div>

          {showForm && (
            <form className="app-form" onSubmit={handleCreateApp}>
              <label>
                Nombre
                <input name="name" placeholder="GateWiki" required minLength={2} maxLength={140} />
              </label>
              <label>
                Slug
                <input name="slug" placeholder="gatewiki" required minLength={2} maxLength={100} pattern="[a-z0-9-]+" />
              </label>
              <label>
                URL de inicio
                <input name="homepageUrl" placeholder="https://wiki.tu-dominio.local" type="url" />
              </label>
              <label>
                Logo URL
                <input name="logoUrl" placeholder="https://tu-dominio/logo.png" type="url" />
              </label>
              <label className="wide-field">
                Permiso minimo para abrir
                <select name="requiredPermissionCode" required defaultValue="">
                  <option value="" disabled>
                    Selecciona un permiso
                  </option>
                  {permissionOptions.map((permission) => (
                    <option value={permission.code} key={permission.id}>
                      {permission.code} - {permission.description}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide-field">
                Descripcion
                <textarea name="description" placeholder="Describe para que sirve esta aplicacion" rows={3} />
              </label>
              <div className="form-actions wide-field">
                <button className="primary compact" disabled={saving}>
                  {saving ? "Guardando..." : "Crear aplicacion"}
                </button>
              </div>
              {error && <p className="load-error wide-field">{error}</p>}
            </form>
          )}
        </section>
      )}

      {showAdminTools && <AccessRequestsPanel requests={accessRequests} onReview={handleReviewAccess} />}

      {requestMessage && <p className="form-note">{requestMessage}</p>}

      <section className="apps-catalog">
        <div>
          <h3>{mode === "admin" ? "Catalogo de aplicaciones" : "Aplicaciones disponibles"}</h3>
          <p className="toolbar-note">
            {mode === "admin"
              ? "Vista previa de las apps publicadas y del permiso requerido."
              : "Abre tus apps o solicita acceso cuando aun no tengas permisos."}
          </p>
        </div>
        <div className="app-tile-grid">
        {apps.length === 0 && <EmptyState text="Todavia no hay aplicaciones registradas." />}
        {apps.map((app) => (
          <article className={`app-tile ${app.has_access ? "is-open" : "is-locked"}`} key={app.id}>
            <div className="app-tile-top">
              <AppLogo app={app} />
              {!app.has_access && <span className="app-lock-badge">Request</span>}
            </div>
            <div className="app-tile-body">
              <h3>{app.name}</h3>
              <p>{app.description || "Sin descripcion"}</p>
            </div>
            <div className="app-tile-meta">
              <code>{app.required_permission_code || app.slug}</code>
            </div>
            <div className="app-tile-actions">
              {app.has_access && app.homepage_url ? (
                <a className="secondary-action compact" href={app.homepage_url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Abrir
                </a>
              ) : app.has_access ? (
                <span className="status status-approved">acceso activo</span>
              ) : (
                <button className="secondary-action compact" onClick={() => setRequestingApp(app)} disabled={app.access_request_status === "pending"}>
                  <LockKeyhole />
                  {app.access_request_status === "pending" ? "Solicitado" : "Solicitar acceso"}
                </button>
              )}
            </div>
          </article>
        ))}
        </div>
      </section>

      {requestingApp && (
        <div className="modal-backdrop">
          <form className="modal-box" onSubmit={handleRequestAccess}>
            <h3>Solicitar acceso</h3>
            <p>
              Tu solicitud sera enviada para revisar acceso a <strong>{requestingApp.name}</strong>.
            </p>
            <div className="modal-field">
              <label>Motivo</label>
              <textarea
                value={requestReason}
                onChange={(event) => setRequestReason(event.target.value)}
                placeholder="Explica brevemente por que necesitas esta aplicacion"
                rows={4}
              />
            </div>
            <div className="modal-buttons">
              <button className="primary compact">
                <Send />
                Enviar solicitud
              </button>
              <button className="secondary-action" type="button" onClick={() => setRequestingApp(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function AppLogo({ app }: { app: RegisteredApp }) {
  if (app.logo_url) {
    return <img className="app-logo" src={app.logo_url} alt="" />;
  }
  return (
    <div className="app-logo app-logo-fallback">
      <AppWindow />
    </div>
  );
}

function AccessRequestsPanel({
  requests,
  onReview,
}: {
  requests: AppAccessRequest[];
  onReview: (requestId: string, status: "approved" | "rejected") => void;
}) {
  const pending = requests.filter((request) => request.status === "pending");

  return (
    <section className="table-surface">
      <div className="split-toolbar">
        <div>
          <h3>Solicitudes de acceso</h3>
          <p className="toolbar-note">Al aprobar, GateStack asigna automaticamente el permiso requerido como override allow.</p>
        </div>
        <span className="status status-pending">{pending.length} pendientes</span>
      </div>

      {requests.length === 0 && <EmptyState text="No hay solicitudes de acceso." />}
      {requests.map((request) => (
        <div className="row app-request-row" key={request.id}>
          <div>
            <strong>{request.app_name}</strong>
            <span>
              {request.user_full_name} · {request.user_email}
            </span>
            {request.reason && <p className="request-reason">{request.reason}</p>}
          </div>
          <StatusBadge value={request.status} />
          <div className="row-actions">
            <button className="icon-action" disabled={request.status !== "pending"} onClick={() => onReview(request.id, "approved")} title="Aprobar">
              <CheckCircle2 />
            </button>
            <button
              className="icon-action danger"
              disabled={request.status !== "pending"}
              onClick={() => onReview(request.id, "rejected")}
              title="Rechazar"
            >
              <XCircle />
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
