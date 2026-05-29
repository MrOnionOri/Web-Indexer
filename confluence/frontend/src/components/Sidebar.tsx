import React from "react";
import { BookOpen, LayoutDashboard, Files, Plus, LogOut, Lock } from "lucide-react";

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

interface SidebarProps {
  currentUser: UserProfile;
  spaces: Space[];
  activeSpaceFilter: string | null;
  onSelectSpace: (key: string | null) => void;
  hasCreate: boolean;
  onAddSpaceClick: () => void;
  onLogout: () => void;
  currentView: string;
}

export default function Sidebar({
  currentUser,
  spaces,
  activeSpaceFilter,
  onSelectSpace,
  hasCreate,
  onAddSpaceClick,
  onLogout,
  currentView
}: SidebarProps) {
  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  };

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
            <span>Dashboard</span>
          </button>
          <button
            className={`nav-item ${currentView === "dashboard" && activeSpaceFilter === null ? "active" : ""}`}
            onClick={() => onSelectSpace(null)}
          >
            <Files size={18} />
            <span>Todas las páginas</span>
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-section-header">
            <span className="nav-section-title">Espacios</span>
            <button
              className="btn-icon"
              disabled={!hasCreate}
              onClick={onAddSpaceClick}
              title="Crear Espacio"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="spaces-list">
            <button
              className={`space-nav-btn ${activeSpaceFilter === null ? "active" : ""}`}
              onClick={() => onSelectSpace(null)}
            >
              <div className="space-nav-left">
                <span>📂 Todos los espacios</span>
              </div>
            </button>
            {spaces.map(s => (
              <button
                key={s.id}
                className={`space-nav-btn ${activeSpaceFilter === s.key ? "active" : ""}`}
                onClick={() => onSelectSpace(s.key)}
              >
                <div className="space-nav-left" style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%" }}>
                  <span className="space-nav-badge">{s.key}</span>
                  <span style={{ flex: 1, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{s.name}</span>
                  {s.is_restricted && <span title="Espacio Restringido" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}><Lock size={12} style={{ color: "var(--text-muted)" }} /></span>}
                </div>
              </button>
            ))}
          </div>
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
