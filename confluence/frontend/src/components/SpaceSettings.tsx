import React, { FormEvent, useState, useMemo } from "react";
import { ArrowLeft, Lock, Globe, Save, AlertTriangle, ShieldAlert } from "lucide-react";

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
  created_by_email?: string;
  is_restricted?: boolean;
  allowed_emails?: string;
  created_at: string;
}

interface UserListItem {
  email: string;
  full_name: string;
}

interface SpaceSettingsProps {
  currentUser: UserProfile;
  activeSpace: Space;
  allUsers: UserListItem[];
  editSpaceName: string;
  setEditSpaceName: (val: string) => void;
  editSpaceKey: string;
  setEditSpaceKey: (val: string) => void;
  editSpaceDesc: string;
  setEditSpaceDesc: (val: string) => void;
  editSpaceIsRestricted: boolean;
  setEditSpaceIsRestricted: (val: boolean) => void;
  editSpaceAllowedEmails: string;
  setEditSpaceAllowedEmails: (val: string) => void;
  onSubmit: (e: FormEvent) => void;
  onDeleteSpace: (id: string) => void;
  onCancel: () => void;
}

export default function SpaceSettings({
  currentUser,
  activeSpace,
  allUsers,
  editSpaceName,
  setEditSpaceName,
  editSpaceKey,
  setEditSpaceKey,
  editSpaceDesc,
  setEditSpaceDesc,
  editSpaceIsRestricted,
  setEditSpaceIsRestricted,
  editSpaceAllowedEmails,
  setEditSpaceAllowedEmails,
  onSubmit,
  onDeleteSpace,
  onCancel
}: SpaceSettingsProps) {
  // Parse allowed emails to render as tag badges
  const emailList = (activeSpace.allowed_emails || "")
    .split(",")
    .map(e => e.trim())
    .filter(e => e.length > 0);

  const [searchText, setSearchText] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleAddEmail = (email: string) => {
    const emails = editSpaceAllowedEmails.split(",").map(em => em.trim()).filter(Boolean);
    if (email && !emails.map(em => em.toLowerCase()).includes(email.toLowerCase())) {
      const nextList = [...emails, email];
      setEditSpaceAllowedEmails(nextList.join(", "));
    }
    setSearchText("");
    setIsDropdownOpen(false);
  };

  const filteredUsers = useMemo(() => {
    const emails = editSpaceAllowedEmails.split(",").map(e => e.trim()).filter(Boolean);
    const unselected = allUsers.filter(u => !emails.map(e => e.toLowerCase()).includes(u.email.toLowerCase()));
    if (!searchText.trim()) return unselected;
    const q = searchText.toLowerCase();
    return unselected.filter(u =>
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  }, [allUsers, editSpaceAllowedEmails, searchText]);

  return (
    <div className="subview">
      <button className="btn-back" onClick={onCancel}>
        <ArrowLeft size={14} />
        <span>Volver al espacio [{activeSpace.key}]</span>
      </button>

      <div className="admin-view-header" style={{ marginBottom: "24px" }}>
        <h1>Configuración de Workspace: {activeSpace.name}</h1>
        <p>Ajusta el identificador, la visibilidad de privacidad, y gestiona este espacio de conocimiento.</p>
      </div>

      <div className="dashboard-grid">
        {/* Left Side: Visibility & Status Summary */}
        <div className="card grid-side" style={{ flex: "1" }}>
          <div className="card-header">
            <h2>Visibilidad y Acceso</h2>
          </div>
          <div className="access-info-panel" style={{ padding: "20px" }}>
            {activeSpace.is_restricted ? (
              <div className="restricted-summary-box">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#f87171", marginBottom: "12px" }}>
                  <Lock size={20} />
                  <strong style={{ fontSize: "16px" }}>Acceso Privado / Restringido</strong>
                </div>
                <p className="text-small" style={{ marginBottom: "16px", color: "var(--color-text-muted)" }}>
                  Este espacio de trabajo es privado. Solo el creador, los administradores y los siguientes usuarios explícitos pueden ver este espacio y sus páginas asociadas:
                </p>
                <div className="allowed-emails-tags" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {emailList.length === 0 ? (
                    <span style={{ fontSize: "12px", fontStyle: "italic", color: "var(--color-text-muted)" }}>
                      Solo tú ({activeSpace.created_by_email || currentUser.email}) tienes acceso.
                    </span>
                  ) : (
                    emailList.map((email, idx) => {
                      const userObj = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
                      const displayName = userObj ? userObj.full_name : email;
                      return (
                        <span
                          key={idx}
                          className="user-badge-restricted"
                        >
                          {displayName} ({email})
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="public-summary-box">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#34d399", marginBottom: "12px" }}>
                  <Globe size={20} />
                  <strong style={{ fontSize: "16px" }}>Acceso Público</strong>
                </div>
                <p className="text-small" style={{ color: "var(--color-text-muted)" }}>
                  Cualquier usuario logueado en la intranet de GateWiki que cuente con permisos de visualización (`gatewiki:view`) puede ver y acceder a este espacio de trabajo y sus páginas.
                </p>
              </div>
            )}

            <div style={{ borderTop: "1px solid var(--border-color)", marginTop: "24px", paddingTop: "16px", fontSize: "12px", color: "var(--color-text-muted)" }}>
              <p>Creado por: <strong>{activeSpace.created_by_email || "Sistema (Semilla)"}</strong></p>
              <p style={{ marginTop: "4px" }}>Fecha de creación: {new Date(activeSpace.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
          </div>
        </div>

        {/* Right Side: Edit Form */}
        <div className="card grid-main" style={{ flex: "2" }}>
          <div className="card-header">
            <h2>Actualizar Datos</h2>
          </div>
          <form onSubmit={onSubmit} className="edit-form-card" style={{ background: "none", border: "none", padding: 0 }}>
            <div className="form-row">
              <div className="form-group flex-2">
                <label>Nombre del Espacio</label>
                <input
                  type="text"
                  value={editSpaceName}
                  onChange={(e) => setEditSpaceName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group flex-1">
                <label>Identificador Único (Key)</label>
                <input
                  type="text"
                  value={editSpaceKey}
                  onChange={(e) => setEditSpaceKey(e.target.value)}
                  required
                  pattern="^[A-Z0-9]+$"
                  title="Solo mayúsculas y números"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Descripción del Espacio</label>
              <textarea
                rows={3}
                value={editSpaceDesc}
                onChange={(e) => setEditSpaceDesc(e.target.value)}
                required
              />
            </div>

            <div className="restriction-section" style={{ padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", marginTop: "16px" }}>
              <div className="toggle-control" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  id="restrict-space-settings-checkbox"
                  checked={editSpaceIsRestricted}
                  onChange={(e) => setEditSpaceIsRestricted(e.target.checked)}
                />
                <label htmlFor="restrict-space-settings-checkbox" style={{ margin: 0, cursor: "pointer" }}>
                  <strong>Restringir este espacio de trabajo</strong>
                </label>
              </div>
              <p className="text-small text-muted" style={{ fontSize: "12px", marginTop: "4px", color: "var(--color-text-muted)" }}>
                Si se activa, solo tú, los administradores y los usuarios que agregues abajo podrán ingresar.
              </p>
              {editSpaceIsRestricted && (
                <div className="form-group" style={{ marginTop: "12px" }}>
                  <label>Miembros Autorizados</label>
                  
                  <div className="allowed-emails-tags" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px", marginTop: "8px" }}>
                    {(() => {
                      const emails = editSpaceAllowedEmails.split(",").map(e => e.trim()).filter(Boolean);
                      if (emails.length === 0) {
                        return <span style={{ fontSize: "12px", fontStyle: "italic", color: "var(--color-text-muted)" }}>Agrega usuarios autorizados a la lista.</span>;
                      }
                      return emails.map(email => {
                        const userObj = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
                        const displayName = userObj ? userObj.full_name : email;
                        return (
                          <span
                            key={email}
                            className="email-tag"
                          >
                            <span>{displayName} ({email})</span>
                            <button
                              type="button"
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--text-muted)",
                                cursor: "pointer",
                                fontSize: "14px",
                                padding: "0 2px",
                                display: "inline-flex",
                                alignItems: "center",
                                lineHeight: 1
                              }}
                              onClick={() => {
                                const nextList = emails.filter(e => e !== email);
                                setEditSpaceAllowedEmails(nextList.join(", "));
                              }}
                            >
                              &times;
                            </button>
                          </span>
                        );
                      });
                    })()}
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <input
                        type="text"
                        autoComplete="new-password"
                        placeholder="Buscar usuario por nombre o correo, o escribe..."
                        id="custom-edit-email-input"
                        style={{ width: "100%" }}
                        value={searchText}
                        onChange={(e) => {
                          setSearchText(e.target.value);
                          setIsDropdownOpen(true);
                        }}
                        onFocus={() => setIsDropdownOpen(true)}
                        onBlur={() => {
                          setTimeout(() => setIsDropdownOpen(false), 200);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (searchText.trim()) {
                              handleAddEmail(searchText.trim());
                            }
                          }
                        }}
                      />
                      {isDropdownOpen && filteredUsers.length > 0 && (
                        <div className="custom-combobox-dropdown">
                          {filteredUsers.map(u => (
                            <div
                              key={u.email}
                              className="dropdown-item"
                              onMouseDown={(e) => {
                                e.preventDefault();
                              }}
                              onClick={() => {
                                handleAddEmail(u.email);
                              }}
                            >
                              <strong>{u.full_name}</strong> <span style={{ opacity: 0.7, fontSize: '0.85em' }}>({u.email})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "6px 16px", fontSize: "13.5px" }}
                      onClick={() => {
                        if (searchText.trim()) {
                          handleAddEmail(searchText.trim());
                        }
                      }}
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="form-actions" style={{ marginTop: "24px" }}>
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary">
                <Save size={16} />
                <span>Guardar Cambios</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Danger Zone: Destructive Actions */}
      <div className="danger-zone-card">
        <div className="card-header" style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid rgba(239, 68, 68, 0.15)", paddingBottom: "12px" }}>
          <ShieldAlert size={20} style={{ color: "#ef4444" }} />
          <h2 style={{ color: "#ef4444", margin: 0 }}>Zona de Peligro (Danger Zone)</h2>
        </div>
        <div style={{ padding: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ flex: "1 1 500px" }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", color: "#f87171" }}>Eliminar este espacio de trabajo</h3>
            <p className="text-small" style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "13px" }}>
              Al eliminar este espacio se borrarán de manera **permanente** todas las páginas y la documentación asociada en la base de datos de MySQL. Esta acción no se puede deshacer.
            </p>
          </div>
          <div>
            <button
              type="button"
              className="btn-danger"
              style={{ padding: "10px 20px", background: "#ef4444", fontWeight: "bold" }}
              onClick={() => onDeleteSpace(activeSpace.id)}
            >
              Eliminar Espacio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
