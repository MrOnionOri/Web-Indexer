import React from "react";
import { Sparkles, FileText, Folder, Lock, Globe, Trash2 } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  permissions: string[];
  is_platform_admin: boolean;
}

interface Space {
  id: string;
  name: string;
  key: string;
  description: string;
  created_by_id?: string;
  is_restricted?: boolean;
  allowed_emails?: string;
  created_at: string;
}

interface Page {
  id: string;
  space_key: string;
  title: string;
  content: string;
  created_by_email: string;
  created_by_name: string;
  created_by_id: string;
  is_restricted: boolean;
  allowed_emails: string;
  created_at: string;
  updated_at: string;
}

interface DashboardProps {
  currentUser: UserProfile;
  spaces: Space[];
  pages: Page[];
  filteredPages: Page[];
  activeSpaceFilter: string | null;
  onReadPage: (id: string) => void;
  onDeletePage: (id: string) => void;
  hasDelete: boolean;
  onEditSpace: (space: Space) => void;
}

export default function Dashboard({
  currentUser,
  spaces,
  pages,
  filteredPages,
  activeSpaceFilter,
  onReadPage,
  onDeletePage,
  hasDelete,
  onEditSpace
}: DashboardProps) {
  const perms = new Set(currentUser.permissions || []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="subview">
      {(() => {
        const activeSpace = spaces.find(s => s.key === activeSpaceFilter);
        if (activeSpace) {
          return (
            <div className="welcome-banner space-banner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="banner-text">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span className="space-nav-badge" style={{ fontSize: "14px", padding: "4px 8px" }}>{activeSpace.key}</span>
                  <h1 style={{ margin: 0 }}>{activeSpace.name}</h1>
                  {activeSpace.is_restricted && (
                    <span className="badge-privacy restricted" style={{ fontSize: "12px", padding: "2px 6px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Lock size={12} /> Restringido
                    </span>
                  )}
                </div>
                <p style={{ marginTop: "8px", opacity: 0.85 }}>{activeSpace.description || "Sin descripción disponible."}</p>
                {activeSpace.is_restricted && activeSpace.allowed_emails && (
                  <p style={{ fontSize: "12px", opacity: 0.7, marginTop: "4px" }}>
                    <strong>Miembros autorizados:</strong> {activeSpace.allowed_emails}
                  </p>
                )}
                {(currentUser.is_platform_admin || 
                  currentUser.permissions.includes("gatewiki:admin") || 
                  activeSpace.created_by_id === currentUser.id) && (
                  <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                    <button 
                      className="btn-secondary" 
                      style={{ padding: "6px 12px", fontSize: "13px" }}
                      onClick={() => onEditSpace(activeSpace)}
                    >
                      Configuración de Espacio
                    </button>
                  </div>
                )}
              </div>
              <div className="banner-icon">
                <Folder size={32} />
              </div>
            </div>
          );
        }
        return (
          <div className="welcome-banner">
            <div className="banner-text">
              <h1>¡Hola, {currentUser.full_name}!</h1>
              <p>Bienvenido al Workspace de Conocimiento de GateWiki. Esta aplicación se ejecuta en React y conecta con tu base de datos MySQL.</p>
            </div>
            <div className="banner-icon">
              <Sparkles size={32} />
            </div>
          </div>
        );
      })()}

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon primary-color">
            <FileText size={20} />
          </div>
          <div className="metric-info">
            <span className="metric-value">{filteredPages.length}</span>
            <span className="metric-label">Páginas en este espacio</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon success-color">
            <Folder size={20} />
          </div>
          <div className="metric-info">
            <span className="metric-value">{spaces.length}</span>
            <span className="metric-label">Espacios Totales</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon warning-color">
            <Lock size={20} />
          </div>
          <div className="metric-info">
            <span className="metric-value">{pages.filter(p => p.is_restricted).length}</span>
            <span className="metric-label">Páginas Privadas</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card grid-main">
          <div className="card-header">
            <h2>Páginas de conocimiento {activeSpaceFilter ? `en espacio [${activeSpaceFilter}]` : ""}</h2>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Espacio</th>
                  <th>Creador</th>
                  <th>Fecha</th>
                  <th>Visibilidad</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredPages.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center" }} className="text-muted">
                      No hay páginas de conocimiento que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredPages.map(p => (
                    <tr key={p.id}>
                      <td>
                        <span className="row-page-title" onClick={() => onReadPage(p.id)}>
                          {p.title}
                        </span>
                      </td>
                      <td><span className="space-badge">{p.space_key}</span></td>
                      <td>{p.created_by_name}</td>
                      <td>{formatDate(p.created_at)}</td>
                      <td>
                        {p.is_restricted ? (
                          <span className="badge-privacy restricted"><Lock size={12} /> Privado</span>
                        ) : (
                          <span className="badge-privacy public"><Globe size={12} /> Público</span>
                        )}
                      </td>
                      <td className="text-right">
                        <button className="btn-table-action" onClick={() => onReadPage(p.id)} title="Leer">
                          <Globe size={14} />
                        </button>
                        {(hasDelete || p.created_by_id === currentUser.id) && (
                          <button className="btn-table-action delete" onClick={() => onDeletePage(p.id)} title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card grid-side">
          <div className="card-header">
            <h2>Acceso Autorizado</h2>
          </div>
          <div className="access-info-panel">
            <div className="badge-status-container">
              <span className="status-indicator active"></span>
              <strong>Base de datos: MySQL Activa</strong>
            </div>
            <p className="text-small">Tus permisos han sido verificados directamente con la consola central de GateStack IAM.</p>
            <div className="permissions-details">
              <h3>Permisos Efectivos</h3>
              <ul className="bullets-list">
                {currentUser.is_platform_admin && <li>Acceso de superadministrador total</li>}
                {perms.has("gatewiki:view") && <li><strong>VIEW:</strong> Ver páginas autorizadas</li>}
                {perms.has("gatewiki:create") && <li><strong>CREATE:</strong> Crear espacios y páginas</li>}
                {perms.has("gatewiki:edit") && <li><strong>EDIT:</strong> Editar contenidos</li>}
                {perms.has("gatewiki:delete") && <li><strong>DELETE:</strong> Eliminar páginas de tu propiedad</li>}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
