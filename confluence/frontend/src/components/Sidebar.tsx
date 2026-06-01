import React from "react";
import { BookOpen, LayoutDashboard, FileText, Plus, LogOut, Lock, ListTree } from "lucide-react";
import { parseSubtopics } from "../subtopics";

interface Space {
  id: string;
  name: string;
  key: string;
  description: string;
  is_restricted?: boolean;
  allowed_emails?: string;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  permissions: string[];
  is_platform_admin: boolean;
}

interface Page {
  id: string;
  space_key: string;
  title: string;
  content: string;
  subtopics?: string;
  created_by_id: string;
  is_restricted: boolean;
}

interface SidebarProps {
  currentUser: UserProfile;
  spaces: Space[];
  pages: Page[];
  activeSpaceFilter: string | null;
  onSelectSpace: (key: string | null) => void;
  onReadPage: (id: string) => void;
  hasCreate: boolean;
  onAddSpaceClick: () => void;
  onLogout: () => void;
  currentView: string;
}

export default function Sidebar({
  currentUser,
  spaces,
  pages,
  activeSpaceFilter,
  onSelectSpace,
  onReadPage,
  hasCreate,
  onAddSpaceClick,
  onLogout,
  currentView
}: SidebarProps) {
  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  };

  const activeSpace = spaces.find(s => s.key === activeSpaceFilter);
  const activeSpacePages = activeSpaceFilter
    ? pages.filter(page => page.space_key === activeSpaceFilter)
    : [];
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-icon">
            <BookOpen size={20} />
          </div>
          <span className="logo-text">Gate<span>Wiki</span></span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <span className="nav-section-title">Navegación</span>
          <button
            className={`nav-item ${currentView === "dashboard" && activeSpaceFilter === null ? "active" : ""}`}
            onClick={() => onSelectSpace(null)}
          >
            <LayoutDashboard size={18} />
            <span>Hub de espacios</span>
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-section-header">
            <span className="nav-section-title">{activeSpace ? "Temas del espacio" : "Acciones"}</span>
            <button
              className="btn-icon"
              disabled={!hasCreate}
              onClick={onAddSpaceClick}
              title="Crear Espacio"
            >
              <Plus size={16} />
            </button>
          </div>

          {!activeSpace && (
            <div className="sidebar-empty-note">
              Abre un espacio desde el hub para ver sus temas y subtemas aquí.
            </div>
          )}

          {activeSpace && (
            <div className="topics-nav-list">
              <button
                className="space-nav-btn active"
                onClick={() => onSelectSpace(activeSpace.key)}
              >
                <div className="space-nav-left" style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%" }}>
                  <span className="space-nav-badge">{activeSpace.key}</span>
                  <span style={{ flex: 1, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{activeSpace.name}</span>
                  {activeSpace.is_restricted && <span title="Espacio Restringido" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}><Lock size={12} style={{ color: "var(--text-muted)" }} /></span>}
                </div>
              </button>

              {activeSpacePages.length === 0 ? (
                <div className="sidebar-empty-note">Este espacio aún no tiene temas.</div>
              ) : (
                activeSpacePages.map(page => (
                  <div key={page.id} className="topic-nav-group">
                    <button className="topic-nav-btn" onClick={() => onReadPage(page.id)}>
                      <FileText size={15} />
                      <span>{page.title}</span>
                      {page.is_restricted && <Lock size={11} />}
                    </button>
                    {parseSubtopics(page.subtopics).slice(0, 6).map((subtopic, index) => (
                      <button
                        key={`${page.id}-${index}`}
                        className="subtopic-nav-btn"
                        onClick={() => onReadPage(page.id)}
                      >
                        <ListTree size={12} />
                        <span>{subtopic.title}</span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </nav>


      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">{getInitials(currentUser.full_name)}</div>
          <div className="user-info">
            <span className="user-name">{currentUser.full_name}</span>
            <span className="user-email">{currentUser.email}</span>
          </div>
          <button className="btn-logout" onClick={onLogout} title="Cerrar Sesión">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
