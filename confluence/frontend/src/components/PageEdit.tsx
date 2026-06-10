import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import MarkdownEditor, { EditorMode } from "./MarkdownEditor";
import { parseSubtopics, serializeSubtopics, SubtopicItem } from "../subtopics";

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
  editPageSubtopics: string;
  setEditPageSubtopics: (val: string) => void;
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
}

export default function PageEdit({
  editPageId,
  editPageTitle,
  setEditPageTitle,
  editPageSpace,
  setEditPageSpace,
  editPageContent,
  setEditPageContent,
  editPageSubtopics,
  setEditPageSubtopics,
  editPageIsRestricted,
  setEditPageIsRestricted,
  editPageAllowedEmails,
  setEditPageAllowedEmails,
  editPageCommentsAllowed,
  setEditPageCommentsAllowed,
  spaces,
  allUsers,
  onSubmit,
  onCancel
}: PageEditProps) {
  const [searchText, setSearchText] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [contentMode, setContentMode] = useState<EditorMode>("split");
  const [subtopicMode, setSubtopicMode] = useState<EditorMode>("split");
  const [subtopicItems, setSubtopicDrafts] = useState<SubtopicItem[]>(() => parseSubtopics(editPageSubtopics));
  const [activeSubtopicIndex, setActiveSubtopicIndex] = useState(0);

  useEffect(() => {
    const parsed = parseSubtopics(editPageSubtopics);
    setSubtopicDrafts(parsed);
    setActiveSubtopicIndex(0);
  }, [editPageId]);

  const handleAddEmail = (email: string) => {
    const emails = editPageAllowedEmails.split(",").map(em => em.trim()).filter(Boolean);
    if (email && !emails.map(em => em.toLowerCase()).includes(email.toLowerCase())) {
      const nextList = [...emails, email];
      setEditPageAllowedEmails(nextList.join(", "));
    }
    setSearchText("");
    setIsDropdownOpen(false);
  };

  const setSubtopicItems = (items: SubtopicItem[], nextActiveIndex = activeSubtopicIndex) => {
    setSubtopicDrafts(items);
    setActiveSubtopicIndex(Math.max(0, Math.min(nextActiveIndex, Math.max(items.length - 1, 0))));
    setEditPageSubtopics(serializeSubtopics(items));
  };

  const addSubtopic = () => {
    const nextItems = [...subtopicItems, { title: "", content: "" }];
    setSubtopicItems(nextItems, nextItems.length - 1);
  };

  const updateSubtopic = (index: number, patch: Partial<SubtopicItem>) => {
    setSubtopicItems(
      subtopicItems.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item
      ),
      index
    );
  };

  const removeSubtopic = (index: number) => {
    const nextItems = subtopicItems.filter((_, currentIndex) => currentIndex !== index);
    setSubtopicItems(nextItems, index > 0 ? index - 1 : 0);
  };

  const moveSubtopic = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= subtopicItems.length) return;
    const nextItems = [...subtopicItems];
    [nextItems[index], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[index]];
    setSubtopicItems(nextItems, nextIndex);
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
  const activeSubtopic = subtopicItems[activeSubtopicIndex];
  return (
    <div className="subview">
      <div className="edit-view-header">
        <h1>{editPageId ? "Editar Página de Conocimiento" : "Crear Nueva Página"}</h1>
        <p>Crea o actualiza el contenido principal del tema dentro del workspace.</p>
      </div>

      <form onSubmit={onSubmit} className="edit-form-card">
        <div className="form-row">
          <div className="form-group flex-2">
            <label>Título del tema</label>
            <input
              type="text"
              placeholder="Ej: Server API"
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
          <label>Contenido principal del tema</label>
          <MarkdownEditor
            value={editPageContent}
            onChange={setEditPageContent}
            mode={contentMode}
            onModeChange={setContentMode}
            textareaId="edit-page-content-input"
            rows={15}
            placeholder="Escribe aqui en formato Markdown..."
            emptyTitle="Empieza tu pagina"
            emptyMessage="Escribe en Markdown y veras el resultado aqui en tiempo real."
          />
        </div>

        <div className="form-group subtopic-manager">
          <div className="subtopic-manager-header">
            <div>
              <label>Subtemas</label>
              <p className="input-helper">Crea subtemas del tema principal y ordenalos como indice de contenido.</p>
            </div>
            <button type="button" className="btn-secondary" onClick={addSubtopic}>
              <Plus size={14} />
              <span>Agregar subtema</span>
            </button>
          </div>

          {subtopicItems.length > 0 ? (
            <div className="subtopic-overview-list">
              {subtopicItems.map((subtopic, index) => (
                <div key={index} className={`subtopic-overview-item ${activeSubtopicIndex === index ? "active" : ""}`}>
                  <button type="button" className="subtopic-overview-main" onClick={() => setActiveSubtopicIndex(index)}>
                    <span className="subtopic-order">{index + 1}</span>
                    <span>{subtopic.title || `Subtema ${index + 1}`}</span>
                  </button>
                  <div className="subtopic-overview-actions">
                    <button type="button" className="btn-icon subtle" onClick={() => moveSubtopic(index, -1)} disabled={index === 0} title="Subir">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" className="btn-icon subtle" onClick={() => moveSubtopic(index, 1)} disabled={index === subtopicItems.length - 1} title="Bajar">
                      <ArrowDown size={14} />
                    </button>
                    <button type="button" className="btn-icon danger" onClick={() => removeSubtopic(index)} title="Eliminar subtema">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="subtopics-empty">Este tema todavia no tiene subtemas.</div>
          )}

          {activeSubtopic && (
            <div className="subtopic-detail-editor">
              <div className="form-group">
                <label>Titulo del subtema</label>
                <input
                  type="text"
                  placeholder="Ej: Configuracion"
                  value={activeSubtopic.title}
                  onChange={(e) => updateSubtopic(activeSubtopicIndex, { title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Contenido del subtema</label>
                <MarkdownEditor
                  value={activeSubtopic.content}
                  onChange={(content) => updateSubtopic(activeSubtopicIndex, { content })}
                  mode={subtopicMode}
                  onModeChange={setSubtopicMode}
                  rows={10}
                  placeholder="Escribe el contenido del subtema en Markdown..."
                  emptyTitle="Subtema vacio"
                  emptyMessage="Escribe en Markdown y veras el resultado aqui en tiempo real."
                />
              </div>
            </div>
          )}
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




