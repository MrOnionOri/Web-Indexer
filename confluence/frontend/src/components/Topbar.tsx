import React from "react";
import { Search, PlusCircle, ShieldCheck, Sun, Moon } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  permissions: string[];
  is_platform_admin: boolean;
}

interface TopbarProps {
  currentUser: UserProfile;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  hasCreate: boolean;
  hasAdmin: boolean;
  onCreatePageClick: () => void;
  onAdminPanelClick: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export default function Topbar({
  currentUser,
  searchQuery,
  setSearchQuery,
  hasCreate,
  hasAdmin,
  onCreatePageClick,
  onAdminPanelClick,
  theme,
  onToggleTheme
}: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-search">
        <div className="search-wrapper">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar páginas o contenidos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="topbar-actions">
        <button
          className="btn-secondary btn-icon"
          onClick={onToggleTheme}
          title={theme === "light" ? "Cambiar a Modo Oscuro" : "Cambiar a Modo Claro"}
          style={{ width: "38px", height: "38px", padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="btn-primary" disabled={!hasCreate} onClick={onCreatePageClick}>
          <PlusCircle size={16} />
          <span>Crear Página</span>
        </button>
        {hasAdmin && (
          <button className="btn-secondary" onClick={onAdminPanelClick}>
            <ShieldCheck size={16} />
            <span>Consola Admin</span>
          </button>
        )}
      </div>
    </header>
  );
}
