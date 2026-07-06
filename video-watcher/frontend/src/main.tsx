import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, CheckCircle2, Eye, FileVideo, Loader2, Play, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { api, DatasetFeedback, FrameAIQuestion, JobListItem, ManualSegmentLabel, RegionSelection, Report, ReviewSession, TrainingDataset, TrainingDatasetChatMessage, TrainingDatasetEntry, UserProfile } from "./api";
import "./style.css";

function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sampleFps, setSampleFps] = useState(1);
  const [verifyWithLlm, setVerifyWithLlm] = useState(true);
  const [detectorMode, setDetectorMode] = useState("lightweight");
  const [viewMode, setViewMode] = useState<"upload" | "workbench" | "dataset">("workbench");
  const [datasetFeedback, setDatasetFeedback] = useState<DatasetFeedback[]>([]);
  const [datasetManualSegments, setDatasetManualSegments] = useState<ManualSegmentLabel[]>([]);
  const [trainingDatasets, setTrainingDatasets] = useState<TrainingDataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState("");
  const [activeVersionId, setActiveVersionId] = useState("");
  const [datasetEntries, setDatasetEntries] = useState<TrainingDatasetEntry[]>([]);
  const [projectContext, setProjectContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permissions = useMemo(() => new Set(user?.permissions || []), [user]);
  const canView = !!user?.is_platform_admin || permissions.has("video_watcher:view") || permissions.has("video_watcher:admin");
  const canAnalyze = !!user?.is_platform_admin || permissions.has("video_watcher:analyze") || permissions.has("video_watcher:admin");
  const canReview = canAnalyze || permissions.has("video_watcher:review");
  const canAskAi = canAnalyze || permissions.has("video_watcher:ask_ai");

  useEffect(() => {
    boot();
  }, []);

  async function boot() {
    try {
      const profile = await api.me();
      setUser(profile);
      if (profile.is_platform_admin || profile.permissions.includes("video_watcher:view") || profile.permissions.includes("video_watcher:admin")) {
        const canUpload = profile.is_platform_admin || profile.permissions.includes("video_watcher:analyze") || profile.permissions.includes("video_watcher:admin");
        setViewMode(canUpload ? "upload" : "workbench");
        await refreshJobs();
      } else {
        setAuthError("Acceso denegado: necesitas video_watcher:view.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Sesion invalida o sin conexion con GateStack.");
    }
  }

  async function refreshJobs() {
    const data = await api.jobs();
    setJobs(data);
    await refreshTrainingDatasets();
  }

  async function refreshTrainingDatasets() {
    const datasets = await api.trainingDatasets();
    setTrainingDatasets(datasets);
    const selectedDataset = datasets.find((dataset) => dataset.id === activeDatasetId) || datasets[0];
    if (selectedDataset) {
      setActiveDatasetId(selectedDataset.id);
      const selectedVersion = selectedDataset.versions.find((version) => version.id === activeVersionId) || selectedDataset.versions[0];
      if (selectedVersion) {
        setActiveVersionId(selectedVersion.id);
        setDatasetEntries(await api.trainingDatasetEntries(selectedDataset.id, selectedVersion.id));
      }
    } else {
      setActiveDatasetId("");
      setActiveVersionId("");
      setDatasetEntries([]);
    }
  }

  async function openDataset() {
    setViewMode("dataset");
    const [feedbackRows, manualRows] = await Promise.all([api.datasetFeedback(), api.datasetManualSegments(), refreshTrainingDatasets()]);
    setDatasetFeedback(feedbackRows);
    setDatasetManualSegments(manualRows);
  }

  async function openReport(jobId: string) {
    setError(null);
    const report = await api.report(jobId);
    setActiveReport(report);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.analyzeVideo(file, { sampleFps, verifyWithLlm, detectorMode, projectContext });
      setActiveReport(result.report);
      setViewMode("workbench");
      setFile(null);
      await refreshJobs();
    } catch (err: any) {
      setError(err.message || "No se pudo analizar el video.");
    } finally {
      setBusy(false);
    }
  }

  if (authError || !user || !canView) {
    return (
      <main className="auth-state">
        <div className="auth-panel">
          <ShieldCheck size={28} />
          <h1>Video Watcher</h1>
          <p>{authError || "Validando sesion con GateStack..."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Eye size={24} />
          <div>
            <strong>Video Watcher</strong>
            <span>Visual QA</span>
          </div>
        </div>
        <div className="user-card">
          <span>{user.full_name}</span>
          <small>{user.email}</small>
        </div>
        <button className="icon-button" onClick={refreshJobs} title="Refrescar corridas">
          <RefreshCw size={16} />
          Refrescar
        </button>
        {canAnalyze && (
          <button className="icon-button" onClick={() => setViewMode("upload")} title="Subir videos">
            <Upload size={16} />
            Subir videos
          </button>
        )}
        <button className="icon-button" onClick={() => setViewMode("workbench")} title="Review Workbench">
          <Eye size={16} />
          Workbench AI
        </button>
        <button className="icon-button" onClick={openDataset} title="Ver dataset de feedback">
          <CheckCircle2 size={16} />
          Dataset
        </button>
        <div className="job-list">
          {jobs.map((job) => (
            <button key={job.id} className="job-row" onClick={() => {
              setViewMode("workbench");
              openReport(job.id);
            }}>
              <FileVideo size={16} />
              <span>{job.original_filename}</span>
              <small>{job.status}</small>
            </button>
          ))}
          {jobs.length === 0 && <p className="empty-note">Sin analisis todavia.</p>}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewMode === "upload" ? "Carga de videos para analisis" : viewMode === "dataset" ? "Dataset de entrenamiento" : "Review Workbench AI"}</h1>
            <p>{viewMode === "upload" ? "Sube grabaciones para que el LLM proponga segmentos y evidencia inicial." : viewMode === "dataset" ? "Revisa las marcas humanas y variaciones que alimentan la MINI AI y el LLM." : "Pregunta al AI, corrige su output y etiqueta rangos/areas del video por sesion."}</p>
          </div>
          <div className="status-pill">
            <ShieldCheck size={16} />
            GateStack IAM
          </div>
        </header>

        {viewMode === "upload" && (
          <section className="analysis-band">
            <form className="upload-panel" onSubmit={submit}>
              <label className="dropzone">
                <Upload size={22} />
                <span>{file ? file.name : "Selecciona un video corto"}</span>
                <input type="file" accept="video/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              </label>
              <div className="controls-grid">
                <label>
                  FPS de muestreo
                  <input type="number" min="0.2" max="8" step="0.2" value={sampleFps} onChange={(event) => setSampleFps(Number(event.target.value))} />
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={verifyWithLlm} onChange={(event) => setVerifyWithLlm(event.target.checked)} />
                  Verificar con LLM
                </label>
              </div>
              <label>
                Estrategia de deteccion
                <select value={detectorMode} onChange={(event) => setDetectorMode(event.target.value)}>
                  <option value="lightweight">Detector ligero + LLM confirma</option>
                  <option value="llm_sweep">LLM revisa todo sin detector ligero</option>
                </select>
              </label>
              <label>
                Contexto del proyecto
                <textarea value={projectContext} onChange={(event) => setProjectContext(event.target.value)} placeholder="Ej: pantallas de TV en sucursal, dashboard esperado, errores conocidos..." />
              </label>
              <button className="primary-button" disabled={!file || busy || !canAnalyze}>
                {busy ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
                Analizar video
              </button>
              {!canAnalyze && <p className="error-line">Necesitas video_watcher:analyze para subir videos.</p>}
              {error && <p className="error-line">{error}</p>}
            </form>

            <div className="summary-strip">
              <Metric label="Videos" value={jobs.length} />
              <Metric label="Issues" value={jobs.reduce((sum, job) => sum + (job.summary?.verified_issues || 0), 0)} />
              <Metric label="Review" value={jobs.reduce((sum, job) => sum + (job.summary?.needs_human_review || 0), 0)} />
            </div>
          </section>
        )}

        {viewMode === "workbench" ? (
          <ReportView report={activeReport} user={user} canReview={canReview} canAskAi={canAskAi} onReload={() => {
            if (activeReport) return openReport(activeReport.job_id);
          }} trainingDatasets={trainingDatasets} activeDatasetId={activeDatasetId} activeVersionId={activeVersionId} />
        ) : viewMode === "dataset" ? (
          <DatasetLabView rows={datasetFeedback} manualSegments={datasetManualSegments} report={activeReport} trainingDatasets={trainingDatasets} activeDatasetId={activeDatasetId} activeVersionId={activeVersionId} datasetEntries={datasetEntries} onRefresh={openDataset} onDatasetsRefresh={refreshTrainingDatasets} onDatasetChange={async (datasetId, versionId) => {
            setActiveDatasetId(datasetId);
            setActiveVersionId(versionId);
            setDatasetEntries(datasetId && versionId ? await api.trainingDatasetEntries(datasetId, versionId) : []);
          }} />
        ) : null}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DatasetVersionSelector({
  datasets,
  activeDatasetId,
  activeVersionId,
  entries,
  onDatasetChange,
  onRefresh
}: {
  datasets: TrainingDataset[];
  activeDatasetId: string;
  activeVersionId: string;
  entries: TrainingDatasetEntry[];
  onDatasetChange: (datasetId: string, versionId: string) => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
}) {
  const [datasetName, setDatasetName] = useState("");
  const [versionName, setVersionName] = useState("");
  const activeDataset = datasets.find((dataset) => dataset.id === activeDatasetId);
  const activeVersion = activeDataset?.versions.find((version) => version.id === activeVersionId);

  async function createDataset() {
    if (!datasetName.trim()) return;
    const dataset = await api.createTrainingDataset({ name: datasetName.trim(), visibility: "private" });
    setDatasetName("");
    await onRefresh();
    const version = dataset.versions[0];
    if (version) await onDatasetChange(dataset.id, version.id);
  }

  async function createVersion() {
    if (!activeDataset || !versionName.trim()) return;
    const version = await api.createTrainingDatasetVersion(activeDataset.id, {
      version_name: versionName.trim(),
      description: "Reviewer-created working version."
    });
    setVersionName("");
    await onRefresh();
    await onDatasetChange(activeDataset.id, version.id);
  }

  return (
    <section className="dataset-selector-panel">
      <div className="dataset-selector-main">
        <label>
          Dataset activo
          <select value={activeDatasetId} onChange={(event) => {
            const dataset = datasets.find((item) => item.id === event.target.value);
            const version = dataset?.versions[0];
            onDatasetChange(dataset?.id || "", version?.id || "");
          }}>
            <option value="">Sin dataset</option>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
            ))}
          </select>
        </label>
        <label>
          Version activa
          <select value={activeVersionId} onChange={(event) => activeDataset && onDatasetChange(activeDataset.id, event.target.value)}>
            <option value="">Sin version</option>
            {(activeDataset?.versions || []).map((version) => (
              <option key={version.id} value={version.id}>{version.version_name} ({version.entry_count})</option>
            ))}
          </select>
        </label>
        <div className="dataset-version-meta">
          <strong>{activeDataset?.name || "No hay dataset seleccionado"}</strong>
          <span>{activeVersion ? `${activeVersion.version_name} · ${entries.length} ejemplos` : "Crea o selecciona una version para trabajar"}</span>
          {activeVersion?.focus_label && <span>Foco: {activeVersion.focus_label}</span>}
        </div>
      </div>
      <div className="dataset-create-row">
        <input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} placeholder="Nuevo dataset, ej. Pixelation tiendas" />
        <button className="small-button" onClick={createDataset}>Crear dataset</button>
        <input value={versionName} onChange={(event) => setVersionName(event.target.value)} placeholder="Nueva version, ej. v2-noisy" />
        <button className="small-button" onClick={createVersion} disabled={!activeDataset}>Crear version</button>
      </div>
    </section>
  );
}

function ReportView({
  report,
  user,
  canReview,
  canAskAi,
  trainingDatasets,
  activeDatasetId,
  activeVersionId,
  onReload
}: {
  report: Report | null;
  user: UserProfile;
  canReview: boolean;
  canAskAi: boolean;
  trainingDatasets: TrainingDataset[];
  activeDatasetId: string;
  activeVersionId: string;
  onReload: () => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameShellRef = useRef<HTMLDivElement | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ReviewSession | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [region, setRegion] = useState<RegionSelection | null>(null);
  const [regionDraft, setRegionDraft] = useState<RegionSelection | null>(null);
  const [selectingRegion, setSelectingRegion] = useState(false);
  const [regionStart, setRegionStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!report) {
      setActiveSession(null);
      return;
    }
    setActiveSession(report.review_sessions?.find((session) => session.reviewer_user_id === user.id && session.status === "active") || null);
  }, [report, user.id]);

  function jumpTo(timestamp: number | null | undefined) {
    if (timestamp === null || timestamp === undefined || !videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, timestamp - 0.75);
    videoRef.current.play().catch(() => {});
  }

  if (!report) {
    return (
      <section className="report-empty workbench-empty">
        <AlertTriangle size={22} />
        <span>Selecciona un video de la lista izquierda para abrir tu workbench de revision.</span>
      </section>
    );
  }

  const selectedEvent = report.candidate_events.find(
    (event) => event.event_id === (selectedEventId || report.issues[0]?.candidate_event_id || report.candidate_events[0]?.event_id)
  );
  const activeDataset = trainingDatasets.find((dataset) => dataset.id === activeDatasetId);
  const activeVersion = activeDataset?.versions.find((version) => version.id === activeVersionId);

  async function startReviewSession() {
    if (!report) return;
    setStartingSession(true);
    try {
      const session = await api.createReviewSession(report.job_id, { notes: "" });
      setActiveSession(session);
      await onReload();
    } finally {
      setStartingSession(false);
    }
  }

  function normalizedPoint(event: React.PointerEvent<HTMLDivElement>) {
    const rect = frameShellRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
  }

  function beginRegionSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!selectingRegion) return;
    const point = normalizedPoint(event);
    setRegionStart(point);
    setRegionDraft({ x: point.x, y: point.y, width: 0.01, height: 0.01 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveRegionSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!selectingRegion || !regionStart) return;
    const point = normalizedPoint(event);
    setRegionDraft({
      x: Math.min(regionStart.x, point.x),
      y: Math.min(regionStart.y, point.y),
      width: Math.max(0.01, Math.abs(point.x - regionStart.x)),
      height: Math.max(0.01, Math.abs(point.y - regionStart.y))
    });
  }

  function finishRegionSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!selectingRegion || !regionDraft) return;
    setRegion(regionDraft);
    setRegionStart(null);
    setSelectingRegion(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section className="report-panel workbench-panel">
      <div className="report-header">
        <div>
          <h2>{report.input_file}</h2>
          <p className="active-dataset-note">{activeDataset && activeVersion ? `Destino activo: ${activeDataset.name} / ${activeVersion.version_name}` : "Sin dataset activo: las anotaciones se guardan solo en la sesion."}</p>
          <p>{report.status} · {new Date(report.created_at).toLocaleString()}</p>
        </div>
        <div className="report-metrics">
          <Metric label="LLM propuso" value={report.summary.total_candidate_events} />
          <Metric label="Anotaciones" value={report.segment_annotations?.length || 0} />
          <Metric label="Reviewers" value={report.review_sessions?.length || 0} />
        </div>
      </div>

      <div className="video-review-layout">
        <section className="video-panel">
          <div
            ref={frameShellRef}
            className={`video-frame-shell ${selectingRegion ? "selecting-region" : ""}`}
            onPointerDown={beginRegionSelection}
            onPointerMove={moveRegionSelection}
            onPointerUp={finishRegionSelection}
            onPointerCancel={finishRegionSelection}
          >
            <video ref={videoRef} className="review-video" src={api.videoUrl(report.job_id)} controls preload="metadata" />
            {(regionDraft || region) && (
              <div
                className="frame-region-box"
                style={regionStyle(regionDraft || region)}
              />
            )}
          </div>
          <div className="review-session-strip">
            <div>
              <strong>{activeSession ? `Sesion de ${activeSession.reviewer_name}` : "Sin sesion de revision activa"}</strong>
              <span>{report.review_sessions?.length || 0} sesiones en este video</span>
            </div>
            <button className="feedback-save" onClick={startReviewSession} disabled={!canReview || startingSession}>
              {activeSession ? "Continuar sesion" : startingSession ? "Abriendo..." : "Abrir mi sesion"}
            </button>
          </div>
          <ManualSegmentEditor
            report={report}
            videoRef={videoRef}
            activeSession={activeSession}
            canReview={canReview}
            canAskAi={canAskAi}
            region={region}
            activeDatasetId={activeDatasetId}
            activeVersionId={activeVersionId}
            onRegionMode={() => setSelectingRegion(true)}
            onClearRegion={() => {
              setRegion(null);
              setRegionDraft(null);
              setSelectingRegion(false);
            }}
            onSaved={onReload}
          />
        </section>
        <section className="segment-panel ai-review-panel">
          <div className="segment-header">
            <h3>AI y revision humana</h3>
            <span>{report.candidate_events.length}</span>
          </div>
          {activeSession && (
            <div className="active-session-card">
              <strong>Tu sesion activa</strong>
              <span>{activeSession.reviewer_name}</span>
            </div>
          )}
          <div className="segment-list">
            {report.candidate_events.map((event) => (
              <button className={`segment-row ${selectedEvent?.event_id === event.event_id ? "selected-event" : ""}`} key={event.event_id} onClick={() => {
                setSelectedEventId(event.event_id);
                jumpTo(event.center_timestamp);
              }}>
                <strong>{event.issue_type_guess}</strong>
                <span>{event.first_timestamp.toFixed(2)}s - {event.last_timestamp.toFixed(2)}s</span>
                <small>{event.description}</small>
                {event.ai_output && (
                  <em>{String(event.ai_output.issue_type || "AI")} · {String(event.ai_output.severity || "sin severidad")}</em>
                )}
              </button>
            ))}
            {report.candidate_events.length === 0 && <p className="empty-note">Sin propuestas AI iniciales. Puedes preguntar al AI desde el video y guardar tu correccion.</p>}
          </div>
          {report.frame_ai_questions?.length > 0 && (
            <div className="ai-question-list">
              <h4>Preguntas AI guardadas</h4>
              {report.frame_ai_questions.slice(-6).reverse().map((question) => (
                <button className="ai-question-row" key={question.id} onClick={() => jumpTo(question.timestamp)}>
                  <strong>{question.human_label || String(question.ai_output?.detected_issue || "AI")}</strong>
                  <span>{question.timestamp.toFixed(2)}s · {question.created_by_name}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="columns workbench-secondary">
        <div>
          <h3>Issues</h3>
          {report.issues.map((issue) => (
            <article className="issue-card clickable-card" key={issue.issue_id} onClick={() => {
              setSelectedEventId(issue.candidate_event_id);
              jumpTo(issue.timestamp);
            }}>
              <div>
                <strong>{issue.issue_type}</strong>
                <span className={`severity severity-${issue.severity}`}>{issue.severity}</span>
              </div>
              <p>{issue.reason}</p>
              <small>{issue.timestamp !== null ? `${issue.timestamp.toFixed(2)}s` : "sin timestamp"}</small>
            </article>
          ))}
          {report.issues.length === 0 && <p className="empty-note">No hay issues verificados.</p>}
        </div>
        <div>
          <h3>Eventos candidatos</h3>
          {report.candidate_events.map((event) => (
            <article className={`event-card compact-event clickable-card ${selectedEvent?.event_id === event.event_id ? "selected-event" : ""}`} key={event.event_id} onClick={() => {
              setSelectedEventId(event.event_id);
              jumpTo(event.center_timestamp);
            }}>
              <div>
                <CheckCircle2 size={15} />
                <strong>{event.issue_type_guess}</strong>
              </div>
              <p>{event.description}</p>
              <small>{event.center_timestamp.toFixed(2)}s · confianza {(event.max_confidence * 100).toFixed(0)}%</small>
            </article>
          ))}
          {report.candidate_events.length === 0 && <p className="empty-note">El detector no encontro eventos sospechosos.</p>}
        </div>
      </div>

      <section className="manual-segments-panel">
        <div className="segment-header">
          <h3>Anotaciones por sesion</h3>
          <span>{report.segment_annotations?.length || 0}</span>
        </div>
        {report.annotation_consensus?.length > 0 && (
          <div className="consensus-strip">
            {report.annotation_consensus.map((item) => (
              <button className="consensus-pill" key={item.label} onClick={() => jumpTo(item.first_timestamp)}>
                <strong>{item.label}</strong>
                <span>{item.reviewer_count} reviewers · {item.annotation_count} marcas</span>
              </button>
            ))}
          </div>
        )}
        <div className="manual-segment-list">
          {(report.segment_annotations || []).map((annotation) => (
            <button className="manual-segment-row annotation-row" key={annotation.id} onClick={() => jumpTo(annotation.start_timestamp)}>
              <strong>{annotation.label}</strong>
              <span>{annotation.start_timestamp.toFixed(2)}s - {annotation.end_timestamp.toFixed(2)}s</span>
              <small>{annotation.created_by_name} · {annotation.temporal_scope} · {targetLabel(annotation.training_target)}</small>
              {annotation.human_reason && <p>{annotation.human_reason}</p>}
            </button>
          ))}
          {(report.manual_segments || []).map((segment) => (
            <button className="manual-segment-row" key={segment.id} onClick={() => jumpTo(segment.start_timestamp)}>
              <strong>{segment.label}</strong>
              <span>{segment.start_timestamp.toFixed(2)}s - {segment.end_timestamp.toFixed(2)}s</span>
              <small>Alimenta: {targetLabel(segment.training_target)} · {segment.created_by_name}</small>
              {segment.notes && <p>{segment.notes}</p>}
            </button>
          ))}
          {(!report.segment_annotations || report.segment_annotations.length === 0) && (!report.manual_segments || report.manual_segments.length === 0) && (
            <p className="empty-note">Sin anotaciones guardadas para esta corrida.</p>
          )}
        </div>
      </section>

      {selectedEvent && (
        <section className="selected-detail">
          <div className="selected-detail-header">
            <div>
              <h3>Detalle del candidato seleccionado</h3>
              <p>{selectedEvent.issue_type_guess} · {selectedEvent.center_timestamp.toFixed(2)}s</p>
            </div>
            <button className="feedback-save" onClick={() => jumpTo(selectedEvent.center_timestamp)}>Ver en video</button>
          </div>
          <p>{selectedEvent.description}</p>
          <AiOutputBlock output={selectedEvent.ai_output} />
          <FeedbackControls event={selectedEvent} onSaved={onReload} />
        </section>
      )}
    </section>
  );
}

function ManualSegmentEditor({
  report,
  videoRef,
  activeSession,
  canReview,
  canAskAi,
  region,
  activeDatasetId,
  activeVersionId,
  onRegionMode,
  onClearRegion,
  onSaved
}: {
  report: Report;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  activeSession: ReviewSession | null;
  canReview: boolean;
  canAskAi: boolean;
  region: RegionSelection | null;
  activeDatasetId: string;
  activeVersionId: string;
  onRegionMode: () => void;
  onClearRegion: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentSecond, setCurrentSecond] = useState(0);
  const [dragMode, setDragMode] = useState<"start" | "end" | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(3);
  const [loopSelection, setLoopSelection] = useState(false);
  const [label, setLabel] = useState("BLACK_SCREEN");
  const [trainingTarget, setTrainingTarget] = useState("both");
  const [temporalScope, setTemporalScope] = useState("segment");
  const [questionText, setQuestionText] = useState("Que error visual detectas aqui?");
  const [lastAiQuestion, setLastAiQuestion] = useState<FrameAIQuestion | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fallbackDuration = Math.max(
    1,
    end,
    ...report.candidate_events.map((event) => event.last_timestamp),
    ...(report.manual_segments || []).map((segment) => segment.end_timestamp),
    ...(report.segment_annotations || []).map((annotation) => annotation.end_timestamp)
  );
  const timelineDuration = duration || fallbackDuration;
  const selectedStart = Math.min(start, end);
  const selectedEnd = Math.max(start, end);
  const selectedLeft = (selectedStart / timelineDuration) * 100;
  const selectedWidth = Math.max(0.5, ((selectedEnd - selectedStart) / timelineDuration) * 100);
  const currentLeft = Math.min(100, (currentSecond / timelineDuration) * 100);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const syncDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
        setEnd((value) => Math.min(value, video.duration));
      }
    };
    const syncCurrent = () => {
      const nextCurrent = video.currentTime || 0;
      setCurrentSecond(nextCurrent);
      if (loopSelection && selectedEnd > selectedStart && nextCurrent >= selectedEnd) {
        video.currentTime = selectedStart;
        video.play().catch(() => {});
      }
    };
    syncDuration();
    video.addEventListener("loadedmetadata", syncDuration);
    video.addEventListener("durationchange", syncDuration);
    video.addEventListener("timeupdate", syncCurrent);
    video.addEventListener("seeked", syncCurrent);
    return () => {
      video.removeEventListener("loadedmetadata", syncDuration);
      video.removeEventListener("durationchange", syncDuration);
      video.removeEventListener("timeupdate", syncCurrent);
      video.removeEventListener("seeked", syncCurrent);
    };
  }, [videoRef, loopSelection, selectedStart, selectedEnd]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !loopSelection || selectedEnd <= selectedStart) return;
    if (video.currentTime < selectedStart || video.currentTime >= selectedEnd) {
      video.currentTime = selectedStart;
    }
    video.play().catch(() => {});
  }, [videoRef, loopSelection, selectedStart, selectedEnd]);

  function currentTime() {
    return Number((videoRef.current?.currentTime || 0).toFixed(2));
  }

  function clampTime(value: number) {
    return Math.min(Math.max(0, value), timelineDuration);
  }

  function timeFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clampTime(((event.clientX - rect.left) / rect.width) * timelineDuration);
  }

  function updateDrag(mode: "start" | "end", time: number) {
    const next = clampTime(Number(time.toFixed(2)));
    setLoopSelection(true);
    if (mode === "start") {
      setStart(Math.min(next, selectedEnd - 0.1));
    } else {
      setEnd(Math.max(next, selectedStart + 0.1));
    }
  }

  function beginTimelineDrag(event: React.PointerEvent<HTMLDivElement>) {
    const time = timeFromPointer(event);
    const startDistance = Math.abs(time - selectedStart);
    const endDistance = Math.abs(time - selectedEnd);
    const handleWindow = Math.max(0.75, timelineDuration * 0.015);
    let mode: "start" | "end" = "end";
    if (startDistance < endDistance && startDistance <= handleWindow) {
      mode = "start";
    } else if (endDistance <= handleWindow) {
      mode = "end";
    } else {
      setStart(time);
      setEnd(Math.min(timelineDuration, time + Math.min(3, timelineDuration)));
      setLoopSelection(true);
    }
    setDragMode(mode);
    event.currentTarget.setPointerCapture(event.pointerId);
    updateDrag(mode, time);
  }

  function moveTimelineDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragMode) return;
    updateDrag(dragMode, timeFromPointer(event));
  }

  function finishTimelineDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragMode) return;
    setDragMode(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
    playSelectionLoop();
  }

  function seekTo(time: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = clampTime(time);
  }

  function playSelectionLoop() {
    if (!videoRef.current) return;
    setLoopSelection(true);
    videoRef.current.currentTime = selectedStart;
    videoRef.current.play().catch(() => {});
  }

  function clearSelectionLoop() {
    setLoopSelection(false);
    setStart(0);
    setEnd(Math.min(3, timelineDuration));
  }

  async function saveManualSegment() {
    if (!activeSession) {
      setMessage("Abre tu sesion de revision antes de guardar.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api.createAnnotation(activeSession.id, {
        start_timestamp: selectedStart,
        end_timestamp: selectedEnd,
        label,
        temporal_scope: temporalScope,
        training_target: trainingTarget,
        region,
        llm_output: lastAiQuestion?.ai_output || null,
        human_reason: notes,
        dataset_id: activeDatasetId || null,
        dataset_version_id: activeVersionId || null
      });
      setNotes("");
      setMessage("Anotacion guardada en tu sesion.");
      await onSaved();
    } catch (err: any) {
      setMessage(err.message || "No se pudo guardar la anotacion.");
    } finally {
      setSaving(false);
    }
  }

  async function askAi() {
    if (!activeSession) {
      setMessage("Abre tu sesion de revision antes de preguntar al AI.");
      return;
    }
    setAsking(true);
    setMessage(null);
    try {
      const response = await api.askAi(activeSession.id, {
        timestamp: currentTime(),
        start_timestamp: selectedStart,
        end_timestamp: selectedEnd,
        question: questionText,
        region,
        human_label: label,
        human_reason: notes,
        training_target: trainingTarget,
        dataset_id: activeDatasetId || null,
        dataset_version_id: activeVersionId || null
      });
      setLastAiQuestion(response);
      setMessage("AI respondio; puedes guardar esta salida con tu correccion.");
      await onSaved();
    } catch (err: any) {
      setMessage(err.message || "No se pudo preguntar al AI.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="manual-editor">
      <div className="manual-editor-header">
        <strong>Analizar frame o rango</strong>
        <span>{activeSession ? (activeDatasetId && activeVersionId ? "Guardara en dataset/version activos" : "Sin dataset activo: se guarda solo en la sesion") : "Abre una sesion para guardar"}</span>
      </div>
      <div
        ref={timelineRef}
        className="manual-timeline"
        onPointerDown={beginTimelineDrag}
        onPointerMove={moveTimelineDrag}
        onPointerUp={finishTimelineDrag}
        onPointerCancel={finishTimelineDrag}
      >
        <div className="timeline-track" />
        <div className="timeline-selection" style={{ left: `${selectedLeft}%`, width: `${selectedWidth}%` }} />
        <button
          type="button"
          className="timeline-handle timeline-handle-start"
          style={{ left: `${selectedLeft}%` }}
          aria-label="Inicio del fragmento"
          onClick={(event) => event.stopPropagation()}
        />
        <button
          type="button"
          className="timeline-handle timeline-handle-end"
          style={{ left: `${selectedLeft + selectedWidth}%` }}
          aria-label="Fin del fragmento"
          onClick={(event) => event.stopPropagation()}
        />
        <div className="timeline-playhead" style={{ left: `${currentLeft}%` }} />
        {report.candidate_events.map((event) => (
          <button
            type="button"
            className="timeline-marker timeline-marker-candidate"
            key={event.event_id}
            style={{ left: `${Math.min(100, (event.center_timestamp / timelineDuration) * 100)}%` }}
            title={`${event.issue_type_guess} ${event.center_timestamp.toFixed(2)}s`}
            onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              seekTo(event.center_timestamp);
            }}
          />
        ))}
        {(report.manual_segments || []).map((segment) => (
          <button
            type="button"
            className="timeline-marker timeline-marker-manual"
            key={segment.id}
            style={{ left: `${Math.min(100, (segment.start_timestamp / timelineDuration) * 100)}%` }}
            title={`${segment.label} ${segment.start_timestamp.toFixed(2)}s`}
            onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              seekTo(segment.start_timestamp);
            }}
          />
        ))}
        {(report.segment_annotations || []).map((annotation) => (
          <button
            type="button"
            className="timeline-marker timeline-marker-annotation"
            key={annotation.id}
            style={{ left: `${Math.min(100, (annotation.start_timestamp / timelineDuration) * 100)}%` }}
            title={`${annotation.label} ${annotation.start_timestamp.toFixed(2)}s por ${annotation.created_by_name}`}
            onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              seekTo(annotation.start_timestamp);
            }}
          />
        ))}
      </div>
      <div className="timeline-meta">
        <span>{formatTime(selectedStart)} - {formatTime(selectedEnd)}</span>
        <span>Duracion {formatTime(selectedEnd - selectedStart)}</span>
      </div>
      <div className="selection-actions">
        <button type="button" className="small-button" onClick={playSelectionLoop}>
          {loopSelection ? "Reproduciendo rango" : "Reproducir rango"}
        </button>
        <button type="button" className="small-button" onClick={clearSelectionLoop}>Limpiar seleccion</button>
        <span>{loopSelection ? "Loop activo hasta limpiar seleccion" : "Selecciona un rango para revisar en bucle"}</span>
      </div>
      <div className="manual-editor-grid">
        <label>
          Inicio
          <div className="time-input-row">
            <input type="number" min="0" step="0.01" value={selectedStart.toFixed(2)} onChange={(event) => {
              setLoopSelection(true);
              setStart(Math.min(clampTime(Number(event.target.value)), selectedEnd - 0.1));
            }} />
            <button type="button" className="small-button" onClick={() => {
              setLoopSelection(true);
              setStart(Math.min(currentTime(), selectedEnd - 0.1));
            }}>Actual</button>
          </div>
        </label>
        <label>
          Fin
          <div className="time-input-row">
            <input type="number" min="0" step="0.01" value={selectedEnd.toFixed(2)} onChange={(event) => {
              setLoopSelection(true);
              setEnd(Math.max(clampTime(Number(event.target.value)), selectedStart + 0.1));
            }} />
            <button type="button" className="small-button" onClick={() => {
              setLoopSelection(true);
              setEnd(Math.max(currentTime(), selectedStart + 0.1));
            }}>Actual</button>
          </div>
        </label>
        <label>
          Categoria
          <select value={label} onChange={(event) => setLabel(event.target.value)}>
            <option value="BLACK_SCREEN">BLACK_SCREEN</option>
            <option value="PIXELATION">PIXELATION</option>
            <option value="NO_ISSUE">NO_ISSUE</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
        </label>
        <label>
          Tipo
          <select value={temporalScope} onChange={(event) => setTemporalScope(event.target.value)}>
            <option value="segment">Error por rango</option>
            <option value="frame">Frame puntual</option>
            <option value="video">Video completo</option>
          </select>
        </label>
      </div>
      <div className="manual-editor-grid training-grid">
        <label>
          Alimentar
          <select value={trainingTarget} onChange={(event) => setTrainingTarget(event.target.value)}>
            <option value="both">MINI AI + LLM</option>
            <option value="mini_ai">Solo MINI AI</option>
            <option value="llm">Solo LLM</option>
          </select>
        </label>
      </div>
      <div className="region-actions">
        <button type="button" className="small-button region-button" onClick={onRegionMode}>Seleccionar area del frame</button>
        <button type="button" className="small-button region-button" onClick={onClearRegion}>Limpiar area</button>
        <span>{region ? `Area ${(region.width * 100).toFixed(0)}% x ${(region.height * 100).toFixed(0)}%` : "Sin area seleccionada"}</span>
      </div>
      <label className="human-explanation-box">
        Explicacion del usuario
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Que error es, por que esta mal/bien lo que dijo la AI, y que debe aprender..." />
      </label>
      <div className="workbench-actions">
        <button className="feedback-save" onClick={saveManualSegment} disabled={!canReview || !activeSession || saving}>
          {saving ? "Guardando..." : "Guardar anotacion"}
        </button>
      </div>
      {message && <small className="feedback-message">{message}</small>}
      <section className="range-ai-chat">
        <div className="dataset-chat-header">
          <strong>Chat AI del rango</strong>
          <span>{activeSession ? `${formatTime(selectedStart)} - ${formatTime(selectedEnd)}` : "Abre una sesion para preguntar"}</span>
        </div>
        <div className="dataset-chat-log range-ai-chat-log">
          {report.frame_ai_questions?.slice(-5).reverse().map((question) => (
            <React.Fragment key={question.id}>
              <article className="dataset-chat-message user-message">
                <strong>{question.created_by_name}</strong>
                <p>{question.question}</p>
                <small>{formatTime(question.start_timestamp ?? question.timestamp)} - {formatTime(question.end_timestamp ?? question.timestamp)}</small>
              </article>
              <article className="dataset-chat-message assistant-message">
                <strong>AI</strong>
                <p>{summarizeAiOutput(question.ai_output)}</p>
                <AiOutputBlock output={question.ai_output} />
              </article>
            </React.Fragment>
          ))}
          {report.frame_ai_questions?.length === 0 && !lastAiQuestion && (
            <p className="empty-note">Preguntale que ve en este frame/rango, si detecta black screen, pixelation o si no hay issue.</p>
          )}
          {lastAiQuestion && !report.frame_ai_questions?.some((question) => question.id === lastAiQuestion.id) && (
            <>
              <article className="dataset-chat-message user-message">
                <strong>{lastAiQuestion.created_by_name}</strong>
                <p>{lastAiQuestion.question}</p>
              </article>
              <article className="dataset-chat-message assistant-message">
                <strong>AI</strong>
                <p>{summarizeAiOutput(lastAiQuestion.ai_output)}</p>
                <AiOutputBlock output={lastAiQuestion.ai_output} />
              </article>
            </>
          )}
        </div>
        <div className="range-ai-compose">
          <input value={questionText} onChange={(event) => setQuestionText(event.target.value)} placeholder="Preguntale a la AI que ve o por que esta mal..." />
          <button className="feedback-save" onClick={askAi} disabled={!canAskAi || !activeSession || asking || !questionText.trim()}>
            {asking ? "Preguntando..." : "Enviar"}
          </button>
        </div>
      </section>
    </div>
  );
}

function DatasetMiniChat({
  report,
  activeSession,
  datasetId,
  versionId,
  startTimestamp,
  endTimestamp,
  labelHint
}: {
  report: Report | null;
  activeSession: ReviewSession | null;
  datasetId: string;
  versionId: string;
  startTimestamp?: number | null;
  endTimestamp?: number | null;
  labelHint?: string | null;
}) {
  const [messages, setMessages] = useState<TrainingDatasetChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const canChat = !!datasetId && !!versionId;

  useEffect(() => {
    if (!datasetId || !versionId) {
      setMessages([]);
      return;
    }
    api.trainingDatasetChat(datasetId, versionId).then(setMessages).catch(() => setMessages([]));
  }, [datasetId, versionId]);

  async function sendMessage() {
    if (!canChat || !message.trim()) return;
    setSaving(true);
    try {
      const newMessages = await api.sendTrainingDatasetChat(datasetId, versionId, {
        message: message.trim(),
        job_id: report?.job_id || null,
        review_session_id: activeSession?.id || null,
        start_timestamp: startTimestamp,
        end_timestamp: endTimestamp,
        label_hint: labelHint || null,
        save_important: true
      });
      setMessages((current) => [...current, ...newMessages]);
      setMessage("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dataset-chat">
      <div className="dataset-chat-header">
        <strong>Chat para limpiar dataset</strong>
        <span>{canChat ? "La AI sanitiza y guarda lo importante" : "Selecciona dataset/version"}</span>
      </div>
      <div className="dataset-chat-log">
        {messages.slice(-8).map((item) => (
          <article className={`dataset-chat-message ${item.role === "assistant" ? "assistant-message" : "user-message"}`} key={item.id}>
            <strong>{item.role === "assistant" ? "AI" : item.created_by_name}</strong>
            <p>{item.content}</p>
            {item.saved_entry_id && <small>Guardado en dataset</small>}
          </article>
        ))}
        {messages.length === 0 && <p className="empty-note">Explica aqui por que esta mal, que ve la AI, o que debe aprender este dataset.</p>}
      </div>
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ej: Esto NO es pixelation; es motion blur por movimiento rapido. Guardalo como caso negativo para pixelation..." />
      <button className="feedback-save" onClick={sendMessage} disabled={!canChat || saving || !message.trim()}>
        {saving ? "Sanitizando..." : "Enviar al chat AI"}
      </button>
    </section>
  );
}

function regionStyle(region: RegionSelection | null): React.CSSProperties {
  if (!region) return {};
  return {
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.width * 100}%`,
    height: `${region.height * 100}%`
  };
}

function formatTime(value: number) {
  const safe = Math.max(0, value);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function targetLabel(target: string) {
  if (target === "mini_ai") return "MINI AI";
  if (target === "llm") return "LLM";
  return "MINI AI + LLM";
}

function DatasetLabView({
  rows,
  manualSegments,
  report,
  trainingDatasets,
  activeDatasetId,
  activeVersionId,
  datasetEntries,
  onRefresh,
  onDatasetsRefresh,
  onDatasetChange
}: {
  rows: DatasetFeedback[];
  manualSegments: ManualSegmentLabel[];
  report: Report | null;
  trainingDatasets: TrainingDataset[];
  activeDatasetId: string;
  activeVersionId: string;
  datasetEntries: TrainingDatasetEntry[];
  onRefresh: () => Promise<void> | void;
  onDatasetsRefresh: () => Promise<void> | void;
  onDatasetChange: (datasetId: string, versionId: string) => Promise<void> | void;
}) {
  const activeDataset = trainingDatasets.find((dataset) => dataset.id === activeDatasetId);
  const activeVersion = activeDataset?.versions.find((version) => version.id === activeVersionId);
  return (
    <section className="dataset-lab">
      <DatasetVersionSelector
        datasets={trainingDatasets}
        activeDatasetId={activeDatasetId}
        activeVersionId={activeVersionId}
        entries={datasetEntries}
        onDatasetChange={onDatasetChange}
        onRefresh={onDatasetsRefresh}
      />
      <div className="dataset-lab-grid">
        <DatasetMiniChat
          report={report}
          activeSession={null}
          datasetId={activeDatasetId}
          versionId={activeVersionId}
          startTimestamp={activeVersion?.work_start_timestamp || null}
          endTimestamp={activeVersion?.work_end_timestamp || null}
          labelHint={activeVersion?.focus_label || null}
        />
        <section className="dataset-history-panel">
          <div className="dataset-chat-header">
            <strong>Historial de version</strong>
            <span>{activeDataset && activeVersion ? `${activeDataset.name} / ${activeVersion.version_name}` : "Sin version activa"}</span>
          </div>
          <div className="dataset-list compact-history-list">
            {datasetEntries.map((entry) => (
              <article className="dataset-row" key={entry.id}>
                <div>
                  <strong>{entry.label}</strong>
                  <span>{entry.source_type} · {targetLabel(entry.training_target)}</span>
                </div>
                <p>{entry.start_timestamp !== null ? `${entry.start_timestamp.toFixed(2)}s` : "sin inicio"} - {entry.end_timestamp !== null ? `${entry.end_timestamp.toFixed(2)}s` : "sin fin"} · {entry.created_by_name}</p>
                {entry.payload && (
                  <details className="ai-output">
                    <summary>Dato sanitizado</summary>
                    <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
                  </details>
                )}
              </article>
            ))}
            {datasetEntries.length === 0 && <p className="empty-note">Esta version todavia no tiene ejemplos guardados.</p>}
          </div>
        </section>
      </div>
      <DatasetView rows={rows} manualSegments={manualSegments} onRefresh={onRefresh} />
    </section>
  );
}

function DatasetView({ rows, manualSegments, onRefresh }: { rows: DatasetFeedback[]; manualSegments: ManualSegmentLabel[]; onRefresh: () => Promise<void> | void }) {
  return (
    <section className="report-panel dataset-panel">
      <div className="report-header">
        <div>
          <h2>Dataset de retroalimentacion</h2>
          <p>Marcas humanas guardadas para calibrar el detector ligero y revisar errores del LLM.</p>
        </div>
        <button className="icon-button" onClick={() => onRefresh()}>
          <RefreshCw size={16} />
          Refrescar
        </button>
      </div>
      <div className="dataset-list">
        {manualSegments.map((segment) => (
          <article className="dataset-row manual-dataset-row" key={segment.id}>
            <div>
              <strong>{segment.label}</strong>
              <span>manual · {targetLabel(segment.training_target)}</span>
            </div>
            <p>{segment.input_file || segment.job_id} · {segment.start_timestamp.toFixed(2)}s - {segment.end_timestamp.toFixed(2)}s</p>
            {segment.notes && <p>{segment.notes}</p>}
          </article>
        ))}
        {rows.map((row) => (
          <article className="dataset-row" key={row.id}>
            <div>
              <strong>{row.correct_issue_type || row.event_type_guess}</strong>
              <span>{row.verdict} · {row.valid_issue === false ? "no issue" : row.valid_issue === true ? "issue valido" : "review"}</span>
            </div>
            <p>{row.input_file} · {row.event_timestamp.toFixed(2)}s · detector {(row.detector_confidence * 100).toFixed(0)}%</p>
            {row.notes && <p>{row.notes}</p>}
            <details className="ai-output">
              <summary>AI/detector source</summary>
              <pre>{JSON.stringify({ event_type_guess: row.event_type_guess, ai_output: row.ai_output }, null, 2)}</pre>
            </details>
          </article>
        ))}
        {rows.length === 0 && manualSegments.length === 0 && <p className="empty-note">Todavia no hay feedback guardado.</p>}
      </div>
    </section>
  );
}

function FeedbackControls({ event, onSaved }: { event: Report["candidate_events"][number]; onSaved: () => Promise<void> | void }) {
  const [verdict, setVerdict] = useState("ai_correct");
  const [correctIssueType, setCorrectIssueType] = useState(String(event.ai_output?.issue_type || event.issue_type_guess || ""));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveFeedback(clickEvent: React.MouseEvent) {
    clickEvent.stopPropagation();
    setSaving(true);
    setMessage(null);
    try {
      await api.createFeedback(event.event_id, {
        verdict,
        correct_issue_type: correctIssueType.trim() || null,
        valid_issue: verdict === "false_positive" ? false : verdict === "needs_review" ? null : true,
        notes
      });
      setNotes("");
      setMessage("Feedback guardado.");
      await onSaved();
    } catch (err: any) {
      setMessage(err.message || "No se pudo guardar feedback.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="feedback-box" onClick={(clickEvent) => clickEvent.stopPropagation()}>
      <div className="feedback-row">
        <label>
          Dictamen humano
          <select value={verdict} onChange={(changeEvent) => setVerdict(changeEvent.target.value)}>
            <option value="ai_correct">AI correcta</option>
            <option value="false_positive">No tiene nada que ver</option>
            <option value="wrong_classification">Clasificacion incorrecta</option>
            <option value="missed_issue">Si habia error no entendido</option>
            <option value="needs_review">Revisar despues</option>
          </select>
        </label>
        <label>
          Etiqueta correcta
          <input value={correctIssueType} onChange={(changeEvent) => setCorrectIssueType(changeEvent.target.value)} placeholder="NO_ISSUE, BLACK_SCREEN, UI_ERROR_MESSAGE..." />
        </label>
      </div>
      <textarea value={notes} onChange={(changeEvent) => setNotes(changeEvent.target.value)} placeholder="Nota para entrenar/calibrar: por que esta bien o mal lo que dijo la AI..." />
      <button className="feedback-save" onClick={saveFeedback} disabled={saving}>
        {saving ? "Guardando..." : "Guardar feedback"}
      </button>
      {message && <small className="feedback-message">{message}</small>}
      {event.human_feedback?.length > 0 && (
        <div className="feedback-history">
          {event.human_feedback.map((item) => (
            <div key={item.id}>
              <strong>{item.verdict}</strong>
              <span>{item.correct_issue_type || "sin etiqueta"} · {item.created_by_name}</span>
              {item.notes && <p>{item.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function summarizeAiOutput(output: Record<string, unknown> | null) {
  if (!output) return "Sin respuesta AI guardada.";
  const detectedIssue = output.detected_issue || output.issue_type || output.label || "AI";
  const confidence = output.confidence !== undefined ? ` confianza ${Math.round(Number(output.confidence) * 100)}%` : "";
  const reason = output.reason || output.explanation || output.summary || output.suggested_training_target;
  return `${String(detectedIssue)}${confidence}${reason ? `: ${String(reason)}` : ""}`;
}

function AiOutputBlock({ output }: { output: Record<string, unknown> | null }) {
  if (!output) {
    return <div className="ai-output ai-output-empty">Sin respuesta AI guardada.</div>;
  }
  return (
    <details className="ai-output" onClick={(event) => event.stopPropagation()}>
      <summary>Output AI</summary>
      <pre>{JSON.stringify(output, null, 2)}</pre>
    </details>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
