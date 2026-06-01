import { FormEvent, useState } from "react";
import { CheckCircle2, Clock3, Eye, KeyRound, MoreHorizontal, Search, ShieldCheck, ShieldX, UserCog, Users } from "lucide-react";
import { api, Me, Template, User } from "../api";
import { EmptyState, initials, Metric, StatusBadge } from "../components/ui";

export type UserViewMode = "permissions" | "crud";

export function UsersView({
  users,
  me,
  templates,
  allPermissions,
  viewMode,
  refresh,
}: {
  users: User[];
  me: Me;
  templates: Template[];
  allPermissions: { id: string; code: string; description: string }[];
  viewMode: UserViewMode;
  refresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [templateSelection, setTemplateSelection] = useState<Record<string, string>>({});
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

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
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);

  // Banning/Sanctioning states
  const [sanctioningUser, setSanctioningUser] = useState<User | null>(null);
  const [sanctionStatus, setSanctionStatus] = useState<User["status"]>("suspended");
  const [sanctionReason, setSanctionReason] = useState("");

  const filteredUsers = users.filter((user) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return `${user.full_name} ${user.email} ${user.status}`.toLowerCase().includes(normalizedQuery);
  });

  const approvedAdminCount = users.filter((user) => user.is_platform_admin && user.status === "approved").length;

  function isProtectedAdminAction(user: User) {
    return user.id === me.id || (user.is_platform_admin && approvedAdminCount <= 1);
  }

  async function updateAccess(user: User, status: User["status"]) {
    if (status !== "approved" && isProtectedAdminAction(user)) {
      alert("No puedes bloquear tu propia cuenta ni dejar GateStack sin un admin activo.");
      return;
    }
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
  const handleDeleteUser = async (user: User) => {
    if (isProtectedAdminAction(user)) {
      alert("No puedes eliminar tu propia cuenta ni el último admin activo.");
      return;
    }
    if (!confirm("¿Estás seguro de que deseas eliminar este usuario permanentemente?")) return;
    try {
      await api.deleteUser(user.id);
      refresh();
    } catch (err: any) {
      alert(err.message ?? "Error al eliminar usuario");
    }
  };

  // Handle sanction submit (ban/suspend/reject with reason)
  const handleSanctionSubmit = async () => {
    if (!sanctioningUser) return;
    if (isProtectedAdminAction(sanctioningUser)) {
      alert("No puedes bloquear tu propia cuenta ni dejar GateStack sin un admin activo.");
      return;
    }
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

  const handleCreateResetLink = async (user: User) => {
    try {
      const reset = await api.createPasswordResetLink(user.id);
      await navigator.clipboard.writeText(reset.reset_url);
      alert(`Link de reset copiado:\n${reset.reset_url}`);
      setOpenMenuUserId(null);
      refresh();
    } catch (err: any) {
      alert(err.message ?? "Error al generar link de reset");
    }
  };

  const handleForcePasswordReset = async (user: User, force: boolean) => {
    try {
      await api.forcePasswordReset(user.id, force);
      setOpenMenuUserId(null);
      refresh();
    } catch (err: any) {
      alert(err.message ?? "Error al actualizar reset obligatorio");
    }
  };

  const openSanctionModal = (user: User) => {
    setSanctioningUser(user);
    setSanctionStatus("suspended");
    setSanctionReason("");
    setOpenMenuUserId(null);
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
          const protectedAction = isProtectedAdminAction(user);
          
          const inheritedPermissions = new Set<string>();
          const activeTemplateId = selectedTemplate;
          if (activeTemplateId) {
            const template = templates.find((t) => t.id === activeTemplateId);
            if (template) {
              template.permissions.forEach((p) => inheritedPermissions.add(p));
            }
          }

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
                      {user.must_reset_password && <code className="warning-chip">Reset requerido</code>}
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

                <UserActionMenu
                  user={user}
                  isOpen={openMenuUserId === user.id}
                  protectedAction={protectedAction}
                  onToggle={() => setOpenMenuUserId((current) => (current === user.id ? null : user.id))}
                  onApprove={() => updateAccess(user, "approved")}
                  onReject={() => updateAccess(user, "rejected")}
                  onSuspend={() => openSanctionModal(user)}
                  onCreateResetLink={() => handleCreateResetLink(user)}
                  onForceReset={() => handleForcePasswordReset(user, true)}
                  onClearForceReset={() => handleForcePasswordReset(user, false)}
                  onDelete={() => handleDeleteUser(user)}
                />

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

                      const isAllowed = currentEffect === "allow" || (currentEffect === "default" && isDefaultGranted);
                      const isDenied = currentEffect === "deny" || (currentEffect === "default" && !isDefaultGranted);

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
                            <label 
                              className={`choice-label ${currentEffect === "default" ? "active" : ""}`}
                              onClick={() => {
                                if (currentEffect !== "default") {
                                  handleOverride("default");
                                }
                              }}
                            >
                              <input
                                type="radio"
                                name={`override-${user.id}-${perm.id}`}
                                checked={currentEffect === "default"}
                                readOnly
                              />
                              Heredar
                            </label>
                            <label 
                              className={`choice-label allow ${isAllowed ? "active" : ""}`}
                              onClick={() => {
                                if (currentEffect !== "allow") {
                                  handleOverride("allow");
                                }
                              }}
                            >
                              <input
                                type="radio"
                                name={`override-${user.id}-${perm.id}`}
                                checked={isAllowed}
                                readOnly
                              />
                              Permitir
                            </label>
                            <label 
                              className={`choice-label deny ${isDenied ? "active" : ""}`}
                              onClick={() => {
                                if (currentEffect !== "deny") {
                                  handleOverride("deny");
                                }
                              }}
                            >
                              <input
                                type="radio"
                                name={`override-${user.id}-${perm.id}`}
                                checked={isDenied}
                                readOnly
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
          const protectedAction = isProtectedAdminAction(user);

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
                      {user.must_reset_password && <p className="status-reason-tag reset-tag">Reset de contraseña requerido</p>}
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
                      
                      <UserActionMenu
                        user={user}
                        isOpen={openMenuUserId === user.id}
                        protectedAction={protectedAction}
                        onToggle={() => setOpenMenuUserId((current) => (current === user.id ? null : user.id))}
                        onApprove={() => handleActivateUser(user)}
                        onReject={() => updateAccess(user, "rejected")}
                        onSuspend={() => openSanctionModal(user)}
                        onCreateResetLink={() => handleCreateResetLink(user)}
                        onForceReset={() => handleForcePasswordReset(user, true)}
                        onClearForceReset={() => handleForcePasswordReset(user, false)}
                        onDelete={() => handleDeleteUser(user)}
                      />
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

function UserActionMenu({
  user,
  isOpen,
  protectedAction,
  onToggle,
  onApprove,
  onReject,
  onSuspend,
  onCreateResetLink,
  onForceReset,
  onClearForceReset,
  onDelete,
}: {
  user: User;
  isOpen: boolean;
  protectedAction: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSuspend: () => void;
  onCreateResetLink: () => void;
  onForceReset: () => void;
  onClearForceReset: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="action-menu-wrap">
      <button className="icon-action menu-trigger" onClick={onToggle} title="Acciones de usuario">
        <MoreHorizontal />
      </button>
      {isOpen && (
        <div className="action-menu">
          {user.status !== "approved" && (
            <button onClick={onApprove}>
              <CheckCircle2 />
              Dar de alta
            </button>
          )}
          {user.status === "approved" && (
            <>
              <button onClick={onReject} disabled={protectedAction}>
                <Eye />
                Dar de baja
              </button>
              <button onClick={onSuspend} disabled={protectedAction}>
                <ShieldX />
                Suspender con motivo
              </button>
            </>
          )}
          <button onClick={onCreateResetLink}>
            <KeyRound />
            Copiar URL de reset
          </button>
          {user.must_reset_password ? (
            <button onClick={onClearForceReset}>
              <ShieldCheck />
              Quitar reset obligatorio
            </button>
          ) : (
            <button onClick={onForceReset}>
              <KeyRound />
              Reset al iniciar sesión
            </button>
          )}
          <button className="danger-menu-item" onClick={onDelete} disabled={protectedAction}>
            <ShieldX />
            Eliminar usuario
          </button>
        </div>
      )}
    </div>
  );
}

