import React from "react";
import { ArrowLeft, Lock, Globe, Edit3, Trash2 } from "lucide-react";

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
  created_by_email: string;
  created_by_name: string;
  created_by_id: string;
  is_restricted: boolean;
  allowed_emails: string;
  created_at: string;
  updated_at: string;
}

interface PageReadProps {
  currentUser: UserProfile;
  activePage: Page;
  onBackClick: () => void;
  onEditClick: () => void;
  onDeleteClick: (id: string) => void;
  hasEdit: boolean;
  hasDelete: boolean;
  renderMarkdown: (md: string) => React.ReactNode;
}

export default function PageRead({
  currentUser,
  activePage,
  onBackClick,
  onEditClick,
  onDeleteClick,
  hasEdit,
  hasDelete,
  renderMarkdown
}: PageReadProps) {
  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  };

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

  const isOwner = activePage.created_by_id === currentUser.id;

  return (
    <div className="subview">
      <button className="btn-back" onClick={onBackClick}>
        <ArrowLeft size={14} />
        <span>Volver al listado</span>
      </button>

      <article className="page-container">
        <div className="page-header">
          <div className="page-meta-row">
            <span className="space-badge">{activePage.space_key}</span>
            <span className={`page-privacy ${activePage.is_restricted ? "text-muted" : "text-success"}`}>
              {activePage.is_restricted ? <><Lock size={12} /> Restringido</> : <><Globe size={12} /> Público</>}
            </span>
          </div>
          <h1 className="page-title">{activePage.title}</h1>
          <div className="page-author-card">
            <div className="author-avatar">{getInitials(activePage.created_by_name)}</div>
            <div className="author-details">
              <span className="author-name">{activePage.created_by_name}</span>
              <span className="page-date">Creada el {formatDate(activePage.created_at)}</span>
            </div>
            <div className="page-actions-right">
              {(hasEdit || isOwner) && (
                <button className="btn-secondary" onClick={onEditClick}>
                  <Edit3 size={14} />
                  <span>Editar</span>
                </button>
              )}
              {(hasDelete || isOwner) && (
                <button className="btn-danger" onClick={() => onDeleteClick(activePage.id)}>
                  <Trash2 size={14} />
                  <span>Eliminar</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="page-content">
          {renderMarkdown(activePage.content)}
        </div>

        {activePage.is_restricted && (
          <div className="alert-box info-alert">
            <Lock size={18} />
            <div>
              <strong>Página Restringida:</strong> Esta página tiene límites de visibilidad. Solo puede ser vista por el creador y los siguientes correos:
              <span style={{ marginLeft: "8px", fontWeight: "bold" }}>{activePage.allowed_emails || currentUser.email}</span>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
