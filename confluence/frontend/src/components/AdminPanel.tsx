import React from "react";
import { Database, CheckCircle } from "lucide-react";

interface Space {
  id: string;
  name: string;
  key: string;
  description: string;
  is_restricted?: boolean;
  allowed_emails?: string;
  created_at: string;
}

interface Page {
  id: string;
  space_key: string;
  title: string;
  content: string;
  subtopics?: string;
  created_by_email: string;
  created_by_name: string;
  created_by_id: string;
  is_restricted: boolean;
  allowed_emails: string;
  created_at: string;
  updated_at: string;
}

interface AdminPanelProps {
  spaces: Space[];
  pages: Page[];
  onSeedData: () => void;
  seedLoading: boolean;
  seedSuccessMsg: string;
}

export default function AdminPanel({
  spaces,
  pages,
  onSeedData,
  seedLoading,
  seedSuccessMsg
}: AdminPanelProps) {
  return (
    <div className="subview">
      <div className="admin-view-header">
        <h1>Consola Administrativa de GateWiki</h1>
        <p>Gestión del sistema, espacios y políticas de información respaldadas por MySQL.</p>
      </div>

      <div className="admin-grid">
        <div className="card">
          <div className="card-header">
            <h2>Resumen del Sistema</h2>
          </div>
          <div className="admin-stats">
            <div className="admin-stat-item">
              <span>Total Espacios:</span>
              <strong>{spaces.length}</strong>
            </div>
            <div className="admin-stat-item">
              <span>Total Páginas Registradas:</span>
              <strong>{pages.length}</strong>
            </div>
            <div className="admin-stat-item">
              <span>Páginas con Restricción:</span>
              <strong>{pages.filter(p => p.is_restricted).length}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Acciones de Administración</h2>
          </div>
          <div className="admin-actions-panel">
            <p>Como administrador, puedes inicializar los datos semilla por defecto en tu servidor MySQL local para realizar demostraciones rápidas de los permisos.</p>
            <button className="btn-primary" onClick={onSeedData} disabled={seedLoading}>
              <Database size={16} />
              <span>{seedLoading ? "Inicializando..." : "Inicializar Datos Demostrativos"}</span>
            </button>
            {seedSuccessMsg && (
              <div className="success-alert alert-box" style={{ marginTop: "16px", background: "var(--color-success-glow)", border: "1px solid rgba(16,185,129,0.3)", color: "#34d399" }}>
                <CheckCircle size={16} />
                <span>{seedSuccessMsg}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
