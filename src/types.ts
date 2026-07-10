export type RoleName = 'annotator' | 'verifier' | 'supervisor' | 'admin' | 'ml' | 'customer';

export type TaskStatus =
  | 'Новая'
  | 'Назначена'
  | 'В работе'
  | 'На проверке'
  | 'На доработке'
  | 'Исправлена'
  | 'Принята'
  | 'Выгружена';

export type SegmentStatus = 'new' | 'checked' | 'disputed' | 'returned' | 'accepted';
export type TermStatus = 'new' | 'review' | 'approved' | 'rejected' | 'disputed';
export type CommentStatus = 'open' | 'resolved';
export type CheckSeverity = 'ok' | 'warning' | 'critical';

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: RoleName;
  status: 'active' | 'blocked';
}

export interface Project {
  id: string;
  name: string;
  description: string;
  customer: string;
  deadline: string;
  status: 'active' | 'archived';
  rules: string[];
  inputFormat: string;
  outputFormat: string;
}

export interface Task {
  id: string;
  projectId: string;
  mediaFileId: string;
  title: string;
  assigneeId: string;
  verifierId: string;
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high';
  deadline: string;
  listenedSeconds: number;
  returnCount: number;
}

export interface MediaFile {
  id: string;
  projectId: string;
  audioPath: string;
  videoPath?: string;
  duration: number;
  format: string;
  uploadedAt: string;
}

export interface Speaker {
  id: string;
  taskId: string;
  originalName: string;
  displayName: string;
  editable: boolean;
}

export interface Segment {
  id: string;
  taskId: string;
  startTime: number;
  endTime: number;
  text: string;
  sourceText: string;
  speakerId: string;
  status: SegmentStatus;
  confidence: number;
  isCrosstalk: boolean;
  listened: boolean;
  verifierComment?: string;
  crosstalkComment?: string;
  sourceFormat?: 'gecko-v2' | 'flat';
  sourceIndex?: number;
  sourceSpeaker?: GeckoV2Speaker;
  sourceTerms?: GeckoV2Term[];
  sourceExtra?: Record<string, unknown>;
  sourceSpeakerExtra?: Record<string, unknown>;
}

export interface Term {
  id: string;
  projectId: string;
  value: string;
  normalizedValue: string;
  type: 'product' | 'extension' | 'abbreviation' | 'foreign' | 'slang' | 'unknown';
  status: TermStatus;
  annotatorComment: string;
  verifierComment: string;
  occurrences: number;
}

export interface VerificationComment {
  id: string;
  taskId: string;
  segmentId?: string;
  authorId: string;
  category: 'text' | 'boundary' | 'term' | 'crosstalk' | 'workflow';
  text: string;
  status: CommentStatus;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
}

export interface HistoryEntry {
  id: string;
  at: string;
  userId: string;
  action: string;
  target: string;
  before?: string;
  after?: string;
}

export interface TranscriptVersion {
  id: string;
  version: number;
  label: string;
  createdAt: string;
  authorId: string;
  source: 'demo' | 'import' | 'autosave' | 'export' | 'restore';
  segments: Segment[];
  comment: string;
}

export interface GeckoV2Speaker {
  id?: string;
  name?: string | null;
}

export interface GeckoV2Term {
  text: string;
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface AppState {
  users: User[];
  currentUserId: string | null;
  project: Project;
  task: Task;
  media: MediaFile;
  speakers: Speaker[];
  segments: Segment[];
  terms: Term[];
  comments: VerificationComment[];
  annotatorChecklist: ChecklistItem[];
  verifierChecklist: ChecklistItem[];
  history: HistoryEntry[];
  auditLog: AuditLogEntry[];
  versions: TranscriptVersion[];
  sourceSchemaVersion?: string;
  version: number;
  savedAt: string;
}

export interface QualityCheck {
  id: string;
  type: string;
  result: boolean;
  message: string;
  severity: CheckSeverity;
  segmentId?: string;
}

export interface GeckoExport {
  metadata: {
    projectId: string;
    taskId: string;
    exportedAt: string;
    status: TaskStatus;
    version: number;
  };
  segments: Array<{
    id: string;
    start: number;
    end: number;
    text: string;
    speaker: string;
    confidence: number;
    is_crosstalk: boolean;
    status: SegmentStatus;
  }>;
  terms: Term[];
  comments: VerificationComment[];
  quality: QualityCheck[];
}

export interface GeckoV2Export {
  schemaVersion: string;
  monologues: Array<{
    speaker: GeckoV2Speaker;
    start: number;
    end: number;
    terms: GeckoV2Term[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}
