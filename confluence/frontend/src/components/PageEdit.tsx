import React, { FormEvent, useState, useMemo } from "react";
import { Save } from "lucide-react";

interface Space {
  id: string;
  name: string;
  key: string;
  description: string;
  is_restricted?: boolean;
  allowed_emails?: string;
  created_at: string;
}

interface UserListItem {
  email: string;
  full_name: string;
}

interface PageEditProps {
  editPageId: string | null;
  editPageTitle: string;
  setEditPageTitle: (val: string) => void;
  editPageSpace: string;
  setEditPageSpace: (val: string) => void;
  editPageContent: string;
  setEditPageContent: (val: string) => void;
  editPageIsRestricted: boolean;
  setEditPageIsRestricted: (val: boolean) => void;
  editPageAllowedEmails: string;
  setEditPageAllowedEmails: (val: string) => void;
  editPageCommentsAllowed: boolean;
  setEditPageCommentsAllowed: (val: boolean) => void;
  spaces: Space[];
  allUsers: UserListItem[];
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  insertMdTag: (tag: string) => void;
}

export default function PageEdit({
  editPageId,
  editPageTitle,
  setEditPageTitle,
  editPageSpace,
  setEditPageSpace,
  editPageContent,
  setEditPageContent,
  editPageIsRestricted,
  setEditPageIsRestricted,
  editPageAllowedEmails,
  setEditPageAllowedEmails,
  editPageCommentsAllowed,
  setEditPageCommentsAllowed,
  spaces,
  allUsers,
  onSubmit,
  onCancel,
  insertMdTag
}: PageEditProps) {
  const [searchText, setSearchText] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleAddEmail = (email: string) => {
    const emails = editPageAllowedEmails.split(",").map(em => em.trim()).filter(Boolean);
    if (email && !emails.map(em => em.toLowerCase()).includes(email.toLowerCase())) {
      const nextList = [...emails, email];
      setEditPageAllowedEmails(nextList.join(", "));
    }
    setSearchText("");
    setIsDropdownOpen(false);
  };

  const filteredUsers = useMemo(() => {
    const emails = editPageAllowedEmails.split(",").map(e => e.trim()).filter(Boolean);
    const unselected = allUsers.filter(u => !emails.map(e => e.toLowerCase()).includes(u.email.toLowerCase()));
    if (!searchText.trim()) return unselected;
    const q = searchText.toLowerCase();
    return unselected.filter(u =>
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  }, [allUsers, editPageAllowedEmails, searchText]);

  return (
    <div className="subview">
      <div className="edit-view-header">
        <h1>{editPageId ? "Editar Página de Conocimiento" : "Crear Nueva Página"}</h1>
        <p>Escribe tu contenido usando Markdown estructurado. Se guardará en la base de datos de MySQL.</p>
      </div>

      <form onSubmit={onSubmit} className="edit-form-card">
        <div className="form-row">
          <div className="form-group flex-2">
            <label>Título de la página</label>
            <input
              type="text"
              placeholder="Ej: Documentación de APIs de Autenticación"
              value={editPageTitle}
              onChange={(e) => setEditPageTitle(e.target.value)}
              required
            />
          </div>
          <div className="form-group flex-1">
            <label>Espacio Destino</label>
            <select
              value={editPageSpace}
              onChange={(e) => setEditPageSpace(e.target.value)}
              required
            >
              <option value="" disabled>Selecciona un espacio...</option>
              {spaces.map(s => (
                <option key={s.id} value={s.key}>[{s.key}] {s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Contenido (Markdown)</label>
          <div className="editor-container">
            <div className="editor-toolbar">
              <button type="button" className="toolbar-btn" onClick={() => insertMdTag("h1")}>H1</button>
              <button type="button" className="toolbar-btn" onClick={() => insertMdTag("h2")}>H2</button>
              <button type="button" className="toolbar-btn" onClick={() => insertMdTag("bold")}>B</button>
              <button type="button" className="toolbar-btn" onClick={() => insertMdTag("italic")}>I</button>
              <button type="button" className="toolbar-btn" onClick={() => insertMdTag("code")}>Code</button>
              <button type="button" className="toolbar-btn" onClick={() => insertMdTag("list")}>List</button>
              <select
                className="toolbar-select"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    insertMdTag(`code-block:${val}`);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>Bloque de código...</option>
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
                <option value="sql">SQL</option>
                <option value="bash">Bash / Shell</option>
                <option value="json">JSON</option>
                <option value="rust">Rust</option>
                <option value="go">Go</option>
              </select>
            </div>
            <textarea
              id="edit-page-content-input"
              rows={15}
              placeholder="Escribe aquí en formato Markdown..."
              value={editPageContent}
              onChange={(e) => setEditPageContent(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="restriction-section">
          <div className="restriction-toggle-container">
            <div className="toggle-control">
              <input
                type="checkbox"
                id="restrict-visibility-checkbox"
                checked={editPageIsRestricted}
                onChange={(e) => setEditPageIsRestricted(e.target.checked)}
              />
              <label htmlFor="restrict-visibility-checkbox"><strong>Restringir acceso a esta página</strong></label>
            </div>
            <p className="text-small text-muted">Si se activa, solo tú (el creador), los administradores de GateWiki y los usuarios autorizados de la lista podrán ver esta página.</p>
          </div>
          {editPageIsRestricted && (
            <div className="form-group" style={{ marginTop: "12px" }}>
              <label>Miembros Autorizados</label>
              
              <div className="allowed-emails-tags" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px", marginTop: "8px" }}>
                {(() => {
                  const emails = editPageAllowedEmails.split(",").map(e => e.trim()).filter(Boolean);
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
                            setEditPageAllowedEmails(nextList.join(", "));
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
                    id="custom-edit-page-email-input"
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

          <div className="restriction-toggle-container" style={{ marginTop: "16px", borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
            <div className="toggle-control">
              <input
                type="checkbox"
                id="allow-comments-checkbox"
                checked={editPageCommentsAllowed}
                onChange={(e) => setEditPageCommentsAllowed(e.target.checked)}
              />
              <label htmlFor="allow-comments-checkbox"><strong>Permitir comentarios en esta página</strong></label>
            </div>
            <p className="text-small text-muted">Si se activa, todos los usuarios con acceso a esta página podrán ver y escribir comentarios.</p>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            <Save size={16} />
            <span>Guardar Página</span>
          </button>
        </div>
      </form>
    </div>
  );
}
