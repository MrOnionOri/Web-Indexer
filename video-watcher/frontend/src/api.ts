export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  permissions: string[];
  is_platform_admin: boolean;
}

export interface Summary {
  total_candidate_events: number;
  verified_issues: number;
  false_positives: number;
  needs_human_review: number;
}

export interface Issue {
  issue_id: string;
  candidate_event_id: string;
  issue_type: string;
  severity: string;
  timestamp: number | null;
  best_evidence_frame: string | null;
  reason: string;
  recommended_action: string;
}

export interface HumanFeedback {
  id: string;
  verdict: string;
  correct_issue_type: string | null;
  valid_issue: boolean | null;
  notes: string;
  created_by_name: string;
  created_at: string;
}

export interface CandidateEvent {
  event_id: string;
  first_timestamp: number;
  last_timestamp: number;
  center_timestamp: number;
  issue_type_guess: string;
  max_confidence: number;
  average_confidence: number;
  frame_count: number;
  description: string;
  ai_output: Record<string, unknown> | null;
  human_feedback: HumanFeedback[];
}

export interface Report {
  job_id: string;
  input_file: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  summary: Summary;
  candidate_events: CandidateEvent[];
  issues: Issue[];
  manual_segments: ManualSegmentLabel[];
  review_sessions: ReviewSession[];
  segment_annotations: SegmentAnnotation[];
  frame_ai_questions: FrameAIQuestion[];
  annotation_consensus: AnnotationConsensus[];
}

export interface JobListItem {
  id: string;
  original_filename: string;
  status: string;
  created_by_name: string;
  created_at: string;
  completed_at: string | null;
  summary: Summary | null;
}

export interface DatasetFeedback {
  id: string;
  job_id: string;
  input_file: string;
  event_id: string;
  event_type_guess: string;
  event_timestamp: number;
  detector_confidence: number;
  ai_output: Record<string, unknown> | null;
  verdict: string;
  correct_issue_type: string | null;
  valid_issue: boolean | null;
  notes: string;
  created_by_name: string;
  created_at: string;
}

export interface ManualSegmentLabel {
  id: string;
  job_id: string;
  input_file: string | null;
  start_timestamp: number;
  end_timestamp: number;
  label: string;
  training_target: string;
  notes: string;
  created_by_name: string;
  created_at: string;
}

export interface ReviewSession {
  id: string;
  job_id: string;
  status: string;
  reviewer_user_id: string;
  reviewer_name: string;
  reviewer_email: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SegmentAnnotation {
  id: string;
  job_id: string;
  review_session_id: string;
  start_timestamp: number;
  end_timestamp: number;
  label: string;
  temporal_scope: string;
  training_target: string;
  region: Record<string, unknown> | null;
  llm_output: Record<string, unknown> | null;
  human_reason: string;
  created_by_name: string;
  created_at: string;
}

export interface FrameAIQuestion {
  id: string;
  job_id: string;
  review_session_id: string;
  timestamp: number;
  start_timestamp: number | null;
  end_timestamp: number | null;
  question: string;
  region: Record<string, unknown> | null;
  ai_output: Record<string, unknown> | null;
  human_label: string | null;
  human_reason: string;
  training_target: string;
  created_by_name: string;
  created_at: string;
}

export interface AnnotationConsensus {
  label: string;
  reviewer_count: number;
  annotation_count: number;
  first_timestamp: number;
  last_timestamp: number;
}

export interface RegionSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrainingDatasetVersion {
  id: string;
  dataset_id: string;
  version_name: string;
  description: string;
  focus_label: string | null;
  work_start_timestamp: number | null;
  work_end_timestamp: number | null;
  status: string;
  entry_count: number;
  created_by_name: string;
  created_at: string;
}

export interface TrainingDataset {
  id: string;
  name: string;
  description: string;
  visibility: string;
  owner_user_id: string;
  owner_name: string;
  status: string;
  version_count: number;
  entry_count: number;
  created_at: string;
  updated_at: string;
  versions: TrainingDatasetVersion[];
}

export interface TrainingDatasetEntry {
  id: string;
  dataset_id: string;
  dataset_version_id: string;
  job_id: string;
  review_session_id: string | null;
  source_type: string;
  source_id: string;
  label: string;
  start_timestamp: number | null;
  end_timestamp: number | null;
  training_target: string;
  payload: Record<string, unknown> | null;
  created_by_name: string;
  created_at: string;
}

export interface TrainingDatasetChatMessage {
  id: string;
  dataset_id: string;
  dataset_version_id: string;
  job_id: string | null;
  review_session_id: string | null;
  role: string;
  content: string;
  sanitized: Record<string, unknown> | null;
  saved_entry_id: string | null;
  created_by_name: string;
  created_at: string;
}

const serverProtocol = (import.meta.env.VITE_SERVER_PROTOCOL || window.location.protocol.replace(":", "")).trim();
const serverHost = (import.meta.env.VITE_SERVER_HOST || window.location.hostname).trim();
const backendPort = (import.meta.env.VITE_VIDEO_WATCHER_BACKEND_PORT || "8003").trim();
const configuredBackendUrl = import.meta.env.VITE_VIDEO_WATCHER_BACKEND_URL?.trim();
const API_BASE_URL = (configuredBackendUrl || `${serverProtocol}://${serverHost}:${backendPort}`).replace(/\/$/, "");

type RequestOptions = Omit<RequestInit, "headers"> & { headers?: HeadersInit };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const hasBody = options.body !== undefined;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = (options.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    const csrfToken = readCookie("gatestack_csrf");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
    credentials: "include"
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const detail = errorPayload.detail || "La solicitud no pudo completarse.";
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function readCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
}

export const api = {
  me: () => request<UserProfile>("/auth/me"),
  jobs: () => request<JobListItem[]>("/api/v1/reports"),
  report: (jobId: string) => request<Report>(`/api/v1/reports/${jobId}`),
  datasetFeedback: () => request<DatasetFeedback[]>("/api/v1/dataset/feedback"),
  datasetManualSegments: () => request<ManualSegmentLabel[]>("/api/v1/dataset/manual-segments"),
  trainingDatasets: () => request<TrainingDataset[]>("/api/v1/training-datasets"),
  createTrainingDataset: (payload: { name: string; description?: string; visibility?: string }) =>
    request<TrainingDataset>("/api/v1/training-datasets", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createTrainingDatasetVersion: (datasetId: string, payload: { version_name: string; description?: string; focus_label?: string | null; work_start_timestamp?: number | null; work_end_timestamp?: number | null }) =>
    request<TrainingDatasetVersion>(`/api/v1/training-datasets/${datasetId}/versions`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  trainingDatasetEntries: (datasetId: string, versionId?: string | null) =>
    request<TrainingDatasetEntry[]>(`/api/v1/training-datasets/${datasetId}/entries${versionId ? `?version_id=${encodeURIComponent(versionId)}` : ""}`),
  trainingDatasetChat: (datasetId: string, versionId: string) =>
    request<TrainingDatasetChatMessage[]>(`/api/v1/training-datasets/${datasetId}/versions/${versionId}/chat`),
  sendTrainingDatasetChat: (datasetId: string, versionId: string, payload: { message: string; job_id?: string | null; review_session_id?: string | null; start_timestamp?: number | null; end_timestamp?: number | null; label_hint?: string | null; save_important?: boolean }) =>
    request<TrainingDatasetChatMessage[]>(`/api/v1/training-datasets/${datasetId}/versions/${versionId}/chat`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  videoUrl: (jobId: string) => `${API_BASE_URL}/api/v1/jobs/${jobId}/video`,
  createReviewSession: (jobId: string, payload: { notes?: string }) =>
    request<ReviewSession>(`/api/v1/jobs/${jobId}/review-sessions`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createAnnotation: (
    sessionId: string,
    payload: {
      start_timestamp: number;
      end_timestamp: number;
      label: string;
      temporal_scope: string;
      training_target: string;
      region?: RegionSelection | null;
      llm_output?: Record<string, unknown> | null;
      human_reason?: string;
      dataset_id?: string | null;
      dataset_version_id?: string | null;
    }
  ) =>
    request<SegmentAnnotation>(`/api/v1/review-sessions/${sessionId}/annotations`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  askAi: (
    sessionId: string,
    payload: {
      timestamp: number;
      start_timestamp?: number | null;
      end_timestamp?: number | null;
      question: string;
      region?: RegionSelection | null;
      human_label?: string | null;
      human_reason?: string;
      training_target: string;
      dataset_id?: string | null;
      dataset_version_id?: string | null;
    }
  ) =>
    request<FrameAIQuestion>(`/api/v1/review-sessions/${sessionId}/ai-questions`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createManualSegment: (jobId: string, payload: { start_timestamp: number; end_timestamp: number; label: string; training_target: string; notes?: string }) =>
    request<ManualSegmentLabel>(`/api/v1/jobs/${jobId}/manual-segments`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createFeedback: (eventId: string, payload: { verdict: string; correct_issue_type?: string | null; valid_issue?: boolean | null; notes?: string }) =>
    request<HumanFeedback>(`/api/v1/events/${eventId}/feedback`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  analyzeVideo: (file: File, options: { sampleFps: number; verifyWithLlm: boolean; detectorMode: string; projectContext: string }) => {
    const body = new FormData();
    body.append("file", file);
    body.append("mode", "offline");
    body.append("sample_fps", String(options.sampleFps));
    body.append("verify_with_llm", String(options.verifyWithLlm));
    body.append("detector_mode", options.detectorMode);
    body.append("project_context", options.projectContext);
    return request<{ job_id: string; status: string; report: Report }>("/api/v1/analyze/video", {
      method: "POST",
      body
    });
  }
};
