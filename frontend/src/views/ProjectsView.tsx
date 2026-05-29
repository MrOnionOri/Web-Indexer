import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { api, ProjectUpload } from "../api";
import { EmptyState, StatusBadge } from "../components/ui";

export function ProjectsView({
  projects,
  permissions,
  refresh,
}: {
  projects: ProjectUpload[];
  permissions: string[];
  refresh: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [reviewingProject, setReviewingProject] = useState<ProjectUpload | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const canReview = permissions.includes("projects:review");
  const canUpload = permissions.includes("projects:upload");

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      await api.uploadProject(file);
      refresh();
    } catch (err: any) {
      setUploadError(err.message ?? "Falló la subida del proyecto");
    } finally {
      setUploading(false);
    }
  };

  const handleReviewSubmit = async (status: "approved" | "review_failed") => {
    if (!reviewingProject) return;
    try {
      await api.reviewProject(reviewingProject.id, status, reviewNotes);
      setReviewingProject(null);
      setReviewNotes("");
      refresh();
    } catch (err: any) {
      alert(err.message ?? "Falló al guardar revisión");
    }
  };

  return (
    <div className="projects-layout">
      {canUpload && (
        <section className="table-surface upload-box">
          <h3>Subir código fuente (.zip)</h3>
          <p className="toolbar-note">Sube el código empaquetado para auditoría antes de levantarlo en producción.</p>
          <div className="dropzone-area">
            <UploadCloud size={36} />
            <span className="dropzone-text">{uploading ? "Subiendo archivo..." : "Haz clic para buscar tu archivo .zip"}</span>
            <input type="file" accept=".zip" onChange={handleFileChange} disabled={uploading} className="hidden-file-input" />
          </div>
          {uploadError && <p className="load-error">{uploadError}</p>}
        </section>
      )}

      <div className="table-surface">
        <h3>Historial de despliegues</h3>
        {projects.length === 0 && <EmptyState text="No hay proyectos registrados para revisión." />}
        {projects.map((project) => (
          <div className="row project-row-layout" key={project.id}>
            <div className="project-desc">
              <strong>{project.original_filename}</strong>
              <div className="project-meta-chips">
                <span className="stack-badge">{project.detected_stack ?? "Stack Desconocido"}</span>
                <small>{new Date(project.created_at).toLocaleString()}</small>
              </div>
              {project.review_notes && (
                <div className="review-notes-box">
                  <strong>Notas del auditor:</strong>
                  <pre>{project.review_notes}</pre>
                </div>
              )}
            </div>

            <div className="project-status-col">
              <StatusBadge value={project.status} />
              {project.status === "building" && <span className="status-pulse-dot"></span>}
              {project.status === "running" && <span className="status-active-dot"></span>}
            </div>

            <div className="project-action-col">
              {canReview && project.status === "pending_review" && (
                <button
                  className="secondary-action compact"
                  onClick={() => {
                    setReviewingProject(project);
                    setReviewNotes(project.review_notes ?? "");
                  }}
                >
                  Auditar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {reviewingProject && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h3>Auditoría del Proyecto</h3>
            <p>Verifica que el código no contenga exploits ni scripts inseguros.</p>
            
            <div className="modal-field">
              <strong>Stack Detectado:</strong> <code>{reviewingProject.detected_stack}</code>
            </div>

            <div className="modal-field">
              <label>Notas de revisión:</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Indica el resultado de tu revisión aquí..."
                rows={4}
              />
            </div>

            <div className="modal-buttons">
              <button className="primary success" onClick={() => handleReviewSubmit("approved")}>
                Aprobar y Desplegar
              </button>
              <button className="primary danger" onClick={() => handleReviewSubmit("review_failed")}>
                Rechazar
              </button>
              <button className="secondary-action" onClick={() => setReviewingProject(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

