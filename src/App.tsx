import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import WaveSurfer from 'wavesurfer.js';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ClipboardCheck,
  Clock3,
  Download,
  FileAudio,
  FileJson,
  FileText,
  Gauge,
  History,
  ListChecks,
  LogOut,
  MessageSquare,
  Mic2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Repeat2,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Video,
  Wand2,
  X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { annotatorChecklistPreset, demoState, verifierChecklistPreset } from './demoState';
import {
  STORAGE_KEY,
  addAudit,
  addHistory,
  analytics,
  buildAiHints,
  cloneState,
  computeQuality,
  createTranscriptVersion,
  downloadJson,
  exportGeckoJson,
  findPossibleTerms,
  formatTime,
  getSegmentQualityLevel,
  importSegmentsFromGecko,
  parseAnnotationText,
  roleTitle,
  seconds,
  statusTone,
  updateChecklist
} from './logic';
import type { AppState, ChecklistItem, QualityCheck, RoleName, Segment, SegmentQualityLevel, TaskStatus, Term, VerificationComment } from './types';

type ViewName = 'workspace' | 'verification' | 'terms' | 'analytics' | 'admin';
type SaveState = 'saved' | 'saving' | 'dirty';
type VerifierCompareFile = { name: string; segments: Segment[] } | null;
type AiAudioResult = {
  segmentId: string;
  transcript: string;
  similarity: number;
  level: SegmentQualityLevel;
  engine: 'whisper-browser' | 'backend-asr' | 'gecko-fallback';
  detail: string;
  checkedAt: string;
};
type AiModelStatus = 'idle' | 'loading' | 'ready' | 'error';
type WhisperTranscriber = (audio: Float32Array, options?: Record<string, unknown>) => Promise<string | { text?: string }>;
type DecodedAudioCache = { url: string; sampleRate: number; samples: Float32Array };
type SegmentAudioSource = 'decoded-file' | 'ffmpeg-extracted' | 'recorded-media';
type CaptureMediaElement = HTMLMediaElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};
type FfmpegFileData = Uint8Array | string;
type FfmpegInstance = {
  loaded?: boolean;
  load: (options?: Record<string, unknown>) => Promise<void>;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
  readFile: (path: string) => Promise<FfmpegFileData>;
  deleteFile?: (path: string) => Promise<void>;
  exec: (args: string[]) => Promise<number>;
};
type GeckoTestWindow = Window & { __GECKO_TEST_DISABLE_WHISPER?: boolean };
type FfmpegWindow = Window & { FFmpegWASM?: { FFmpeg: new () => FfmpegInstance } };
const MEDIA_DB_NAME = 'gecko-next-media-cache';
const MEDIA_STORE_NAME = 'media';
const ASR_ENDPOINT_STORAGE = 'gecko-next-asr-endpoint';
const CHECKLIST_PRESET_VERSION = 'tz-6-11-v1';

const roleViews: Record<RoleName, ViewName[]> = {
  annotator: ['workspace', 'terms', 'analytics'],
  verifier: ['workspace', 'verification', 'terms', 'analytics'],
  supervisor: ['workspace', 'verification', 'terms', 'analytics', 'admin'],
  admin: ['workspace', 'verification', 'terms', 'analytics', 'admin']
};

const roleOptions: RoleName[] = ['annotator', 'verifier', 'supervisor', 'admin'];
const taskStatusOptions: TaskStatus[] = ['Новая', 'Назначена', 'В работе', 'На проверке', 'На доработке', 'Исправлена', 'Принята', 'Выгружена'];

function normalizeChecklist(items: ChecklistItem[] | undefined, preset: ChecklistItem[]): ChecklistItem[] {
  const existing = new Map((Array.isArray(items) ? items : []).map((item) => [item.id, item]));
  const presetIds = new Set(preset.map((item) => item.id));
  const normalized = preset.map((item) => ({
    ...item,
    done: existing.get(item.id)?.done ?? item.done
  }));
  const customItems = (Array.isArray(items) ? items : []).filter((item) => !presetIds.has(item.id));
  return [...normalized, ...customItems];
}

function migrateState(candidate: Partial<AppState>): AppState {
  const base = createEmptyState();
  const migrated = { ...base, ...candidate } as AppState;
  const shouldApplyChecklistPreset = migrated.checklistPresetVersion !== CHECKLIST_PRESET_VERSION;
  return {
    ...migrated,
    currentUserId: migrated.users.some((user) => user.id === migrated.currentUserId && user.status === 'active') ? migrated.currentUserId : null,
    users: migrated.users.map((user) => ({
      ...user,
      role: roleOptions.includes(user.role) ? user.role : 'annotator'
    })),
    annotatorChecklist: shouldApplyChecklistPreset
      ? normalizeChecklist(migrated.annotatorChecklist, annotatorChecklistPreset)
      : Array.isArray(migrated.annotatorChecklist)
        ? migrated.annotatorChecklist
        : base.annotatorChecklist,
    verifierChecklist: shouldApplyChecklistPreset
      ? normalizeChecklist(migrated.verifierChecklist, verifierChecklistPreset)
      : Array.isArray(migrated.verifierChecklist)
        ? migrated.verifierChecklist
        : base.verifierChecklist,
    checklistPresetVersion: CHECKLIST_PRESET_VERSION,
    versions: Array.isArray(migrated.versions) ? migrated.versions : base.versions
  };
}

function createEmptyState(): AppState {
  const base = cloneState(demoState);
  return {
    ...base,
    currentUserId: null,
    task: {
      ...base.task,
      title: 'Загрузите медиа и Gecko JSON',
      status: 'Новая',
      listenedSeconds: 0,
      returnCount: 0
    },
    media: {
      ...base.media,
      audioPath: '',
      videoPath: undefined,
      duration: 0,
      format: 'not_loaded',
      uploadedAt: ''
    },
    segments: [],
    comments: [],
    history: [],
    auditLog: [],
    versions: [],
    sourceSchemaVersion: undefined,
    checklistPresetVersion: CHECKLIST_PRESET_VERSION,
    savedAt: new Date().toISOString()
  };
}

function loadInitialState(): AppState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return migrateState(JSON.parse(stored) as Partial<AppState>);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createEmptyState();
}

function iconSize(size = 17) {
  return { size, strokeWidth: 2 };
}

const speakerPalette = [
  { color: '#5665d9', bg: 'rgba(86, 101, 217, 0.22)', soft: '#eceeff', ink: '#3441a4' },
  { color: '#168f86', bg: 'rgba(22, 143, 134, 0.22)', soft: '#dff5f2', ink: '#0d6f68' },
  { color: '#b97800', bg: 'rgba(185, 120, 0, 0.22)', soft: '#fff2cf', ink: '#815500' },
  { color: '#bf4055', bg: 'rgba(191, 64, 85, 0.2)', soft: '#ffe5eb', ink: '#8f273a' },
  { color: '#258758', bg: 'rgba(37, 135, 88, 0.2)', soft: '#e0f3e9', ink: '#176744' },
  { color: '#0072b2', bg: 'rgba(0, 114, 178, 0.2)', soft: '#e3f2fb', ink: '#075a8b' },
  { color: '#8b5fbf', bg: 'rgba(139, 95, 191, 0.2)', soft: '#f0e8ff', ink: '#624098' },
  { color: '#c05f2c', bg: 'rgba(192, 95, 44, 0.2)', soft: '#fae8dd', ink: '#8d421b' }
];

function speakerColorIndex(speakerId?: string) {
  const value = speakerId?.trim() || 'unknown';
  const explicitSpeakerNumber = value.match(/speaker[_\s-]*(\d+)/i);
  if (explicitSpeakerNumber) return Number(explicitSpeakerNumber[1]) % speakerPalette.length;

  const importedSpeakerNumber = value.match(/(?:spk|import)[^\d]*(\d+)$/i);
  if (importedSpeakerNumber) return Math.max(0, Number(importedSpeakerNumber[1]) - 1) % speakerPalette.length;

  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % speakerPalette.length;
}

function speakerColorStyle(speakerId?: string): CSSProperties {
  const palette = speakerPalette[speakerColorIndex(speakerId)];
  return {
    '--speaker-color': palette.color,
    '--speaker-bg': palette.bg,
    '--speaker-soft': palette.soft,
    '--speaker-ink': palette.ink
  } as CSSProperties;
}

function timelineSegmentStyle(segment: Segment, duration: number, minPercent = 0.035): CSSProperties {
  const safeDuration = Math.max(duration, segment.endTime, 1);
  const left = (segment.startTime / safeDuration) * 100;
  const width = ((segment.endTime - segment.startTime) / safeDuration) * 100;
  const visibleWidth = Math.max(width, minPercent);
  return {
    ...speakerColorStyle(segment.speakerId),
    left: `${Math.min(Math.max(left, 0), 100)}%`,
    width: `max(1px, calc(${visibleWidth}% - 1px))`
  } as CSSProperties;
}

function getTimelineWidth(duration: number, zoom: number): number {
  const safeDuration = Math.max(1, duration);
  return Math.max(720, Math.ceil(safeDuration * Math.max(30, zoom)));
}

function getSegmentsDuration(segments: Segment[]): number {
  return Math.max(0, ...segments.map((segment) => segment.endTime));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildTimelinePeaks(segments: Segment[], duration: number): number[][] | undefined {
  const safeDuration = Math.max(duration, getSegmentsDuration(segments), 1);
  if (segments.length === 0 || safeDuration <= 1) return undefined;

  const samplesPerSecond = 24;
  const length = Math.min(120000, Math.max(8000, Math.ceil(safeDuration * samplesPerSecond)));
  const peaks = new Array<number>(length).fill(0);

  segments.forEach((segment) => {
    const start = Math.max(0, Math.floor((segment.startTime / safeDuration) * length));
    const end = Math.min(length - 1, Math.ceil((segment.endTime / safeDuration) * length));
    const span = Math.max(1, end - start);
    const seed = hashString(`${segment.id}:${segment.speakerId}:${segment.text}`);

    for (let index = start; index <= end; index += 1) {
      const local = (index - start) / span;
      const envelope = Math.sin(Math.PI * Math.max(0.06, Math.min(0.94, local)));
      const jitter = 0.52 + ((hashString(`${seed}:${index}`) % 100) / 100) * 0.48;
      const confidence = Number.isFinite(segment.confidence) ? Math.max(0.45, Math.min(1, segment.confidence)) : 0.72;
      const value = Math.max(0.03, Math.min(0.96, (0.12 + envelope * 0.82) * jitter * confidence));
      peaks[index] = Math.max(peaks[index], value);
    }
  });

  return [peaks];
}

function getTimelineScale(duration: number, zoom: number): number {
  return getTimelineWidth(duration, zoom) / Math.max(1, duration);
}

function timePixelStyle(
  startTime: number,
  endTime: number,
  duration: number,
  zoom: number,
  extra: CSSProperties = {},
  minWidth = 2
): CSSProperties {
  const scale = getTimelineScale(duration, zoom);
  const safeStart = Math.max(0, startTime);
  const safeEnd = Math.max(safeStart + 0.01, endTime);
  return {
    left: `${safeStart * scale}px`,
    width: `${Math.max(minWidth, (safeEnd - safeStart) * scale - 1)}px`,
    ...extra
  };
}

function timeFromPointer(event: Pick<PointerEvent | ReactPointerEvent, 'clientX'>, element: HTMLElement, duration: number, zoom: number): number {
  const rect = element.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  return seconds(x / getTimelineScale(duration, zoom));
}

function normalizeForSpeechCompare(value: string): string[] {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function textSimilarity(left: string, right: string): number {
  const leftWords = normalizeForSpeechCompare(left);
  const rightWords = normalizeForSpeechCompare(right);
  if (leftWords.length === 0 && rightWords.length === 0) return 1;
  if (leftWords.length === 0 || rightWords.length === 0) return 0;
  const rightCounts = new Map<string, number>();
  rightWords.forEach((word) => rightCounts.set(word, (rightCounts.get(word) ?? 0) + 1));
  let matches = 0;
  leftWords.forEach((word) => {
    const count = rightCounts.get(word) ?? 0;
    if (count <= 0) return;
    matches += 1;
    rightCounts.set(word, count - 1);
  });
  return matches / Math.max(leftWords.length, rightWords.length);
}

function audioQualityLevel(segment: Segment, similarity: number, engine: AiAudioResult['engine']): SegmentQualityLevel {
  if (!segment.text.trim() || segment.endTime <= segment.startTime || similarity < 0.62) return 'red';
  if (engine === 'whisper-browser' || engine === 'backend-asr') {
    if (similarity >= 0.86 && segment.confidence >= 0.72 && !segment.isCrosstalk) return 'green';
    return 'yellow';
  }
  if (similarity >= 0.96 && segment.confidence >= 0.9 && !segment.isCrosstalk) return 'yellow';
  return similarity < 0.78 || segment.confidence < 0.72 ? 'red' : 'yellow';
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) mono[index] += data[index] / buffer.numberOfChannels;
  }
  return mono;
}

function resampleAudio(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const nextLength = Math.max(1, Math.round(samples.length / ratio));
  const next = new Float32Array(nextLength);
  for (let index = 0; index < nextLength; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(samples.length - 1, left + 1);
    const weight = sourceIndex - left;
    next[index] = samples[left] * (1 - weight) + samples[right] * weight;
  }
  return next;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const channelCount = 1;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function waitForMediaEvent(element: HTMLMediaElement, eventName: string, timeout = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Media event timeout: ${eventName}`));
    }, timeout);
    const cleanup = () => {
      window.clearTimeout(timer);
      element.removeEventListener(eventName, handleEvent);
      element.removeEventListener('error', handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Media element cannot play or decode this file'));
    };
    element.addEventListener(eventName, handleEvent, { once: true });
    element.addEventListener('error', handleError, { once: true });
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getRecorderMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'video/webm;codecs=opus', 'video/webm'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function mediaCacheKey(kind: 'audio' | 'video', name: string) {
  return `${kind}:${name}`;
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MEDIA_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(MEDIA_STORE_NAME);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB недоступен'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function storeMediaFile(kind: 'audio' | 'video', name: string, file: File): Promise<void> {
  const db = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE_NAME, 'readwrite');
    tx.objectStore(MEDIA_STORE_NAME).put(file, mediaCacheKey(kind, name));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Не удалось сохранить медиафайл'));
  });
  db.close();
}

async function restoreMediaFile(kind: 'audio' | 'video', name: string): Promise<File | null> {
  const db = await openMediaDb();
  const value = await new Promise<Blob | File | null>((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE_NAME, 'readonly');
    const request = tx.objectStore(MEDIA_STORE_NAME).get(mediaCacheKey(kind, name));
    request.onsuccess = () => resolve((request.result as Blob | File | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Не удалось восстановить медиафайл'));
  });
  db.close();
  if (!value) return null;
  return value instanceof File ? value : new File([value], name, { type: value.type });
}

async function remoteBlobUrl(url: string, mimeType: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Не удалось загрузить AI-модуль: ${response.status}`);
  return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: mimeType }));
}

async function loadPatchedFfmpegGlobal(): Promise<{ FFmpeg: new () => FfmpegInstance }> {
  const ffmpegWindow = window as FfmpegWindow;
  if (ffmpegWindow.FFmpegWASM?.FFmpeg) return ffmpegWindow.FFmpegWASM;

  const response = await fetch('https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.js');
  if (!response.ok) throw new Error(`Не удалось загрузить ffmpeg.wasm: ${response.status}`);
  const patchedScript = (await response.text()).replace('{type:"module"})', '{type:void 0})');
  const scriptUrl = URL.createObjectURL(new Blob([patchedScript], { type: 'text/javascript' }));

  try {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Не удалось запустить ffmpeg.wasm'));
      document.head.appendChild(script);
    });
  } finally {
    URL.revokeObjectURL(scriptUrl);
  }

  if (!ffmpegWindow.FFmpegWASM?.FFmpeg) throw new Error('ffmpeg.wasm не инициализировался');
  return ffmpegWindow.FFmpegWASM;
}

function getDefaultAsrEndpoint(): string {
  const stored = sessionStorage.getItem(ASR_ENDPOINT_STORAGE);
  if (stored !== null) return stored;
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_ASR_API_URL) return env.VITE_ASR_API_URL;
  return '';
}

function App() {
  const [state, setState] = useState<AppState>(loadInitialState);
  const [activeView, setActiveView] = useState<ViewName>('workspace');
  const [activeSegmentId, setActiveSegmentId] = useState<string>(state.segments[0]?.id ?? '');
  const [audioUrl, setAudioUrl] = useState<string>(state.media.audioPath);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [toast, setToast] = useState<string>('');
  const [zoom, setZoom] = useState(85);
  const [speed, setSpeed] = useState(1);
  const [preRoll, setPreRoll] = useState(0.3);
  const [postRoll, setPostRoll] = useState(0.3);
  const [loopSegment, setLoopSegment] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(state.media.duration);
  const [isPlaying, setIsPlaying] = useState(false);
  const [termSearch, setTermSearch] = useState('');
  const [newTerm, setNewTerm] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [verifierCompareA, setVerifierCompareA] = useState<VerifierCompareFile>(null);
  const [verifierCompareB, setVerifierCompareB] = useState<VerifierCompareFile>(null);
  const [aiAudioResults, setAiAudioResults] = useState<Record<string, AiAudioResult>>({});
  const [aiAudioRunning, setAiAudioRunning] = useState(false);
  const [aiModelStatus, setAiModelStatus] = useState<AiModelStatus>('idle');
  const [aiAudioProgress, setAiAudioProgress] = useState('');
  const [asrEndpoint, setAsrEndpoint] = useState(getDefaultAsrEndpoint);
  const [undoStack, setUndoStack] = useState<AppState[]>([]);
  const [redoStack, setRedoStack] = useState<AppState[]>([]);

  const stateRef = useRef<AppState>(state);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioFileRef = useRef<File | null>(null);
  const videoFileRef = useRef<File | null>(null);
  const playTargetRef = useRef<{ start: number; end: number } | null>(null);
  const playStopTimerRef = useRef<number | null>(null);
  const whisperRef = useRef<Promise<WhisperTranscriber> | null>(null);
  const ffmpegRef = useRef<Promise<FfmpegInstance> | null>(null);
  const decodedAudioRef = useRef<DecodedAudioCache | null>(null);
  const firstSave = useRef(true);
  const checklistRuntimeMigrationRef = useRef(false);

  const currentUser = useMemo(() => state.users.find((user) => user.id === state.currentUserId) ?? null, [state.currentUserId, state.users]);
  const activeSegment = useMemo(
    () => state.segments.find((segment) => segment.id === activeSegmentId) ?? state.segments[0],
    [activeSegmentId, state.segments]
  );
  const checks = useMemo(() => computeQuality(state, saveState === 'dirty' || saveState === 'saving'), [saveState, state]);
  const aiHints = useMemo(() => buildAiHints(state), [state]);
  const stats = useMemo(() => analytics(state), [state]);
  const timelineDuration = useMemo(
    () => Math.max(1, duration || 0, state.media.duration || 0, getSegmentsDuration(state.segments)),
    [duration, state.media.duration, state.segments]
  );

  const commit = useCallback(
    (updater: (previous: AppState) => AppState, track = true) => {
      const previous = stateRef.current;
      const next = updater(cloneState(previous));
      if (track) {
        setUndoStack((stack) => [cloneState(previous), ...stack].slice(0, 25));
        setRedoStack([]);
      }
      stateRef.current = next;
      setState(next);
      setSaveState('dirty');
    },
    []
  );

  const announce = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };

  function updateAsrEndpoint(value: string) {
    setAsrEndpoint(value);
    sessionStorage.setItem(ASR_ENDPOINT_STORAGE, value.trim());
  }

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (checklistRuntimeMigrationRef.current || state.checklistPresetVersion === CHECKLIST_PRESET_VERSION) return;
    checklistRuntimeMigrationRef.current = true;
    const next: AppState = {
      ...state,
      annotatorChecklist: normalizeChecklist(state.annotatorChecklist, annotatorChecklistPreset),
      verifierChecklist: normalizeChecklist(state.verifierChecklist, verifierChecklistPreset),
      checklistPresetVersion: CHECKLIST_PRESET_VERSION,
      savedAt: new Date().toISOString()
    };
    stateRef.current = next;
    setState(next);
    setSaveState('dirty');
  }, [state]);

  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }

    setSaveState('saving');
    const handle = window.setTimeout(() => {
      const snapshot = { ...state, savedAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      setSaveState('saved');
      setLastSaved(new Date());
    }, 900);

    return () => window.clearTimeout(handle);
  }, [state]);

  useEffect(() => {
    if (!currentUser || !['workspace', 'verification'].includes(activeView) || !waveformRef.current) return;
    if (!audioUrl) {
      try {
        wavesurferRef.current?.destroy();
      } catch {
        // Ignore WaveSurfer aborts while the empty task waits for user media.
      }
      wavesurferRef.current = null;
      return;
    }

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#aab8c7',
      progressColor: '#168f86',
      cursorColor: '#243447',
      cursorWidth: 2,
      height: 146,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      normalize: true,
      minPxPerSec: zoom
    });

    wavesurferRef.current = ws;
    const peakDuration = Math.max(stateRef.current.media.duration, getSegmentsDuration(stateRef.current.segments), 1);
    const timelinePeaks = buildTimelinePeaks(stateRef.current.segments, peakDuration);
    void ws.load(audioUrl, timelinePeaks, timelinePeaks ? peakDuration : undefined).catch(() => undefined);
    ws.on('ready', () => {
      const loadedDuration = ws.getDuration();
      setDuration((previous) => Math.max(previous, loadedDuration));
      const currentMediaDuration = stateRef.current.media.duration;
      if (loadedDuration > currentMediaDuration) {
        commit(
          (previous) => ({
            ...previous,
            media: { ...previous.media, duration: seconds(Math.max(previous.media.duration, loadedDuration, getSegmentsDuration(previous.segments))) }
          }),
          false
        );
      }
    });
    ws.on('timeupdate', (time) => setCurrentTime(time));
    ws.on('interaction', () => {
      setCurrentTime(ws.getCurrentTime());
      syncVideo(ws.getCurrentTime());
    });
    ws.on('play', () => {
      setIsPlaying(true);
      videoRef.current?.play().catch(() => undefined);
    });
    ws.on('pause', () => {
      setIsPlaying(false);
      videoRef.current?.pause();
      clearPlayStopTimer();
    });
    ws.on('finish', () => {
      setIsPlaying(false);
      playTargetRef.current = null;
    });

    return () => {
      try {
        ws.destroy();
      } catch {
        // WaveSurfer can throw AbortError while React remounts in dev mode.
      }
      wavesurferRef.current = null;
    };
  }, [activeView, audioUrl, currentUser?.id, state.media.duration]);

  useEffect(() => {
    if (activeSegment && activeSegment.id !== activeSegmentId) setActiveSegmentId(activeSegment.id);
  }, [activeSegment, activeSegmentId]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    try {
      if (ws.getDuration() > 0) ws.zoom(zoom);
    } catch {
      // The waveform is not ready yet; initial minPxPerSec covers the first render.
    }
  }, [zoom]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (ws) ws.setPlaybackRate(speed);
    if (audioRef.current) audioRef.current.playbackRate = speed;
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const target = playTargetRef.current;
    if (!target || !isPlaying) return;

    if (currentTime >= target.end - 0.005) {
      const ws = wavesurferRef.current;
      if (!ws) return;

      if (loopSegment) {
        ws.setTime(target.start);
        syncVideo(target.start);
        ws.play();
      } else {
        ws.setTime(target.end);
        syncVideo(target.end);
        ws.pause();
        playTargetRef.current = null;
      }
    }
  }, [currentTime, isPlaying, loopSegment]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || target?.tagName === 'SELECT';
      if (isTyping && !(event.metaKey || event.ctrlKey)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectRelativeSegment(1);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectRelativeSegment(-1);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function syncVideo(time: number) {
    if (!videoRef.current) return;
    if (Number.isFinite(time)) videoRef.current.currentTime = time;
  }

  function clearPlayStopTimer() {
    if (playStopTimerRef.current === null) return;
    window.clearTimeout(playStopTimerRef.current);
    playStopTimerRef.current = null;
  }

  function undo() {
    const previous = undoStack[0];
    if (!previous) return;
    setRedoStack((stack) => [cloneState(state), ...stack].slice(0, 25));
    setUndoStack((stack) => stack.slice(1));
    stateRef.current = previous;
    setState(previous);
    setSaveState('dirty');
    announce('Изменение отменено');
  }

  function redo() {
    const next = redoStack[0];
    if (!next) return;
    setUndoStack((stack) => [cloneState(state), ...stack].slice(0, 25));
    setRedoStack((stack) => stack.slice(1));
    stateRef.current = next;
    setState(next);
    setSaveState('dirty');
    announce('Изменение возвращено');
  }

  function login(userId: string) {
    const user = state.users.find((item) => item.id === userId);
    if (!user) return;
    if (user.status === 'blocked') {
      announce('Профиль заблокирован. Вход недоступен.');
      return;
    }
    commit(
      (previous) => {
        const nextStatus: TaskStatus = user.role === 'annotator' && previous.task.status === 'Назначена' ? 'В работе' : previous.task.status;
        let next: AppState = {
          ...previous,
          currentUserId: userId,
          task: { ...previous.task, status: nextStatus }
        };
        next = addAudit(next, userId, 'Auth', userId, 'login', '', user.role);
        if (nextStatus !== previous.task.status) {
          next = addAudit(next, userId, 'Task', previous.task.id, 'status', previous.task.status, nextStatus);
        }
        return next;
      },
      false
    );
    setActiveView(roleViews[user.role][0]);
  }

  function logout() {
    commit((previous) => ({ ...previous, currentUserId: null }), false);
  }

  function resetDemo() {
    localStorage.removeItem(STORAGE_KEY);
    const empty = createEmptyState();
    stateRef.current = empty;
    setState(empty);
    setActiveSegmentId('');
    setAudioUrl('');
    setVideoUrl('');
    audioFileRef.current = null;
    videoFileRef.current = null;
    decodedAudioRef.current = null;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setUndoStack([]);
    setRedoStack([]);
    setSaveState('saved');
    announce('Рабочая область очищена');
  }

  function selectRelativeSegment(direction: number) {
    const index = state.segments.findIndex((segment) => segment.id === activeSegmentId);
    const next = state.segments[index + direction];
    if (next) {
      selectSegmentOnTimeline(next);
    }
  }

  function seekTo(time: number) {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.setTime(Math.max(0, Math.min(timelineDuration, time)));
    syncVideo(time);
  }

  function scrollTimelineToSegment(segment: Segment) {
    const waveElement = waveformRef.current;
    const shell = waveElement?.closest('.wave-shell') as HTMLElement | null;
    if (!shell) return;

    const safeDuration = timelineDuration || segment.endTime || 1;
    const segmentCenterPx = ((segment.startTime + segment.endTime) / 2) * getTimelineScale(safeDuration, zoom);
    const nextScrollLeft = Math.max(0, segmentCenterPx - shell.clientWidth / 2);
    shell.scrollTo({ left: nextScrollLeft, behavior: 'smooth' });
  }

  function selectSegmentOnTimeline(segment: Segment) {
    setActiveSegmentId(segment.id);
    seekTo(segment.startTime);
    scrollTimelineToSegment(segment);
  }

  function togglePlayback() {
    const ws = wavesurferRef.current;
    if (!ws) return;
    playTargetRef.current = null;
    clearPlayStopTimer();
    ws.playPause();
  }

  function playSelectedSegment() {
    if (!activeSegment) return;
    const ws = wavesurferRef.current;
    const audio = audioRef.current;
    if (!ws && !audio) return;

    const start = Math.max(0, seconds(activeSegment.startTime));
    const playerDuration = Math.max(ws?.getDuration() || 0, audio?.duration || 0, timelineDuration || 0, activeSegment.endTime);
    const end = Math.min(playerDuration || activeSegment.endTime, seconds(activeSegment.endTime));
    if (end <= start) return;

    clearPlayStopTimer();
    playTargetRef.current = null;
    ws?.pause();
    if (audio) audio.pause();

    playTargetRef.current = { start, end };
    syncVideo(start);
    if (ws) {
      ws.setTime(start);
      window.setTimeout(() => {
        const target = playTargetRef.current;
        if (target?.start === start && target.end === end) ws.play();
      }, 0);
    } else if (audio) {
      audio.currentTime = start;
      audio.playbackRate = speed;
      window.setTimeout(() => {
        const target = playTargetRef.current;
        if (target?.start === start && target.end === end) audio.play().catch(() => announce('Браузер не дал запустить звук автоматически'));
      }, 0);
    }

    if (!loopSegment) {
      const playbackMs = Math.max(20, ((end - start) / Math.max(speed, 0.1)) * 1000);
      playStopTimerRef.current = window.setTimeout(() => {
        if (playTargetRef.current?.start !== start || playTargetRef.current?.end !== end) return;
        const currentWs = wavesurferRef.current;
        const currentAudio = audioRef.current;
        currentWs?.setTime(end);
        if (!currentWs && currentAudio) currentAudio.currentTime = end;
        syncVideo(end);
        currentWs?.pause();
        if (!currentWs) currentAudio?.pause();
        playTargetRef.current = null;
        clearPlayStopTimer();
      }, playbackMs);
    }
    markSegmentListened(activeSegment.id, end);
  }

  function pauseMediaAt(time: number) {
    const ws = wavesurferRef.current;
    const audio = audioRef.current;
    ws?.setTime(time);
    if (!ws && audio) audio.currentTime = time;
    ws?.pause();
    if (!ws) audio?.pause();
    syncVideo(time);
    playTargetRef.current = null;
    clearPlayStopTimer();
  }

  async function getWhisperTranscriber(): Promise<WhisperTranscriber> {
    if ((window as GeckoTestWindow).__GECKO_TEST_DISABLE_WHISPER) {
      throw new Error('Whisper отключён только для автотеста');
    }
    if (!whisperRef.current) {
      setAiModelStatus('loading');
      whisperRef.current = (async () => {
        const transformersUrls = [
          'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2',
          'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js',
          'https://unpkg.com/@huggingface/transformers@3.7.2',
          'https://unpkg.com/@huggingface/transformers@3.7.2/dist/transformers.min.js',
          'https://esm.sh/@huggingface/transformers@3.7.2'
        ];
        let transformers: {
          env: {
            allowLocalModels: boolean;
            allowRemoteModels?: boolean;
            localModelPath?: string;
            useBrowserCache: boolean;
            remoteHost?: string;
          };
          pipeline: (...args: unknown[]) => Promise<unknown>;
        } | null = null;
        const errors: string[] = [];
        for (const url of transformersUrls) {
          try {
            transformers = await import(/* @vite-ignore */ url);
            break;
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }
        if (!transformers) {
          throw new Error(`Transformers.js не загрузился с доступных CDN: ${errors.at(-1) ?? 'нет ответа'}`);
        }
        const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
        const baseUrl = env?.BASE_URL ?? '/';
        transformers.env.allowLocalModels = false;
        transformers.env.useBrowserCache = true;
        const modelCandidates = ['onnx-community/whisper-tiny', 'Xenova/whisper-tiny'];
        try {
          transformers.env.allowLocalModels = true;
          transformers.env.allowRemoteModels = false;
          transformers.env.localModelPath = `${baseUrl}models/`;
          const transcriber = await transformers.pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
            dtype: 'q8'
          });
          return transcriber as WhisperTranscriber;
        } catch (localError) {
          transformers.env.allowRemoteModels = true;
          errors.push(`local model: ${localError instanceof Error ? localError.message : String(localError)}`);
        }
        const modelHosts = ['https://huggingface.co', 'https://hf-mirror.com'];
        const modelErrors: string[] = [];
        for (const host of modelHosts) {
          transformers.env.remoteHost = host;
          for (const modelId of modelCandidates) {
            for (let attempt = 1; attempt <= 2; attempt += 1) {
              try {
                const transcriber = await transformers.pipeline('automatic-speech-recognition', modelId, {
                  dtype: 'q8'
                });
                return transcriber as WhisperTranscriber;
              } catch (error) {
                modelErrors.push(`${modelId} @ ${host}: ${error instanceof Error ? error.message : String(error)}`);
                if (attempt < 2) await wait(1200);
              }
            }
          }
        }
        throw new Error(`Модель Whisper не загрузилась: ${modelErrors.at(-1) ?? 'нет ответа от CDN модели'}`);
      })();
    }
    try {
      const transcriber = await whisperRef.current;
      setAiModelStatus('ready');
      return transcriber;
    } catch (error) {
      whisperRef.current = null;
      setAiModelStatus('error');
      throw error;
    }
  }

  async function getFfmpeg(): Promise<FfmpegInstance> {
    if (!ffmpegRef.current) {
      ffmpegRef.current = (async () => {
        const { FFmpeg } = await loadPatchedFfmpegGlobal();
        const ffmpeg = new FFmpeg() as FfmpegInstance;
        const baseUrl = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
        await ffmpeg.load({
          classWorkerURL: await remoteBlobUrl('https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd/814.ffmpeg.js', 'text/javascript'),
          coreURL: await remoteBlobUrl(`${baseUrl}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await remoteBlobUrl(`${baseUrl}/ffmpeg-core.wasm`, 'application/wasm')
        });
        return ffmpeg;
      })();
    }

    try {
      return await ffmpegRef.current;
    } catch (error) {
      ffmpegRef.current = null;
      throw error;
    }
  }

  async function getDecodedAudio(): Promise<DecodedAudioCache> {
    const file = audioFileRef.current;
    const cacheKey = file ? `${file.name}:${file.size}:${file.lastModified}` : audioUrl;
    if (!file && !audioUrl) throw new Error('Сначала загрузите аудио или видео с аудиодорожкой');
    if (decodedAudioRef.current?.url === cacheKey) return decodedAudioRef.current;
    const arrayBuffer = file ? await file.arrayBuffer() : await (await fetch(audioUrl)).arrayBuffer();
    const audioContext = new AudioContext();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      const decoded = {
        url: cacheKey,
        sampleRate: audioBuffer.sampleRate,
        samples: mixToMono(audioBuffer)
      };
      decodedAudioRef.current = decoded;
      return decoded;
    } finally {
      void audioContext.close();
    }
  }

  async function decodeAudioBlob(blob: Blob): Promise<DecodedAudioCache> {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      return {
        url: `recorded-${Date.now()}`,
        sampleRate: audioBuffer.sampleRate,
        samples: mixToMono(audioBuffer)
      };
    } finally {
      void audioContext.close();
    }
  }

  async function recordFromMediaElement(sourceElement: HTMLMediaElement, segment: Segment): Promise<DecodedAudioCache> {
    if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder недоступен в этом браузере');

    const previousTime = sourceElement.currentTime;
    const wasPaused = sourceElement.paused;
    const audioContext = new AudioContext();
    let stream: MediaStream | null = null;

    try {
      if (sourceElement.readyState < 1) await waitForMediaEvent(sourceElement, 'loadedmetadata');
      sourceElement.currentTime = Math.max(0, segment.startTime);
      await waitForMediaEvent(sourceElement, 'seeked');

      try {
        const source = audioContext.createMediaElementSource(sourceElement);
        const destination = audioContext.createMediaStreamDestination();
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        source.connect(destination);
        source.connect(silentGain);
        silentGain.connect(audioContext.destination);
        await audioContext.resume();
        stream = destination.stream;
      } catch {
        const captureElement = sourceElement as CaptureMediaElement;
        stream = captureElement.captureStream?.() ?? captureElement.mozCaptureStream?.() ?? null;
      }

      if (!stream) throw new Error('Браузер не умеет извлекать аудио из текущего плеера');
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) throw new Error('В текущем медиа нет аудиодорожки');

      const chunks: Blob[] = [];
      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(new MediaStream(audioTracks), mimeType ? { mimeType } : undefined);
      const stopped = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => reject(new Error('Не удалось записать аудиофрагмент для Whisper'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      });

      recorder.start(80);
      await sourceElement.play();
      const durationMs = Math.max(300, Math.min(30000, (segment.endTime - segment.startTime) * 1000 + 180));
      await new Promise((resolve) => window.setTimeout(resolve, durationMs));
      recorder.stop();
      const blob = await stopped;
      stream.getTracks().forEach((track) => track.stop());
      return decodeAudioBlob(blob);
    } finally {
      sourceElement.pause();
      if (Number.isFinite(previousTime)) sourceElement.currentTime = previousTime;
      if (!wasPaused) sourceElement.play().catch(() => undefined);
      stream?.getTracks().forEach((track) => track.stop());
      void audioContext.close();
    }
  }

  async function restoreCachedMediaFiles(): Promise<void> {
    const media = stateRef.current.media;
    if (!audioFileRef.current && media.audioPath && media.audioPath !== '/demo-audio.wav' && !media.audioPath.startsWith('blob:')) {
      audioFileRef.current = await restoreMediaFile('audio', media.audioPath);
    }
    if (!videoFileRef.current && media.videoPath && !media.videoPath.startsWith('blob:')) {
      videoFileRef.current = await restoreMediaFile('video', media.videoPath);
    }
    if (!audioFileRef.current && !videoFileRef.current && media.audioPath && !media.audioPath.startsWith('blob:')) {
      videoFileRef.current = await restoreMediaFile('video', media.audioPath);
    }
  }

  async function getAiSourceFile(): Promise<File | null> {
    await restoreCachedMediaFiles();
    return audioFileRef.current ?? videoFileRef.current;
  }

  function extensionForMediaFile(file: File): string {
    const fromName = file.name.match(/\.([a-z0-9]+)$/i)?.[1];
    if (fromName) return fromName.toLowerCase();
    if (file.type.includes('mp4')) return 'mp4';
    if (file.type.includes('webm')) return 'webm';
    if (file.type.includes('mpeg')) return 'mp3';
    if (file.type.includes('wav')) return 'wav';
    return file.type.startsWith('video/') ? 'mp4' : 'wav';
  }

  async function extractSegmentWithFfmpeg(segment: Segment): Promise<DecodedAudioCache> {
    const sourceFile = await getAiSourceFile();
    if (!sourceFile) {
      throw new Error('Заново загрузите видео или аудио: исходный файл не найден в памяти браузера');
    }

    const ffmpeg = await getFfmpeg();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const inputName = `input-${stamp}.${extensionForMediaFile(sourceFile)}`;
    const outputName = `segment-${stamp}.wav`;
    const durationSeconds = Math.max(0.25, seconds(segment.endTime - segment.startTime));

    try {
      await ffmpeg.writeFile(inputName, new Uint8Array(await sourceFile.arrayBuffer()));
      await ffmpeg.exec([
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        String(Math.max(0, seconds(segment.startTime))),
        '-t',
        String(durationSeconds),
        '-i',
        inputName,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-f',
        'wav',
        outputName
      ]);
      const output = await ffmpeg.readFile(outputName);
      const bytes = typeof output === 'string' ? new TextEncoder().encode(output) : output;
      const wavBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(wavBuffer).set(bytes);
      return decodeAudioBlob(new Blob([wavBuffer], { type: 'audio/wav' }));
    } finally {
      await ffmpeg.deleteFile?.(inputName).catch(() => undefined);
      await ffmpeg.deleteFile?.(outputName).catch(() => undefined);
    }
  }

  async function recordSegmentAudio(segment: Segment): Promise<DecodedAudioCache> {
    await getAiSourceFile();
    const liveElement = videoRef.current?.src ? videoRef.current : audioRef.current?.src ? audioRef.current : null;
    if (liveElement) {
      try {
        return await recordFromMediaElement(liveElement, segment);
      } catch {
        // Fall back to a fresh element built from the cached/uploaded file.
      }
    }

    const sourceFile = audioFileRef.current ?? videoFileRef.current;
    const sourceUrl = sourceFile ? URL.createObjectURL(sourceFile) : audioUrl;
    if (!sourceUrl) throw new Error('Сначала заново загрузите аудио или видео: браузер потерял исходный файл после обновления страницы');
    if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder недоступен в этом браузере');

    const isVideoSource = Boolean(sourceFile?.type.startsWith('video/') || (!sourceFile && videoUrl && audioUrl === videoUrl));
    const element = document.createElement(isVideoSource ? 'video' : 'audio') as CaptureMediaElement;
    element.src = sourceUrl;
    element.preload = 'auto';
    if (element instanceof HTMLVideoElement) element.playsInline = true;
    element.muted = true;
    element.volume = 0;
    element.style.position = 'fixed';
    element.style.left = '-9999px';
    element.style.width = '1px';
    element.style.height = '1px';
    document.body.appendChild(element);

    try {
      element.load();
      if (element.readyState < 1) await waitForMediaEvent(element, 'loadedmetadata');
      element.currentTime = Math.max(0, segment.startTime);
      await waitForMediaEvent(element, 'seeked');

      const audioContext = new AudioContext();
      let stream: MediaStream | null = null;
      try {
        const source = audioContext.createMediaElementSource(element);
        const destination = audioContext.createMediaStreamDestination();
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        source.connect(destination);
        source.connect(silentGain);
        silentGain.connect(audioContext.destination);
        await audioContext.resume();
        stream = destination.stream;
      } catch {
        const captureElement = element as CaptureMediaElement;
        stream = captureElement.captureStream?.() ?? captureElement.mozCaptureStream?.() ?? null;
      }
      if (!stream) {
        void audioContext.close();
        throw new Error('Браузер не умеет извлекать аудио из video/audio элемента');
      }
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        void audioContext.close();
        throw new Error('В медиафайле не найдена аудиодорожка');
      }

      const chunks: Blob[] = [];
      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(new MediaStream(audioTracks), mimeType ? { mimeType } : undefined);
      const stopped = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => reject(new Error('Не удалось записать аудиофрагмент для Whisper'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      });

      recorder.start(80);
      await element.play();
      const durationMs = Math.max(300, Math.min(30000, (segment.endTime - segment.startTime) * 1000 + 180));
      await new Promise((resolve) => window.setTimeout(resolve, durationMs));
      recorder.stop();
      element.pause();
      stream.getTracks().forEach((track) => track.stop());
      const decoded = await decodeAudioBlob(await stopped);
      void audioContext.close();
      return decoded;
    } finally {
      element.pause();
      element.removeAttribute('src');
      element.load();
      element.remove();
      if (sourceFile) URL.revokeObjectURL(sourceUrl);
    }
  }

  async function getSegmentAudioSamples(segment: Segment): Promise<{ samples: Float32Array; source: SegmentAudioSource }> {
    let decoded: DecodedAudioCache;
    let source: SegmentAudioSource = 'decoded-file';
    try {
      decoded = await getDecodedAudio();
    } catch {
      try {
        decoded = await extractSegmentWithFfmpeg(segment);
        source = 'ffmpeg-extracted';
      } catch {
        decoded = await recordSegmentAudio(segment);
        source = 'recorded-media';
      }
    }
    const startIndex = Math.max(0, Math.floor(segment.startTime * decoded.sampleRate));
    const endIndex = Math.min(decoded.samples.length, Math.ceil(segment.endTime * decoded.sampleRate));
    const segmentSamples = source === 'decoded-file'
      ? decoded.samples.slice(startIndex, Math.max(startIndex + 1, endIndex))
      : decoded.samples;
    return { samples: resampleAudio(segmentSamples, decoded.sampleRate, 16000), source };
  }

  async function transcribeSegmentWithWhisper(segment: Segment): Promise<Pick<AiAudioResult, 'transcript' | 'engine' | 'detail'>> {
    const transcriber = await getWhisperTranscriber();
    const { samples, source } = await getSegmentAudioSamples(segment);
    const result = await transcriber(samples, {
      language: 'russian',
      task: 'transcribe',
      chunk_length_s: 20,
      stride_length_s: 2
    });
    const text = typeof result === 'string' ? result : result.text ?? '';
    return {
      transcript: text.trim(),
      engine: 'whisper-browser',
      detail: source === 'ffmpeg-extracted'
        ? 'Текст распознан Whisper из WAV-фрагмента, извлечённого из видео/аудио через ffmpeg.wasm.'
        : source === 'recorded-media'
          ? 'Текст распознан Whisper из записанного аудиофрагмента видео/медиа.'
          : 'Текст распознан Whisper из аудио сегмента в браузере.'
    };
  }

  async function transcribeSegmentWithBackendAsr(segment: Segment, endpoint: string): Promise<Pick<AiAudioResult, 'transcript' | 'engine' | 'detail'>> {
    const baseUrl = endpoint.trim().replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Backend ASR URL не настроен');
    const { samples, source } = await getSegmentAudioSamples(segment);
    const wav = encodeWav(samples, 16000);
    const form = new FormData();
    form.append('file', new File([wav], `${segment.id}.wav`, { type: 'audio/wav' }));

    const response = await fetch(`${baseUrl}/asr/transcribe`, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Backend ASR ${response.status}: ${errorText.slice(0, 220) || response.statusText}`);
    }

    const payload = await response.json() as { text?: string; engine?: string };
    return {
      transcript: (payload.text ?? '').trim(),
      engine: 'backend-asr',
      detail: source === 'ffmpeg-extracted'
        ? `Текст распознан backend ASR${payload.engine ? ` (${payload.engine})` : ''} из WAV-фрагмента, извлечённого через ffmpeg.wasm.`
        : source === 'recorded-media'
          ? `Текст распознан backend ASR${payload.engine ? ` (${payload.engine})` : ''} из записанного аудиофрагмента.`
          : `Текст распознан backend ASR${payload.engine ? ` (${payload.engine})` : ''} из аудио сегмента.`
    };
  }

  async function transcribeSegmentWithAi(segment: Segment, endpoint: string): Promise<Pick<AiAudioResult, 'transcript' | 'engine' | 'detail'>> {
    if (endpoint.trim()) {
      try {
        return await transcribeSegmentWithBackendAsr(segment, endpoint);
      } catch (backendError) {
        try {
          const whisper = await transcribeSegmentWithWhisper(segment);
          return {
            ...whisper,
            detail: `${whisper.detail} Backend ASR недоступен: ${backendError instanceof Error ? backendError.message : String(backendError)}`
          };
        } catch (whisperError) {
          throw new Error(
            `Backend ASR недоступен: ${backendError instanceof Error ? backendError.message : String(backendError)}; ` +
            `Whisper недоступен: ${whisperError instanceof Error ? whisperError.message : String(whisperError)}`
          );
        }
      }
    }

    return transcribeSegmentWithWhisper(segment);
  }

  function buildAiAudioResult(segment: Segment, transcript: string, engine: AiAudioResult['engine'], detail: string): AiAudioResult {
    const similarity = textSimilarity(transcript, segment.text);
    return {
      segmentId: segment.id,
      transcript,
      similarity,
      level: audioQualityLevel(segment, similarity, engine),
      engine,
      detail,
      checkedAt: new Date().toISOString()
    };
  }

  async function runAiAudioAudit(scope: 'active' | 'all') {
    const targets = scope === 'active' && activeSegment ? [activeSegment] : state.segments.slice().sort((a, b) => a.startTime - b.startTime);
    if (targets.length === 0) {
      announce('Нет сегментов для AI-проверки');
      return;
    }

    setAiAudioRunning(true);
    setAiAudioProgress('');
    setAiModelStatus('loading');
    const aiProviderName = asrEndpoint.trim() ? 'Backend ASR' : 'Whisper';
    announce(scope === 'active' ? `${aiProviderName} распознаёт активный сегмент` : `${aiProviderName} распознаёт сегменты`);
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        setAiAudioProgress(`${index + 1}/${targets.length} · ${target.id}`);
        try {
          const transcript = await transcribeSegmentWithAi(target, asrEndpoint);
          setAiAudioResults((previous) => ({
            ...previous,
            [target.id]: buildAiAudioResult(target, transcript.transcript, transcript.engine, transcript.detail)
          }));
        } catch (error) {
          const fallbackText = target.sourceText || '';
          const detail = error instanceof Error ? error.message : 'AI-ASR не смог распознать сегмент';
          setAiAudioResults((previous) => ({
            ...previous,
            [target.id]: buildAiAudioResult(
              target,
              fallbackText,
              'gecko-fallback',
              `AI-ASR недоступен: ${detail}. Это не считается настоящим AI-распознаванием.`
            )
          }));
        }
        markSegmentListened(target.id, target.endTime);
      }
      if (asrEndpoint.trim()) setAiModelStatus('ready');
      announce('AI-ASR проверка качества завершена');
    } finally {
      setAiAudioRunning(false);
      setAiAudioProgress('');
    }
  }

  function markSegmentListened(segmentId: string, listenedUntil = currentTime) {
    commit(
      (previous) => ({
        ...previous,
        segments: previous.segments.map((segment) => (segment.id === segmentId ? { ...segment, listened: true } : segment)),
        task: {
          ...previous.task,
          listenedSeconds: Math.max(previous.task.listenedSeconds, listenedUntil)
        }
      }),
      false
    );
  }

  function updateSegment(segmentId: string, patch: Partial<Segment>, action = 'segment_update') {
    const segment = state.segments.find((item) => item.id === segmentId);
    commit((previous) => {
      let next: AppState = {
        ...previous,
        segments: previous.segments.map((item) => (item.id === segmentId ? { ...item, ...patch } : item))
      };
      const actor = previous.currentUserId ?? 'system';
      next = addHistory(next, actor, action, segmentId, segment ? JSON.stringify(segment) : '', JSON.stringify(patch));
      next = addAudit(next, actor, 'Segment', segmentId, action, '', JSON.stringify(patch));
      return next;
    });
  }

  function createSegment(startOverride?: number, endOverride?: number) {
    const mediaDuration = timelineDuration || 9999;
    const start = Math.max(0, Math.min(mediaDuration, startOverride ?? (activeSegment ? activeSegment.endTime + 0.12 : currentTime)));
    const end = Math.max(start + 0.05, Math.min(mediaDuration, endOverride ?? start + 2.2));
    const id = `seg-${Date.now().toString(36)}`;
    const segment: Segment = {
      id,
      taskId: state.task.id,
      startTime: seconds(start),
      endTime: seconds(end),
      text: '',
      sourceText: '',
      speakerId: activeSegment?.speakerId ?? state.speakers[0]?.id ?? 'spk-1',
      status: 'new',
      confidence: 0.75,
      isCrosstalk: false,
      listened: false
    };

    commit((previous) => addHistory({ ...previous, segments: [...previous.segments, segment] }, previous.currentUserId ?? 'system', 'Создан сегмент', id));
    setActiveSegmentId(id);
    seekTo(segment.startTime);
  }

  function deleteSegment(segmentId: string) {
    if (state.segments.length <= 1) {
      announce('Нужен минимум один сегмент');
      return;
    }

    const index = state.segments.findIndex((segment) => segment.id === segmentId);
    commit((previous) => {
      const nextSegments = previous.segments.filter((segment) => segment.id !== segmentId);
      return addHistory({ ...previous, segments: nextSegments }, previous.currentUserId ?? 'system', 'Удалён сегмент', segmentId);
    });
    const next = state.segments[index - 1] ?? state.segments[index + 1];
    if (next) setActiveSegmentId(next.id);
  }

  function splitSegment() {
    if (!activeSegment) return;
    const midpoint = seconds((activeSegment.startTime + activeSegment.endTime) / 2);
    const left: Segment = { ...activeSegment, endTime: midpoint, text: activeSegment.text.replace(/\s+/g, ' ').trim() };
    const right: Segment = {
      ...activeSegment,
      id: `seg-${Date.now().toString(36)}`,
      startTime: midpoint,
      status: 'new',
      listened: false,
      text: ''
    };

    commit((previous) => {
      const segments = previous.segments.flatMap((segment) => (segment.id === activeSegment.id ? [left, right] : [segment]));
      return addHistory({ ...previous, segments }, previous.currentUserId ?? 'system', 'Разделён сегмент', activeSegment.id);
    });
    setActiveSegmentId(right.id);
  }

  function mergeWithNext() {
    if (!activeSegment) return;
    const ordered = [...state.segments].sort((a, b) => a.startTime - b.startTime);
    const index = ordered.findIndex((segment) => segment.id === activeSegment.id);
    const next = ordered[index + 1];
    if (!next) {
      announce('Следующего сегмента нет');
      return;
    }

    const merged: Segment = {
      ...activeSegment,
      endTime: next.endTime,
      text: `${activeSegment.text.trim()} ${next.text.trim()}`.trim(),
      confidence: Math.min(activeSegment.confidence, next.confidence),
      isCrosstalk: activeSegment.isCrosstalk || next.isCrosstalk,
      listened: activeSegment.listened && next.listened
    };

    commit((previous) => {
      const segments = previous.segments
        .filter((segment) => segment.id !== next.id)
        .map((segment) => (segment.id === activeSegment.id ? merged : segment));
      return addHistory({ ...previous, segments }, previous.currentUserId ?? 'system', 'Объединены сегменты', `${activeSegment.id}+${next.id}`);
    });
  }

  function toggleChecklist(kind: 'annotator' | 'verifier', id: string, done: boolean) {
    commit(
      (previous) => ({
        ...previous,
        annotatorChecklist: kind === 'annotator' ? updateChecklist(previous.annotatorChecklist, id, done) : previous.annotatorChecklist,
        verifierChecklist: kind === 'verifier' ? updateChecklist(previous.verifierChecklist, id, done) : previous.verifierChecklist
      }),
      false
    );
  }

  function checklistKey(kind: 'annotator' | 'verifier'): 'annotatorChecklist' | 'verifierChecklist' {
    return kind === 'annotator' ? 'annotatorChecklist' : 'verifierChecklist';
  }

  function addChecklistItem(kind: 'annotator' | 'verifier', label: string) {
    const clean = label.trim();
    if (!clean) return;
    const key = checklistKey(kind);
    const item: ChecklistItem = {
      id: `${kind}-custom-${Date.now().toString(36)}`,
      label: clean,
      done: false
    };
    commit((previous) => ({ ...previous, [key]: [...previous[key], item] }), false);
    announce('Пункт чек-листа добавлен');
  }

  function renameChecklistItem(kind: 'annotator' | 'verifier', id: string, label: string) {
    const key = checklistKey(kind);
    commit(
      (previous) => ({
        ...previous,
        [key]: previous[key].map((item) => (item.id === id ? { ...item, label } : item))
      }),
      false
    );
  }

  function deleteChecklistItem(kind: 'annotator' | 'verifier', id: string) {
    const key = checklistKey(kind);
    commit((previous) => ({ ...previous, [key]: previous[key].filter((item) => item.id !== id) }), false);
    announce('Пункт чек-листа удалён');
  }

  function submitForReview() {
    const critical = computeQuality(state, saveState !== 'saved').filter((check) => check.severity === 'critical');
    if (critical.length > 0) {
      announce('Есть критические проверки перед отправкой');
      return;
    }

    commit((previous) => {
      const nextStatus: TaskStatus = previous.task.status === 'На доработке' ? 'Исправлена' : 'На проверке';
      let next: AppState = { ...previous, task: { ...previous.task, status: nextStatus } };
      next = addAudit(next, previous.currentUserId ?? 'system', 'Task', previous.task.id, 'submit', previous.task.status, nextStatus);
      return next;
    });
    setActiveView('verification');
    announce('Задача отправлена на проверку');
  }

  function acceptTask() {
    commit((previous) => {
      let next: AppState = {
        ...previous,
        task: { ...previous.task, status: 'Принята' as TaskStatus },
        segments: previous.segments.map((segment) => ({ ...segment, status: segment.status === 'returned' ? 'checked' : segment.status }))
      };
      next = addAudit(next, previous.currentUserId ?? 'system', 'Task', previous.task.id, 'accept', previous.task.status, 'Принята');
      return next;
    });
    announce('Задача принята');
  }

  function returnTask() {
    const text = commentDraft.trim() || 'Вернуть на доработку: уточнить замечания по отмеченным сегментам.';
    const comment: VerificationComment = {
      id: `comment-${Date.now().toString(36)}`,
      taskId: state.task.id,
      segmentId: activeSegment?.id,
      authorId: currentUser?.id ?? 'u-verifier',
      category: 'workflow',
      text,
      status: 'open',
      createdAt: new Date().toISOString()
    };

    commit((previous) => {
      let next = {
        ...previous,
        task: { ...previous.task, status: 'На доработке' as TaskStatus, returnCount: previous.task.returnCount + 1 },
        comments: [comment, ...previous.comments],
        segments: previous.segments.map((segment) => (segment.id === comment.segmentId ? { ...segment, status: 'returned' as const } : segment))
      };
      next = addAudit(next, previous.currentUserId ?? 'system', 'Task', previous.task.id, 'return', previous.task.status, 'На доработке');
      return next;
    });
    setCommentDraft('');
    announce('Задача возвращена на доработку');
  }

  function resolveComment(commentId: string) {
    commit(
      (previous) => ({
        ...previous,
        comments: previous.comments.map((comment) => (comment.id === commentId ? { ...comment, status: 'resolved' } : comment))
      }),
      false
    );
  }

  function addTermFromSelection(value: string) {
    const clean = value.trim();
    if (!clean) return;
    const normalized = clean.toLocaleLowerCase('ru-RU');
    if (state.terms.some((term) => term.value.toLocaleLowerCase('ru-RU') === normalized || term.normalizedValue.toLocaleLowerCase('ru-RU') === normalized)) {
      announce('Термин уже есть в словаре');
      return;
    }
    const term: Term = {
      id: `term-${Date.now().toString(36)}`,
      projectId: state.project.id,
      value: clean,
      normalizedValue: clean.toUpperCase() === clean ? clean : clean,
      type: /json|csv|ini|asn1/i.test(clean) ? 'extension' : /['’]/.test(clean) ? 'slang' : /^[A-ZА-ЯЁ]{2,}/.test(clean) ? 'abbreviation' : 'unknown',
      status: 'review',
      annotatorComment: 'Добавлено из рабочего места разметчика.',
      verifierComment: '',
      occurrences: state.segments.filter((segment) => segment.text.toLowerCase().includes(clean.toLowerCase())).length || 1
    };

    commit((previous) => ({ ...previous, terms: [term, ...previous.terms] }));
    setNewTerm('');
    announce('Термин добавлен на проверку');
  }

  function updateTerm(termId: string, patch: Partial<Term>) {
    commit(
      (previous) => ({
        ...previous,
        terms: previous.terms.map((term) => (term.id === termId ? { ...term, ...patch } : term))
      }),
      false
    );
  }

  function updateUser(userId: string, patch: Partial<AppState['users'][number]>) {
    const previousUser = state.users.find((user) => user.id === userId);
    commit(
      (previous) => {
        let next: AppState = {
          ...previous,
          users: previous.users.map((user) => (user.id === userId ? { ...user, ...patch } : user)),
          currentUserId: patch.status === 'blocked' && previous.currentUserId === userId ? null : previous.currentUserId
        };
        next = addAudit(next, previous.currentUserId ?? 'system', 'User', userId, 'admin_update_user', JSON.stringify(previousUser ?? {}), JSON.stringify(patch));
        return next;
      },
      false
    );
    announce('Настройки пользователя обновлены');
  }

  function updateTaskAdmin(patch: Partial<AppState['task']>) {
    commit(
      (previous) => {
        let next: AppState = { ...previous, task: { ...previous.task, ...patch } };
        next = addAudit(next, previous.currentUserId ?? 'system', 'Task', previous.task.id, 'admin_update_task', JSON.stringify(previous.task), JSON.stringify(patch));
        return next;
      },
      false
    );
    announce('Параметры задачи обновлены');
  }

  function addProjectRule(rule: string) {
    const clean = rule.trim();
    if (!clean) return;
    commit(
      (previous) => ({
        ...previous,
        project: { ...previous.project, rules: [clean, ...previous.project.rules] }
      }),
      false
    );
    announce('Правило добавлено');
  }

  function removeProjectRule(index: number) {
    commit(
      (previous) => ({
        ...previous,
        project: { ...previous.project, rules: previous.project.rules.filter((_, ruleIndex) => ruleIndex !== index) }
      }),
      false
    );
    announce('Правило удалено');
  }

  function handleAudioUpload(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    audioFileRef.current = file;
    decodedAudioRef.current = null;
    void storeMediaFile('audio', file.name, file).catch(() => announce('Не удалось сохранить аудио для AI-ASR после перезагрузки'));
    setAudioUrl(url);
    commit(
      (previous) => ({
        ...previous,
        media: {
          ...previous.media,
          audioPath: file.name,
          format: file.name.split('.').pop() ?? file.type,
          uploadedAt: new Date().toISOString()
        }
      }),
      false
    );
    announce('Аудиофайл загружен');
  }

  function handleVideoUpload(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    videoFileRef.current = file;
    decodedAudioRef.current = null;
    void storeMediaFile('video', file.name, file).catch(() => announce('Не удалось сохранить видео для AI-ASR после перезагрузки'));
    setVideoUrl(url);
    const useVideoAsAudio = !audioUrl || state.media.audioPath === '/demo-audio.wav';
    if (!audioUrl || state.media.audioPath === '/demo-audio.wav') {
      audioFileRef.current = null;
      setAudioUrl(url);
    }
    commit((previous) => ({ ...previous, media: { ...previous.media, videoPath: file.name, audioPath: useVideoAsAudio ? file.name : previous.media.audioPath } }), false);
    announce('Видео загружено и синхронизировано с плеером');
  }

  function handleJsonUpload(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = parseAnnotationText(file.name, String(reader.result));
        const imported = importSegmentsFromGecko(state, payload, `Импорт ${file.name}`);
        commit((previous) => {
          const nextDuration = imported.duration ? Math.max(previous.media.duration, imported.duration) : previous.media.duration;
          let next: AppState = {
            ...previous,
            speakers: imported.speakers,
            segments: imported.segments,
            versions: [imported.version, ...previous.versions].slice(0, 20),
            sourceSchemaVersion: imported.sourceSchemaVersion,
            media: { ...previous.media, duration: nextDuration },
            task: { ...previous.task, status: 'В работе' },
            annotatorChecklist: previous.annotatorChecklist.map((item) => (item.id === 'saved' ? { ...item, done: false } : item))
          };
          next = addHistory(next, previous.currentUserId ?? 'system', 'Импортирована предразметка', file.name, '', `${imported.segments.length} сегментов`);
          next = addAudit(next, previous.currentUserId ?? 'system', 'Transcript', previous.task.id, 'import_annotation', '', file.name);
          return next;
        });
        setDuration((previous) => Math.max(previous, imported.duration ?? previous));
        setActiveSegmentId(imported.segments[0]?.id ?? activeSegmentId);
        setActiveView('workspace');
        announce(`Импортировано сегментов: ${imported.segments.length}`);
      } catch (error) {
        announce(error instanceof Error ? error.message : 'Не удалось прочитать файл аннотации');
      }
    };
    reader.readAsText(file);
  }

  function handleVerifierCompareUpload(side: 'a' | 'b', file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = parseAnnotationText(file.name, String(reader.result));
        const imported = importSegmentsFromGecko(stateRef.current, payload, `Сравнение ${file.name}`);
        const compareFile = { name: file.name, segments: imported.segments };
        if (side === 'a') setVerifierCompareA(compareFile);
        else setVerifierCompareB(compareFile);
        announce(`Для сравнения загружено: ${file.name}`);
      } catch (error) {
        announce(error instanceof Error ? error.message : 'Не удалось прочитать JSON для сравнения');
      }
    };
    reader.readAsText(file);
  }

  function saveCurrentVersion() {
    commit((previous) => {
      const version = createTranscriptVersion(previous, `Рабочая версия ${previous.version + 1}`, 'autosave', 'Снимок текущей разметки перед дальнейшими правками.');
      return addHistory({ ...previous, versions: [version, ...previous.versions].slice(0, 20) }, previous.currentUserId ?? 'system', 'Сохранена версия', version.label);
    }, false);
    announce('Версия разметки сохранена');
  }

  function restoreVersion(versionId: string) {
    const version = state.versions.find((item) => item.id === versionId);
    if (!version) return;
    commit((previous) => {
      let next: AppState = {
        ...previous,
        segments: cloneState({ ...previous, segments: version.segments }).segments,
        task: { ...previous.task, status: 'В работе' }
      };
      next = addHistory(next, previous.currentUserId ?? 'system', 'Восстановлена версия', version.label);
      next = addAudit(next, previous.currentUserId ?? 'system', 'Transcript', previous.task.id, 'restore_version', '', version.label);
      return next;
    });
    setActiveSegmentId(version.segments[0]?.id ?? activeSegmentId);
    announce(`Восстановлена версия: ${version.label}`);
  }

  function exportMarkup() {
    const payload = exportGeckoJson(state, checks);
    downloadJson(`gecko-next-${state.task.id}.json`, payload);
    commit((previous) => {
      let next = { ...previous, task: { ...previous.task, status: 'Выгружена' as TaskStatus } };
      next = addAudit(next, previous.currentUserId ?? 'system', 'ExportFile', previous.task.id, 'export_json', previous.task.status, 'Выгружена');
      return next;
    }, false);
    announce('JSON экспортирован');
  }

  function exportReport() {
    downloadJson(`quality-report-${state.task.id}.json`, {
      project: state.project,
      task: state.task,
      checks,
      analytics: stats,
      exportedAt: new Date().toISOString()
    });
  }

  const availableViews = currentUser ? roleViews[currentUser.role] : [];

  if (!currentUser) {
    return <LoginScreen state={state} onLogin={login} onReset={resetDemo} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <Mic2 {...iconSize(22)} />
          </div>
          <div>
            <strong>Gecko Next</strong>
            <span>{state.project.name}</span>
          </div>
        </div>

        <div className="status-strip">
          <Badge tone={statusTone(state.task.status)}>{state.task.status}</Badge>
          <Badge tone={saveState === 'saved' ? 'good' : 'warning'}>
            <Save {...iconSize(14)} />
            {saveState === 'saved' ? `Сохранено${lastSaved ? ` ${lastSaved.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Сохранение'}
          </Badge>
          <Badge tone="neutral">
            <Clock3 {...iconSize(14)} />
            {formatTime(currentTime)} / {formatTime(timelineDuration)}
          </Badge>
        </div>

        <div className="user-block">
          <span>{currentUser.fullName}</span>
          <Badge tone="info">{roleTitle(currentUser.role)}</Badge>
          <button className="icon-button" onClick={logout} title="Выйти" aria-label="Выйти">
            <LogOut {...iconSize()} />
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <section className="side-section">
            <div className="section-title">Проект</div>
            <h2>{state.task.title}</h2>
            <p>{state.project.customer}</p>
            <div className="meta-grid">
              <span>Дедлайн</span>
              <strong>{new Date(state.task.deadline).toLocaleDateString('ru-RU')}</strong>
              <span>Приоритет</span>
              <strong>{state.task.priority}</strong>
            </div>
          </section>

          <nav className="nav-list" aria-label="Разделы">
            <NavButton icon={Mic2} label="Разметка" active={activeView === 'workspace'} disabled={!availableViews.includes('workspace')} onClick={() => setActiveView('workspace')} />
            <NavButton icon={ShieldCheck} label="Верификация" active={activeView === 'verification'} disabled={!availableViews.includes('verification')} onClick={() => setActiveView('verification')} />
            <NavButton icon={BookOpen} label="Термины" active={activeView === 'terms'} disabled={!availableViews.includes('terms')} onClick={() => setActiveView('terms')} />
            <NavButton icon={BarChart3} label="Аналитика" active={activeView === 'analytics'} disabled={!availableViews.includes('analytics')} onClick={() => setActiveView('analytics')} />
            <NavButton icon={Settings} label="Админ" active={activeView === 'admin'} disabled={!availableViews.includes('admin')} onClick={() => setActiveView('admin')} />
          </nav>

          <section className="side-section">
            <div className="section-title">Импорт</div>
            <FileInput icon={FileAudio} label="Аудио" accept="audio/*" onFile={handleAudioUpload} />
            <FileInput icon={Video} label="Видео" accept="video/*" onFile={handleVideoUpload} />
            <FileInput icon={FileJson} label="Аннотация" accept="application/json,.json,.csv,.rttm,.ctm,text/csv,text/plain" onFile={handleJsonUpload} />
          </section>

          <section className="side-section">
            <div className="section-title">Экспорт</div>
            <button className="action-button primary" onClick={exportMarkup}>
              <Download {...iconSize()} />
              JSON Gecko
            </button>
            <button className="action-button" onClick={exportReport}>
              <FileText {...iconSize()} />
              Отчёт QA
            </button>
          </section>
        </aside>

        <main className="main">
          {activeView === 'workspace' && (
            <WorkspaceView
              state={state}
              activeSegment={activeSegment}
              checks={checks}
              aiHints={aiHints}
              waveformRef={waveformRef}
              videoRef={videoRef}
              audioUrl={audioUrl}
              videoUrl={videoUrl}
              zoom={zoom}
              speed={speed}
              preRoll={preRoll}
              postRoll={postRoll}
              loopSegment={loopSegment}
              isPlaying={isPlaying}
              duration={timelineDuration}
              currentTime={currentTime}
              setZoom={setZoom}
              setSpeed={setSpeed}
              setPreRoll={setPreRoll}
              setPostRoll={setPostRoll}
              setLoopSegment={setLoopSegment}
              togglePlayback={togglePlayback}
              playSelectedSegment={playSelectedSegment}
              seekTo={seekTo}
              selectSegmentOnTimeline={selectSegmentOnTimeline}
              setActiveSegmentId={setActiveSegmentId}
              updateSegment={updateSegment}
              createSegment={createSegment}
              deleteSegment={deleteSegment}
              splitSegment={splitSegment}
              mergeWithNext={mergeWithNext}
              toggleChecklist={toggleChecklist}
              addChecklistItem={addChecklistItem}
              renameChecklistItem={renameChecklistItem}
              deleteChecklistItem={deleteChecklistItem}
              submitForReview={submitForReview}
              addTermFromSelection={addTermFromSelection}
              undo={undo}
              redo={redo}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              saveCurrentVersion={saveCurrentVersion}
              restoreVersion={restoreVersion}
            />
          )}

          {activeView === 'verification' && (
            <VerificationView
              state={state}
              activeSegment={activeSegment}
              checks={checks}
              waveformRef={waveformRef}
              videoRef={videoRef}
              audioUrl={audioUrl}
              videoUrl={videoUrl}
              zoom={zoom}
              speed={speed}
              preRoll={preRoll}
              postRoll={postRoll}
              loopSegment={loopSegment}
              isPlaying={isPlaying}
              duration={timelineDuration}
              currentTime={currentTime}
              commentDraft={commentDraft}
              setCommentDraft={setCommentDraft}
              setZoom={setZoom}
              setSpeed={setSpeed}
              setPreRoll={setPreRoll}
              setPostRoll={setPostRoll}
              setLoopSegment={setLoopSegment}
              togglePlayback={togglePlayback}
              seekTo={seekTo}
              selectSegmentOnTimeline={selectSegmentOnTimeline}
              updateSegment={updateSegment}
              createSegment={createSegment}
              setActiveSegmentId={setActiveSegmentId}
              toggleChecklist={toggleChecklist}
              addChecklistItem={addChecklistItem}
              renameChecklistItem={renameChecklistItem}
              deleteChecklistItem={deleteChecklistItem}
              acceptTask={acceptTask}
              returnTask={returnTask}
              resolveComment={resolveComment}
              playSelectedSegment={playSelectedSegment}
              compareA={verifierCompareA}
              compareB={verifierCompareB}
              onCompareUpload={handleVerifierCompareUpload}
              aiAudioResults={aiAudioResults}
              aiAudioRunning={aiAudioRunning}
              aiModelStatus={aiModelStatus}
              aiAudioProgress={aiAudioProgress}
              asrEndpoint={asrEndpoint}
              setAsrEndpoint={updateAsrEndpoint}
              runAiAudioAudit={runAiAudioAudit}
            />
          )}

          {activeView === 'terms' && (
            <TermsView
              state={state}
              search={termSearch}
              setSearch={setTermSearch}
              newTerm={newTerm}
              setNewTerm={setNewTerm}
              addTerm={() => addTermFromSelection(newTerm)}
              updateTerm={updateTerm}
            />
          )}

          {activeView === 'analytics' && <AnalyticsView state={state} stats={stats} checks={checks} />}
          {activeView === 'admin' && (
            <AdminView
              state={state}
              onReset={resetDemo}
              updateUser={updateUser}
              updateTaskAdmin={updateTaskAdmin}
              addProjectRule={addProjectRule}
              removeProjectRule={removeProjectRule}
            />
          )}
        </main>
      </div>

      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const loadedDuration = event.currentTarget.duration;
          if (Number.isFinite(loadedDuration) && loadedDuration > 0) setDuration((previous) => Math.max(previous, loadedDuration));
        }}
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime;
          if (!wavesurferRef.current) setCurrentTime(time);
        }}
        onPlay={() => {
          if (!wavesurferRef.current) setIsPlaying(true);
        }}
        onPause={() => {
          if (!wavesurferRef.current) {
            setIsPlaying(false);
            clearPlayStopTimer();
          }
        }}
        onEnded={() => {
          if (!wavesurferRef.current) {
            setIsPlaying(false);
            playTargetRef.current = null;
          }
        }}
        hidden
      />

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function LoginScreen({ state, onLogin, onReset }: { state: AppState; onLogin: (userId: string) => void; onReset: () => void }) {
  return (
    <div className="login-screen">
      <div className="login-panel">
        <div className="brand-mark large">
          <Mic2 {...iconSize(32)} />
        </div>
        <h1>Gecko Next</h1>
        <p>Веб-платформа разметки, верификации и контроля качества речевых данных</p>

        <div className="login-grid">
          {state.users.map((user) => (
            <button key={user.id} className={`login-role ${user.status === 'blocked' ? 'blocked' : ''}`} disabled={user.status === 'blocked'} onClick={() => onLogin(user.id)}>
              <UserCheck {...iconSize(20)} />
              <span>{user.fullName}</span>
              <strong>{user.status === 'blocked' ? 'Заблокирован' : roleTitle(user.role)}</strong>
            </button>
          ))}
        </div>

        <button className="text-button" onClick={onReset}>
          <RefreshCcw {...iconSize(16)} />
          Очистить рабочую область
        </button>
      </div>
    </div>
  );
}

function WorkspaceView(props: {
  state: AppState;
  activeSegment?: Segment;
  checks: QualityCheck[];
  aiHints: Array<{ id: string; segmentId: string; title: string; detail: string; action: string }>;
  waveformRef: RefObject<HTMLDivElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  audioUrl: string;
  videoUrl: string;
  zoom: number;
  speed: number;
  preRoll: number;
  postRoll: number;
  loopSegment: boolean;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  setZoom: (value: number) => void;
  setSpeed: (value: number) => void;
  setPreRoll: (value: number) => void;
  setPostRoll: (value: number) => void;
  setLoopSegment: (value: boolean) => void;
  togglePlayback: () => void;
  playSelectedSegment: () => void;
  seekTo: (time: number) => void;
  selectSegmentOnTimeline: (segment: Segment) => void;
  setActiveSegmentId: (id: string) => void;
  updateSegment: (id: string, patch: Partial<Segment>, action?: string) => void;
  createSegment: (start?: number, end?: number) => void;
  deleteSegment: (id: string) => void;
  splitSegment: () => void;
  mergeWithNext: () => void;
  toggleChecklist: (kind: 'annotator' | 'verifier', id: string, done: boolean) => void;
  addChecklistItem: (kind: 'annotator' | 'verifier', label: string) => void;
  renameChecklistItem: (kind: 'annotator' | 'verifier', id: string, label: string) => void;
  deleteChecklistItem: (kind: 'annotator' | 'verifier', id: string) => void;
  submitForReview: () => void;
  addTermFromSelection: (value: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveCurrentVersion: () => void;
  restoreVersion: (versionId: string) => void;
}) {
  const {
    state,
    activeSegment,
    checks,
    aiHints,
    waveformRef,
    videoRef,
    audioUrl,
    videoUrl,
    zoom,
    speed,
    preRoll,
    postRoll,
    loopSegment,
    isPlaying,
    duration,
    currentTime,
    setZoom,
    setSpeed,
    setPreRoll,
    setPostRoll,
    setLoopSegment,
    togglePlayback,
    playSelectedSegment,
    seekTo,
    selectSegmentOnTimeline,
    setActiveSegmentId,
    updateSegment,
    createSegment,
    deleteSegment,
    splitSegment,
    mergeWithNext,
    toggleChecklist,
    addChecklistItem,
    renameChecklistItem,
    deleteChecklistItem,
    submitForReview,
    addTermFromSelection,
    undo,
    redo,
    canUndo,
    canRedo,
    saveCurrentVersion,
    restoreVersion
  } = props;

  function handleAiHint(hint: { id: string; segmentId: string; title: string; detail: string; action: string }) {
    setActiveSegmentId(hint.segmentId);
    const suggestedTerm = hint.detail.match(/"([^"]+)"/)?.[1];
    if (/добавить термин/i.test(hint.action) && suggestedTerm) addTermFromSelection(suggestedTerm);
  }

  return (
    <div className="workspace-grid">
      <section className="panel media-panel">
        <div className="panel-header">
          <div>
            <span className="section-title">Медиаплеер</span>
            <h2>Waveform и сегменты</h2>
          </div>
          <div className="toolbar">
            <button className="icon-button solid" onClick={togglePlayback} title={isPlaying ? 'Пауза' : 'Воспроизвести'} aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}>
              {isPlaying ? <Pause {...iconSize()} /> : <Play {...iconSize()} />}
            </button>
            <button className="action-button compact" onClick={playSelectedSegment}>
              <Mic2 {...iconSize()} />
              Segment
            </button>
            <button className={`icon-button ${loopSegment ? 'active' : ''}`} onClick={() => setLoopSegment(!loopSegment)} title="Повтор сегмента" aria-label="Повтор сегмента">
              <Repeat2 {...iconSize()} />
            </button>
          </div>
        </div>

        <div className="wave-shell">
          <div className="waveform-stack" style={{ width: getTimelineWidth(duration, zoom) }}>
            <div ref={waveformRef} className="waveform" style={{ width: getTimelineWidth(duration, zoom) }} />
            <WaveformRegions
              segments={state.segments}
              activeId={activeSegment?.id}
              duration={duration}
              zoom={zoom}
              currentTime={currentTime}
              onSelect={selectSegmentOnTimeline}
              onSeek={seekTo}
              onCreate={(start, end) => createSegment(start, end)}
              onResize={(segmentId, patch) => updateSegment(segmentId, patch, 'timeline_resize')}
            />
            {!audioUrl && (
              <div className="waveform-empty">
                Загрузите видео/аудио и Gecko JSON
              </div>
            )}
          </div>
        </div>

        <div className="transport-grid">
          <label>
            <span>Масштаб</span>
            <input type="range" min="45" max="220" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <label>
            <span>Скорость</span>
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              {[0.5, 0.75, 1, 1.25, 1.5].map((value) => (
                <option key={value} value={value}>
                  {value}x
                </option>
              ))}
            </select>
          </label>
          <NumberField label="До" value={preRoll} min={0} max={1} step={0.1} onChange={setPreRoll} />
          <NumberField label="После" value={postRoll} min={0} max={1} step={0.1} onChange={setPostRoll} />
        </div>

        <div className="timeline-meta">
          <Badge tone="neutral">
            <Activity {...iconSize(14)} />
            {formatTime(currentTime)}
          </Badge>
          <Badge tone="info">
            <Gauge {...iconSize(14)} />
            {Math.round((state.segments.filter((segment) => segment.listened).length / Math.max(1, state.segments.length)) * 100)}% прослушано
          </Badge>
          <div className="hotkeys">
            <kbd>Space</kbd>
            <kbd>↑↓</kbd>
            <kbd>Ctrl Z</kbd>
          </div>
        </div>
      </section>

      <section className="panel video-panel">
        <div className="panel-header tight">
          <span className="section-title">Видео</span>
          <Badge tone={videoUrl ? 'good' : 'neutral'}>{videoUrl ? 'Синхронно' : 'Опционально'}</Badge>
        </div>
        {videoUrl ? (
          <video ref={videoRef} src={videoUrl} className="video" muted controls />
        ) : (
          <div className="video-placeholder">
            <Video {...iconSize(42)} />
            <span>Видео-панель готова к загрузке</span>
          </div>
        )}
      </section>

      <section className="panel segments-panel">
        <div className="panel-header">
          <div>
            <span className="section-title">Сегменты</span>
            <h2>{state.segments.length} фрагментов</h2>
          </div>
          <div className="toolbar">
            <button className="icon-button" onClick={() => createSegment()} title="Создать сегмент" aria-label="Создать сегмент">
              <Plus {...iconSize()} />
            </button>
            <button className="icon-button" onClick={splitSegment} title="Разделить" aria-label="Разделить">
              <Scissors {...iconSize()} />
            </button>
            <button className="icon-button" onClick={mergeWithNext} title="Объединить со следующим" aria-label="Объединить со следующим">
              <SplitSquareHorizontal {...iconSize()} />
            </button>
          </div>
        </div>
        <SegmentTable
          segments={state.segments}
          speakers={state.speakers}
          activeId={activeSegment?.id}
          checks={checks}
          onSelect={selectSegmentOnTimeline}
        />
      </section>

      <section className="panel editor-panel">
        <div className="panel-header">
          <div>
            <span className="section-title">Редактор</span>
            <h2>{activeSegment?.id ?? 'Сегмент'}</h2>
          </div>
          <div className="toolbar">
            <button className="icon-button" disabled={!canUndo} onClick={undo} title="Отменить" aria-label="Отменить">
              <RotateCcw {...iconSize()} />
            </button>
            <button className="icon-button" disabled={!canRedo} onClick={redo} title="Вернуть" aria-label="Вернуть">
              <RotateCw {...iconSize()} />
            </button>
            {activeSegment && (
              <button className="icon-button danger" onClick={() => deleteSegment(activeSegment.id)} title="Удалить" aria-label="Удалить">
                <Trash2 {...iconSize()} />
              </button>
            )}
          </div>
        </div>

        {activeSegment && (
          <SegmentEditor
            state={state}
            segment={activeSegment}
            updateSegment={updateSegment}
            addTermFromSelection={addTermFromSelection}
          />
        )}
      </section>

      <section className="panel qa-panel">
        <QualityPanel checks={checks} onSegmentSelect={setActiveSegmentId} />
      </section>

      <section className="panel ai-panel">
        <div className="panel-header tight">
          <span className="section-title">AI-помощник</span>
          <Badge tone="info">mock</Badge>
        </div>
        <div className="hint-list">
          {aiHints.map((hint) => (
            <button key={hint.id} className="hint-row" onClick={() => handleAiHint(hint)}>
              <Sparkles {...iconSize(17)} />
              <span>
                <strong>{hint.title}</strong>
                <small>{hint.detail}</small>
              </span>
              <em>{hint.action}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="panel checklist-panel">
        <div className="panel-header">
          <div>
            <span className="section-title">Чек-лист</span>
            <h2>Перед отправкой</h2>
          </div>
          <button className="action-button primary" onClick={submitForReview}>
            <Send {...iconSize()} />
            На проверку
          </button>
        </div>
        <Checklist
          items={state.annotatorChecklist}
          onToggle={(id, done) => toggleChecklist('annotator', id, done)}
          onAdd={(label) => addChecklistItem('annotator', label)}
          onRename={(id, label) => renameChecklistItem('annotator', id, label)}
          onDelete={(id) => deleteChecklistItem('annotator', id)}
        />
      </section>

      <section className="panel versions-panel">
        <div className="panel-header">
          <div>
            <span className="section-title">Версии</span>
            <h2>Импорт и восстановление</h2>
          </div>
          <button className="action-button" onClick={saveCurrentVersion}>
            <Save {...iconSize()} />
            Снимок
          </button>
        </div>
        <VersionList versions={state.versions} restoreVersion={restoreVersion} />
      </section>
    </div>
  );
}

function WaveformRegions({
  segments,
  activeId,
  duration,
  zoom,
  currentTime,
  onSeek,
  onCreate,
  onResize,
  onSelect
}: {
  segments: Segment[];
  activeId?: string;
  duration: number;
  zoom: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onCreate: (start: number, end: number) => void;
  onResize: (segmentId: string, patch: Partial<Segment>) => void;
  onSelect: (segment: Segment) => void;
}) {
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);
  const [resizeDraft, setResizeDraft] = useState<{ segmentId: string; start: number; end: number } | null>(null);
  const safeDuration = Math.max(duration, ...segments.map((segment) => segment.endTime), 1);
  const speakerLanes = new Map<string, number>();
  segments.forEach((segment) => {
    const key = segment.speakerId || 'unknown';
    if (!speakerLanes.has(key)) speakerLanes.set(key, speakerLanes.size);
  });
  const visibleLaneCount = Math.min(5, Math.max(1, speakerLanes.size));
  const laneHeight = 22;
  const laneGap = 5;
  const centeredTop = (146 - (visibleLaneCount * laneHeight + (visibleLaneCount - 1) * laneGap)) / 2;

  function startCreate(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const layer = event.currentTarget;
    const start = timeFromPointer(event, layer, safeDuration, zoom);
    let current = start;
    let moved = false;

    layer.setPointerCapture(event.pointerId);
    setDraft({ start, end: start + 0.05 });

    const handleMove = (moveEvent: PointerEvent) => {
      current = timeFromPointer(moveEvent, layer, safeDuration, zoom);
      moved = moved || Math.abs(current - start) > 0.03;
      setDraft({ start: Math.min(start, current), end: Math.max(start, current) });
    };

    const finish = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      setDraft(null);
      if (!moved) {
        onSeek(start);
        return;
      }

      const nextStart = Math.min(start, current);
      const nextEnd = Math.max(start, current);
      if (nextEnd - nextStart >= 0.05) onCreate(seconds(nextStart), seconds(nextEnd));
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finish, { once: true });
  }

  function startResize(event: ReactPointerEvent<HTMLSpanElement>, segment: Segment, edge: 'start' | 'end') {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget.closest('.waveform-regions');
    if (!(target instanceof HTMLElement)) return;

    const originalStart = segment.startTime;
    const originalEnd = segment.endTime;
    let latestDraft = { segmentId: segment.id, start: originalStart, end: originalEnd };
    setResizeDraft(latestDraft);

    const handleMove = (moveEvent: PointerEvent) => {
      const pointerTime = timeFromPointer(moveEvent, target, safeDuration, zoom);
      const nextStart = edge === 'start' ? Math.min(pointerTime, originalEnd - 0.05) : originalStart;
      const nextEnd = edge === 'end' ? Math.max(pointerTime, originalStart + 0.05) : originalEnd;
      latestDraft = {
        segmentId: segment.id,
        start: seconds(Math.max(0, nextStart)),
        end: seconds(Math.min(safeDuration, nextEnd))
      };
      setResizeDraft(latestDraft);
    };

    const finish = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      onResize(segment.id, { startTime: latestDraft.start, endTime: latestDraft.end });
      setResizeDraft(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finish, { once: true });
  }

  return (
    <div className="waveform-regions" aria-label="Сегменты поверх аудиоволны">
      <div className="waveform-create-layer" onPointerDown={startCreate} title="Потяните по аудиолинии, чтобы создать новый фрагмент" />
      {draft && (
        <span
          className="waveform-create-draft"
          style={timePixelStyle(draft.start, Math.max(draft.end, draft.start + 0.05), safeDuration, zoom)}
        />
      )}
      {segments.map((segment, index) => {
        const lane = (speakerLanes.get(segment.speakerId || 'unknown') ?? speakerColorIndex(segment.speakerId)) % visibleLaneCount;
        const visualStart = resizeDraft?.segmentId === segment.id ? resizeDraft.start : segment.startTime;
        const visualEnd = resizeDraft?.segmentId === segment.id ? resizeDraft.end : segment.endTime;
        return (
          <button
            key={`wave-region-${segment.id}`}
            className={`waveform-region ${segment.id === activeId ? 'active' : ''} ${segment.confidence < 0.7 ? 'low-confidence' : ''} ${segment.isCrosstalk ? 'crosstalk' : ''}`}
            style={{
              ...timePixelStyle(visualStart, visualEnd, safeDuration, zoom, speakerColorStyle(segment.speakerId)),
              top: `${Math.max(8, centeredTop) + lane * (laneHeight + laneGap)}px`
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(segment);
            }}
            title={`#${index + 1} ${segment.speakerId} ${formatTime(segment.startTime)}-${formatTime(segment.endTime)} ${segment.text}`}
            aria-label={`Открыть сегмент ${index + 1}`}
          >
            <span className="waveform-resize-handle start" onPointerDown={(event) => startResize(event, segment, 'start')} />
            <span className="waveform-region-grip" />
            <span className="waveform-resize-handle end" onPointerDown={(event) => startResize(event, segment, 'end')} />
          </button>
        );
      })}
    </div>
  );
}

function SegmentRail({
  segments,
  baselineSegments,
  activeId,
  duration,
  zoom,
  onSelect
}: {
  segments: Segment[];
  baselineSegments: Segment[];
  activeId?: string;
  duration: number;
  zoom: number;
  onSelect: (segment: Segment) => void;
}) {
  const safeDuration = Math.max(duration, ...segments.map((segment) => segment.endTime), ...baselineSegments.map((segment) => segment.endTime), 1);

  return (
    <div className="segment-rail" aria-label="Дорожки сегментов" style={{ width: getTimelineWidth(safeDuration, zoom) }}>
      <div className="rail-label current">current</div>
      <div className="rail-label baseline">source</div>
      {baselineSegments.map((segment) => {
        const lane = speakerColorIndex(segment.speakerId) % 2;
        return (
          <span
            key={`baseline-${segment.id}`}
            className={`rail-segment baseline ${segment.confidence < 0.7 ? 'low-confidence' : ''}`}
            style={{
              ...timePixelStyle(segment.startTime, segment.endTime, safeDuration, zoom, speakerColorStyle(segment.speakerId)),
              top: `${42 + lane * 9}px`,
              height: '8px'
            }}
            title={`source ${segment.id}: ${segment.speakerId} ${formatTime(segment.startTime)}-${formatTime(segment.endTime)}`}
          />
        );
      })}
      {segments.map((segment) => {
        const lane = speakerColorIndex(segment.speakerId) % 2;
        return (
          <button
            key={segment.id}
            className={`rail-segment ${segment.id === activeId ? 'active' : ''} ${segment.isCrosstalk ? 'crosstalk' : ''}`}
            style={{
              ...timePixelStyle(segment.startTime, segment.endTime, safeDuration, zoom, speakerColorStyle(segment.speakerId)),
              top: `${8 + lane * 15}px`,
              height: '13px'
            }}
            onClick={() => onSelect(segment)}
            title={`${segment.id}: ${segment.speakerId} ${formatTime(segment.startTime)}-${formatTime(segment.endTime)}`}
            aria-label={`Открыть ${segment.id}`}
          />
        );
      })}
    </div>
  );
}

function VersionList({ versions, restoreVersion }: { versions: AppState['versions']; restoreVersion: (versionId: string) => void }) {
  if (versions.length === 0) {
    return <p className="muted">Версии появятся после импорта или сохранения снимка.</p>;
  }

  return (
    <div className="version-list">
      {versions.map((version) => (
        <div key={version.id} className="version-row">
          <span>
            <strong>{version.label}</strong>
            <small>{new Date(version.createdAt).toLocaleString('ru-RU')} - {version.segments.length} сегм. - {version.source}</small>
          </span>
          <button className="text-button" onClick={() => restoreVersion(version.id)}>
            <RefreshCcw {...iconSize(15)} />
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}

function SegmentTable({
  segments,
  speakers,
  activeId,
  checks,
  onSelect
}: {
  segments: Segment[];
  speakers: AppState['speakers'];
  activeId?: string;
  checks: QualityCheck[];
  onSelect: (segment: Segment) => void;
}) {
  const issueMap = new Map<string, QualityCheck[]>();
  const speakerMap = new Map(speakers.map((speaker) => [speaker.id, speaker]));
  checks.forEach((check) => {
    if (!check.segmentId) return;
    issueMap.set(check.segmentId, [...(issueMap.get(check.segmentId) ?? []), check]);
  });

  return (
    <div className="segment-table">
      {segments
        .slice()
        .sort((a, b) => a.startTime - b.startTime)
        .map((segment) => {
          const issues = issueMap.get(segment.id) ?? [];
          const speaker = speakerMap.get(segment.speakerId);
          return (
            <button
              key={segment.id}
              className={`segment-row ${segment.id === activeId ? 'active' : ''}`}
              style={speakerColorStyle(segment.speakerId)}
              onClick={() => onSelect(segment)}
            >
              <span className="segment-id">{segment.id.replace('seg-', '#')}</span>
              <span className="segment-time">
                {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
              </span>
              <span className="segment-speaker" title={speaker?.originalName ?? segment.speakerId}>
                {speaker?.displayName ?? segment.speakerId}
              </span>
              <span className="segment-text">{segment.text || 'Без текста'}</span>
              <span className="segment-flags">
                {segment.listened ? <CheckCircle2 {...iconSize(15)} /> : <Circle {...iconSize(15)} />}
                {segment.isCrosstalk && <MessageSquare {...iconSize(15)} />}
                {issues.length > 0 && <AlertTriangle {...iconSize(15)} />}
              </span>
            </button>
          );
        })}
    </div>
  );
}

function SegmentEditor({
  state,
  segment,
  updateSegment,
  addTermFromSelection
}: {
  state: AppState;
  segment: Segment;
  updateSegment: (id: string, patch: Partial<Segment>, action?: string) => void;
  addTermFromSelection: (value: string) => void;
}) {
  const speaker = state.speakers.find((item) => item.id === segment.speakerId);
  const possibleTerms = findPossibleTerms(segment.text);

  return (
    <div className="editor-body">
      <div className="time-editors">
        <NumberField label="Start" value={segment.startTime} min={0} max={9999} step={0.01} onChange={(value) => updateSegment(segment.id, { startTime: seconds(value) }, 'start_time')} />
        <NumberField label="End" value={segment.endTime} min={0} max={9999} step={0.01} onChange={(value) => updateSegment(segment.id, { endTime: seconds(value) }, 'end_time')} />
        <label>
          <span>Спикер</span>
          <select value={segment.speakerId} onChange={(event) => updateSegment(segment.id, { speakerId: event.target.value }, 'speaker')}>
            {state.speakers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName} ({item.originalName})
              </option>
            ))}
          </select>
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={segment.isCrosstalk} onChange={(event) => updateSegment(segment.id, { isCrosstalk: event.target.checked }, 'crosstalk')} />
          <span>Кросстолк</span>
        </label>
      </div>

      <textarea value={segment.text} onChange={(event) => updateSegment(segment.id, { text: event.target.value }, 'text_edit')} rows={7} />

      <div className="editor-meta">
        <Badge tone={segment.confidence < 0.7 ? 'warning' : 'good'}>{Math.round(segment.confidence * 100)}% ASR</Badge>
        <Badge tone="neutral">Источник: {segment.sourceText || 'нет'}</Badge>
        {speaker && <Badge tone="info">{speaker.editable ? 'Спикер редактируемый' : 'Имя спикера защищено'}</Badge>}
      </div>

      <div className="term-chips">
        {possibleTerms.length === 0 && <span className="muted">Термины в сегменте не найдены</span>}
        {possibleTerms.map((term) => (
          <button key={term} onClick={() => addTermFromSelection(term)}>
            <BookOpen {...iconSize(14)} />
            {term}
          </button>
        ))}
      </div>

      <label>
        <span>Комментарий к кросстолку</span>
        <input
          value={segment.crosstalkComment ?? ''}
          onChange={(event) => updateSegment(segment.id, { crosstalkComment: event.target.value }, 'crosstalk_comment')}
          placeholder="Например: второй спикер слышен на фоне"
        />
      </label>
    </div>
  );
}

function QualityPanel({ checks, onSegmentSelect }: { checks: QualityCheck[]; onSegmentSelect: (id: string) => void }) {
  const critical = checks.filter((check) => check.severity === 'critical').length;
  const warning = checks.filter((check) => check.severity === 'warning').length;

  return (
    <>
      <div className="panel-header tight">
        <span className="section-title">Контроль качества</span>
        <div className="mini-kpis">
          <Badge tone={critical ? 'danger' : 'good'}>{critical} critical</Badge>
          <Badge tone={warning ? 'warning' : 'good'}>{warning} warning</Badge>
        </div>
      </div>
      <div className="check-list">
        {checks.map((check) => (
          <button
            key={check.id}
            className={`check-row ${check.severity}`}
            onClick={() => check.segmentId && onSegmentSelect(check.segmentId)}
            disabled={!check.segmentId}
          >
            {check.severity === 'ok' ? <Check {...iconSize(16)} /> : <AlertTriangle {...iconSize(16)} />}
            <span>{check.message}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function VerificationView(props: {
  state: AppState;
  activeSegment?: Segment;
  checks: QualityCheck[];
  waveformRef: RefObject<HTMLDivElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  audioUrl: string;
  videoUrl: string;
  zoom: number;
  speed: number;
  preRoll: number;
  postRoll: number;
  loopSegment: boolean;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  setZoom: (value: number) => void;
  setSpeed: (value: number) => void;
  setPreRoll: (value: number) => void;
  setPostRoll: (value: number) => void;
  setLoopSegment: (value: boolean) => void;
  togglePlayback: () => void;
  seekTo: (time: number) => void;
  selectSegmentOnTimeline: (segment: Segment) => void;
  updateSegment: (id: string, patch: Partial<Segment>, action?: string) => void;
  createSegment: (start?: number, end?: number) => void;
  setActiveSegmentId: (id: string) => void;
  toggleChecklist: (kind: 'annotator' | 'verifier', id: string, done: boolean) => void;
  addChecklistItem: (kind: 'annotator' | 'verifier', label: string) => void;
  renameChecklistItem: (kind: 'annotator' | 'verifier', id: string, label: string) => void;
  deleteChecklistItem: (kind: 'annotator' | 'verifier', id: string) => void;
  acceptTask: () => void;
  returnTask: () => void;
  resolveComment: (id: string) => void;
  playSelectedSegment: () => void;
  compareA: VerifierCompareFile;
  compareB: VerifierCompareFile;
  onCompareUpload: (side: 'a' | 'b', file?: File) => void;
  aiAudioResults: Record<string, AiAudioResult>;
  aiAudioRunning: boolean;
  aiModelStatus: AiModelStatus;
  aiAudioProgress: string;
  asrEndpoint: string;
  setAsrEndpoint: (value: string) => void;
  runAiAudioAudit: (scope: 'active' | 'all') => void;
}) {
  const {
    state,
    activeSegment,
    checks,
    waveformRef,
    videoRef,
    audioUrl,
    videoUrl,
    zoom,
    speed,
    preRoll,
    postRoll,
    loopSegment,
    isPlaying,
    duration,
    currentTime,
    commentDraft,
    setCommentDraft,
    setZoom,
    setSpeed,
    setPreRoll,
    setPostRoll,
    setLoopSegment,
    togglePlayback,
    seekTo,
    selectSegmentOnTimeline,
    updateSegment,
    createSegment,
    setActiveSegmentId,
    toggleChecklist,
    addChecklistItem,
    renameChecklistItem,
    deleteChecklistItem,
    acceptTask,
    returnTask,
    resolveComment,
    playSelectedSegment,
    compareA,
    compareB,
    onCompareUpload,
    aiAudioResults,
    aiAudioRunning,
    aiModelStatus,
    aiAudioProgress,
    asrEndpoint,
    setAsrEndpoint,
    runAiAudioAudit
  } = props;

  return (
    <div className="verification-grid">
      <section className="panel media-panel verification-media-panel">
        <div className="panel-header">
          <div>
            <span className="section-title">Медиаплеер верификатора</span>
            <h2>Аудиолиния и сегменты</h2>
          </div>
          <div className="toolbar">
            <button className="icon-button solid" onClick={togglePlayback} title={isPlaying ? 'Пауза' : 'Воспроизвести'} aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}>
              {isPlaying ? <Pause {...iconSize()} /> : <Play {...iconSize()} />}
            </button>
            <button className="action-button compact" onClick={playSelectedSegment}>
              <Mic2 {...iconSize()} />
              Segment
            </button>
            <button className={`icon-button ${loopSegment ? 'active' : ''}`} onClick={() => setLoopSegment(!loopSegment)} title="Повтор сегмента" aria-label="Повтор сегмента">
              <Repeat2 {...iconSize()} />
            </button>
          </div>
        </div>

        <div className="wave-shell">
          <div className="waveform-stack" style={{ width: getTimelineWidth(duration, zoom) }}>
            <div ref={waveformRef} className="waveform" style={{ width: getTimelineWidth(duration, zoom) }} />
            <WaveformRegions
              segments={state.segments}
              activeId={activeSegment?.id}
              duration={duration}
              zoom={zoom}
              currentTime={currentTime}
              onSelect={selectSegmentOnTimeline}
              onSeek={seekTo}
              onCreate={(start, end) => createSegment(start, end)}
              onResize={(segmentId, patch) => updateSegment(segmentId, patch, 'verifier_timeline_resize')}
            />
            {!audioUrl && <div className="waveform-empty">Загрузите видео/аудио и Gecko JSON</div>}
          </div>
        </div>

        <div className="transport-grid">
          <label>
            <span>Масштаб</span>
            <input type="range" min="45" max="220" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <label>
            <span>Скорость</span>
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              {[0.5, 0.75, 1, 1.25, 1.5].map((value) => (
                <option key={value} value={value}>
                  {value}x
                </option>
              ))}
            </select>
          </label>
          <NumberField label="До" value={preRoll} min={0} max={1} step={0.1} onChange={setPreRoll} />
          <NumberField label="После" value={postRoll} min={0} max={1} step={0.1} onChange={setPostRoll} />
        </div>

        <div className="timeline-meta">
          <Badge tone="neutral">
            <Activity {...iconSize(14)} />
            {formatTime(currentTime)}
          </Badge>
          <Badge tone="info">
            <Gauge {...iconSize(14)} />
            {Math.round((state.segments.filter((segment) => segment.listened).length / Math.max(1, state.segments.length)) * 100)}% прослушано
          </Badge>
        </div>
      </section>

      <section className="panel video-panel verification-video-panel">
        <div className="panel-header tight">
          <span className="section-title">Видео верификатора</span>
          <Badge tone={videoUrl ? 'good' : 'neutral'}>{videoUrl ? 'Синхронно' : 'Опционально'}</Badge>
        </div>
        {videoUrl ? (
          <video ref={videoRef} src={videoUrl} className="video" muted controls />
        ) : (
          <div className="video-placeholder">
            <Video {...iconSize(42)} />
            <span>Видео-панель готова к загрузке</span>
          </div>
        )}
      </section>

      <section className="panel verifier-segment-panel">
        <div className="panel-header tight">
          <div>
            <span className="section-title">Выбор сегмента</span>
            <h2>{activeSegment ? `${activeSegment.id} · ${formatTime(activeSegment.startTime)} - ${formatTime(activeSegment.endTime)}` : 'Выберите фрагмент'}</h2>
          </div>
          <Badge tone="info">{state.segments.length} сегм.</Badge>
        </div>
        <SegmentTable
          segments={state.segments}
          speakers={state.speakers}
          activeId={activeSegment?.id}
          checks={checks}
          onSelect={selectSegmentOnTimeline}
        />
      </section>

      <section className="panel verifier-review-panel">
        <div className="panel-header">
          <div>
            <span className="section-title">Проверка активного сегмента</span>
            <h2>{state.task.status}</h2>
          </div>
          <div className="toolbar">
            <button className="action-button" onClick={playSelectedSegment}>
              <Play {...iconSize()} />
              Segment
            </button>
            <button className="action-button danger" onClick={returnTask}>
              <X {...iconSize()} />
              Вернуть
            </button>
            <button className="action-button success" onClick={acceptTask}>
              <Check {...iconSize()} />
              Принять
            </button>
          </div>
        </div>

        <div className="compare-grid verifier-text-compare">
          <div>
            <span className="section-title">Предразметка</span>
            <p>{activeSegment?.sourceText}</p>
          </div>
          <div>
            <span className="section-title">Текущий текст</span>
            <p>{activeSegment?.text}</p>
          </div>
        </div>

        <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} rows={4} placeholder="Замечание по активному сегменту" />

        <div className="comment-list">
          {state.comments.map((comment) => (
            <div key={comment.id} className={`comment-row ${comment.status}`}>
              <MessageSquare {...iconSize(17)} />
              <span>
                <strong>{comment.category}</strong>
                <small>{comment.text}</small>
              </span>
              {comment.segmentId && (
                <button className="text-button" onClick={() => setActiveSegmentId(comment.segmentId!)}>
                  {comment.segmentId}
                </button>
              )}
              {comment.status === 'open' && (
                <button className="icon-button" onClick={() => resolveComment(comment.id)} title="Закрыть" aria-label="Закрыть">
                  <Check {...iconSize()} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel ai-asr-panel">
        <AIAudioTranscriptionPanel
          segments={state.segments}
          activeSegment={activeSegment}
          speakers={state.speakers}
          results={aiAudioResults}
          running={aiAudioRunning}
          modelStatus={aiModelStatus}
          progress={aiAudioProgress}
          asrEndpoint={asrEndpoint}
          setAsrEndpoint={setAsrEndpoint}
          onRun={runAiAudioAudit}
          onSelect={selectSegmentOnTimeline}
        />
      </section>

      <section className="panel verifier-checklist-panel">
        <div className="panel-header tight">
          <span className="section-title">Чек-лист верификатора</span>
          <Badge tone="info">{state.verifierChecklist.filter((item) => item.done).length}/{state.verifierChecklist.length}</Badge>
        </div>
        <Checklist
          items={state.verifierChecklist}
          onToggle={(id, done) => toggleChecklist('verifier', id, done)}
          onAdd={(label) => addChecklistItem('verifier', label)}
          onRename={(id, label) => renameChecklistItem('verifier', id, label)}
          onDelete={(id) => deleteChecklistItem('verifier', id)}
        />
      </section>

      <section className="panel verifier-quality-panel">
        <AIQualitySegments segments={state.segments} checks={checks} audioResults={aiAudioResults} speakers={state.speakers} onSelect={(segment) => selectSegmentOnTimeline(segment)} />
      </section>

      <section className="panel span-2">
        <JsonComparePanel
          currentSegments={state.segments}
          compareA={compareA}
          compareB={compareB}
          onUpload={onCompareUpload}
          onSelect={(segment) => selectSegmentOnTimeline(segment)}
        />
      </section>
    </div>
  );
}

function qualityMeta(level: SegmentQualityLevel): { label: string; tone: 'good' | 'warning' | 'danger'; title: string } {
  if (level === 'red') return { label: 'Красный', tone: 'danger', title: 'Нужна правка перед отправкой' };
  if (level === 'yellow') return { label: 'Жёлтый', tone: 'warning', title: 'Стоит проверить вручную' };
  return { label: 'Зелёный', tone: 'good', title: 'Проблем не найдено' };
}

function combineQualityLevels(base: SegmentQualityLevel, audio?: SegmentQualityLevel): SegmentQualityLevel {
  if (base === 'red' || audio === 'red') return 'red';
  if (base === 'yellow' || audio === 'yellow') return 'yellow';
  return 'green';
}

function AIAudioTranscriptionPanel({
  segments,
  activeSegment,
  speakers,
  results,
  running,
  modelStatus,
  progress,
  asrEndpoint,
  setAsrEndpoint,
  onRun,
  onSelect
}: {
  segments: Segment[];
  activeSegment?: Segment;
  speakers: AppState['speakers'];
  results: Record<string, AiAudioResult>;
  running: boolean;
  modelStatus: AiModelStatus;
  progress: string;
  asrEndpoint: string;
  setAsrEndpoint: (value: string) => void;
  onRun: (scope: 'active' | 'all') => void;
  onSelect: (segment: Segment) => void;
}) {
  const speakerMap = new Map(speakers.map((speaker) => [speaker.id, speaker]));
  const values = Object.values(results);
  const summary = values.reduce<Record<SegmentQualityLevel, number>>(
    (acc, result) => {
      acc[result.level] += 1;
      return acc;
    },
    { green: 0, yellow: 0, red: 0 }
  );
  const hasRealAsrResult = values.some((result) => result.engine === 'whisper-browser' || result.engine === 'backend-asr');
  const hasBackendAsr = asrEndpoint.trim().length > 0;
  const statusLabel: Record<AiModelStatus, string> = {
    idle: hasBackendAsr ? 'backend настроен' : 'локальная модель',
    loading: hasBackendAsr ? 'Backend ASR работает' : 'загрузка Whisper',
    ready: hasBackendAsr ? 'Backend ASR готов' : 'Whisper готов',
    error: 'ошибка модели'
  };

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-title">AI-ASR по аудио</span>
          <h2>{running ? progress || 'AI распознаёт' : values.length ? `${values.length} сегм. проверено` : 'AI распознаёт звук'}</h2>
        </div>
        <div className="toolbar">
          <button className="action-button compact" disabled={running || !activeSegment} onClick={() => onRun('active')}>
            <Wand2 {...iconSize()} />
            Активный
          </button>
          <button className="action-button primary compact" disabled={running || segments.length === 0} onClick={() => onRun('all')}>
            <Sparkles {...iconSize()} />
            Все сегменты
          </button>
        </div>
      </div>
      <div className="mini-kpis ai-asr-kpis">
        <Badge tone="good">{summary.green} зелёных</Badge>
        <Badge tone="warning">{summary.yellow} жёлтых</Badge>
        <Badge tone="danger">{summary.red} красных</Badge>
        <Badge tone={modelStatus === 'ready' ? 'info' : modelStatus === 'error' ? 'danger' : 'neutral'}>{statusLabel[modelStatus]}</Badge>
        <Badge tone={hasRealAsrResult ? 'info' : 'neutral'}>{hasRealAsrResult ? 'реальный ASR' : 'нет AI-распознавания'}</Badge>
      </div>
      <div className="ai-provider-settings">
        <label>
          <span>Backend ASR URL, опционально</span>
          <input
            value={asrEndpoint}
            autoComplete="off"
            placeholder="http://127.0.0.1:8000"
            onChange={(event) => setAsrEndpoint(event.target.value)}
          />
        </label>
        <Badge tone={hasBackendAsr ? 'info' : 'neutral'}>{hasBackendAsr ? 'Backend ASR включён' : 'локальный Whisper без ключей'}</Badge>
      </div>
      <div className="ai-transcript-list">
        {segments
          .slice()
          .sort((a, b) => a.startTime - b.startTime)
          .map((segment) => {
            const result = results[segment.id];
            const level = result?.level ?? 'yellow';
            const meta = qualityMeta(level);
            const speaker = speakerMap.get(segment.speakerId);
            return (
              <button key={segment.id} className={`ai-transcript-row ${level}`} onClick={() => onSelect(segment)}>
                <span className="quality-dot" aria-hidden="true" />
                <span>
                  <strong>{segment.id} · {speaker?.displayName ?? segment.speakerId} · {formatTime(segment.startTime)}</strong>
                  <small>AI: {result?.transcript || 'ещё не проверено'}</small>
                  <small>Разметка: {segment.text || 'пустой текст'}</small>
                  {result && <small>{result.detail}</small>}
                </span>
                <span className="ai-score">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <small>{result ? `${Math.round(result.similarity * 100)}% · ${result.engine}` : 'ожидает'}</small>
                </span>
              </button>
            );
          })}
      </div>
    </>
  );
}

function AIQualitySegments({
  segments,
  checks,
  audioResults,
  speakers,
  onSelect
}: {
  segments: Segment[];
  checks: QualityCheck[];
  audioResults: Record<string, AiAudioResult>;
  speakers: AppState['speakers'];
  onSelect: (segment: Segment) => void;
}) {
  const summary = segments.reduce<Record<SegmentQualityLevel, number>>(
    (acc, segment) => {
      const level = combineQualityLevels(getSegmentQualityLevel(segment, checks), audioResults[segment.id]?.level);
      acc[level] += 1;
      return acc;
    },
    { green: 0, yellow: 0, red: 0 }
  );
  const speakerMap = new Map(speakers.map((speaker) => [speaker.id, speaker]));
  const issueMap = new Map<string, QualityCheck[]>();
  checks.forEach((check) => {
    if (!check.segmentId || check.result) return;
    issueMap.set(check.segmentId, [...(issueMap.get(check.segmentId) ?? []), check]);
  });

  return (
    <>
      <div className="panel-header tight">
        <span className="section-title">AI-помощник качества</span>
        <div className="mini-kpis">
          <Badge tone="good">{summary.green} зелёных</Badge>
          <Badge tone="warning">{summary.yellow} жёлтых</Badge>
          <Badge tone="danger">{summary.red} красных</Badge>
        </div>
      </div>
      <div className="ai-quality-list">
        {segments
          .slice()
          .sort((a, b) => a.startTime - b.startTime)
          .map((segment) => {
            const audioResult = audioResults[segment.id];
            const level = combineQualityLevels(getSegmentQualityLevel(segment, checks), audioResult?.level);
            const meta = qualityMeta(level);
            const issues = issueMap.get(segment.id) ?? [];
            const speaker = speakerMap.get(segment.speakerId);
            return (
              <button key={segment.id} className={`ai-quality-row ${level}`} onClick={() => onSelect(segment)}>
                <span className="quality-dot" aria-hidden="true" />
                <span>
                  <strong>{segment.id} · {speaker?.displayName ?? segment.speakerId}</strong>
                  <small>{audioResult ? `AI-ASR совпадение ${Math.round(audioResult.similarity * 100)}%: ${audioResult.transcript}` : issues[0]?.message ?? meta.title}</small>
                </span>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </button>
            );
          })}
      </div>
    </>
  );
}

function getCompareLabel(segment: Segment | undefined, fallback: string) {
  if (!segment) return fallback;
  return `${formatTime(segment.startTime)} - ${formatTime(segment.endTime)}`;
}

function segmentChanged(left?: Segment, right?: Segment) {
  if (!left || !right) return true;
  return (
    Math.abs(left.startTime - right.startTime) > 0.03 ||
    Math.abs(left.endTime - right.endTime) > 0.03 ||
    left.text.trim() !== right.text.trim() ||
    left.speakerId !== right.speakerId
  );
}

function JsonComparePanel({
  currentSegments,
  compareA,
  compareB,
  onUpload,
  onSelect
}: {
  currentSegments: Segment[];
  compareA: VerifierCompareFile;
  compareB: VerifierCompareFile;
  onUpload: (side: 'a' | 'b', file?: File) => void;
  onSelect: (segment: Segment) => void;
}) {
  const sourceFallback = currentSegments.map((segment) => ({
    ...segment,
    id: `source-${segment.id}`,
    text: segment.sourceText || segment.text
  }));
  const left = compareA?.segments.length ? compareA.segments : sourceFallback;
  const right = compareB?.segments.length ? compareB.segments : currentSegments;
  const maxLength = Math.max(left.length, right.length);
  const rows = Array.from({ length: maxLength }, (_, index) => ({
    index,
    left: left[index],
    right: right[index],
    changed: segmentChanged(left[index], right[index])
  }));
  const changedCount = rows.filter((row) => row.changed).length;

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-title">Сравнение JSON</span>
          <h2>{changedCount} отличий</h2>
        </div>
        <div className="compare-upload-grid">
          <FileInput icon={FileJson} label={compareA?.name ?? 'JSON 1'} accept="application/json,.json,text/plain" onFile={(file) => onUpload('a', file)} />
          <FileInput icon={FileJson} label={compareB?.name ?? 'JSON 2'} accept="application/json,.json,text/plain" onFile={(file) => onUpload('b', file)} />
        </div>
      </div>
      <div className="json-compare-list">
        {rows.map((row) => (
          <button
            key={`${row.index}-${row.left?.id ?? 'none'}-${row.right?.id ?? 'none'}`}
            className={`json-compare-row ${row.changed ? 'changed' : 'same'}`}
            onClick={() => row.right && onSelect(row.right)}
          >
            <span className="segment-id">#{row.index + 1}</span>
            <span>
              <strong>{getCompareLabel(row.left, 'нет сегмента')}</strong>
              <small>{row.left?.text || 'Пусто'}</small>
            </span>
            <span>
              <strong>{getCompareLabel(row.right, 'нет сегмента')}</strong>
              <small>{row.right?.text || 'Пусто'}</small>
            </span>
            <Badge tone={row.changed ? 'warning' : 'good'}>{row.changed ? 'различие' : 'совпадает'}</Badge>
          </button>
        ))}
      </div>
    </>
  );
}

function TermsView(props: {
  state: AppState;
  search: string;
  setSearch: (value: string) => void;
  newTerm: string;
  setNewTerm: (value: string) => void;
  addTerm: () => void;
  updateTerm: (id: string, patch: Partial<Term>) => void;
}) {
  const { state, search, setSearch, newTerm, setNewTerm, addTerm, updateTerm } = props;
  const filtered = state.terms.filter((term) => `${term.value} ${term.normalizedValue} ${term.type}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="terms-grid">
      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <span className="section-title">Терминология</span>
            <h2>Словарь проекта</h2>
          </div>
          <div className="search-box">
            <Search {...iconSize(16)} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" />
          </div>
        </div>

        <div className="term-add-row">
          <input
            value={newTerm}
            onChange={(event) => setNewTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addTerm();
            }}
            placeholder="Новый или спорный термин"
          />
          <button className="action-button primary" onClick={addTerm} disabled={!newTerm.trim()}>
            <Plus {...iconSize()} />
            Добавить
          </button>
        </div>

        <div className="term-table">
          {filtered.map((term) => (
            <div key={term.id} className="term-row">
              <strong>{term.value}</strong>
              <span>{term.normalizedValue}</span>
              <Badge tone={term.status === 'approved' ? 'good' : term.status === 'rejected' ? 'danger' : 'warning'}>{term.status}</Badge>
              <small>{term.type}</small>
              <small>{term.occurrences} вх.</small>
              <select value={term.status} onChange={(event) => updateTerm(term.id, { status: event.target.value as Term['status'] })}>
                <option value="new">новый</option>
                <option value="review">на проверке</option>
                <option value="approved">подтверждён</option>
                <option value="rejected">отклонён</option>
                <option value="disputed">спорный</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header tight">
          <span className="section-title">Статусы</span>
          <BookOpen {...iconSize()} />
        </div>
        <StatusBars terms={state.terms} />
      </section>
    </div>
  );
}

function AnalyticsView({ state, stats, checks }: { state: AppState; stats: ReturnType<typeof analytics>; checks: QualityCheck[] }) {
  return (
    <div className="analytics-grid">
      <Metric icon={FileAudio} label="Файлов обработано" value={String(stats.processedFiles)} />
      <Metric icon={Clock3} label="Длительность" value={`${stats.durationMinutes.toFixed(1)} мин`} />
      <Metric icon={Gauge} label="Скорость" value={`${stats.speed} мин/ч`} />
      <Metric icon={MessageSquare} label="Замечаний" value={String(stats.comments)} />
      <Metric icon={AlertTriangle} label="Возвраты" value={`${stats.returnRate}%`} />
      <Metric icon={ShieldCheck} label="Рейтинг качества" value={`${stats.qualityScore}/100`} />

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <span className="section-title">Прогресс проекта</span>
            <h2>{state.project.name}</h2>
          </div>
          <Badge tone="info">{stats.progress}%</Badge>
        </div>
        <div className="progress-line">
          <span style={{ width: `${stats.progress}%` }} />
        </div>
        <div className="analytics-bars">
          {state.segments.map((segment) => (
            <div key={segment.id}>
              <span>{segment.id}</span>
              <strong style={{ width: `${Math.max(8, segment.confidence * 100)}%` }} />
              <em>{Math.round(segment.confidence * 100)}%</em>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header tight">
          <span className="section-title">Ошибки по типам</span>
          <BarChart3 {...iconSize()} />
        </div>
        <div className="type-list">
          {Object.entries(
            checks.reduce<Record<string, number>>((acc, check) => {
              acc[check.type] = (acc[check.type] ?? 0) + 1;
              return acc;
            }, {})
          ).map(([type, count]) => (
            <div key={type}>
              <span>{type}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AdminView({
  state,
  onReset,
  updateUser,
  updateTaskAdmin,
  addProjectRule,
  removeProjectRule
}: {
  state: AppState;
  onReset: () => void;
  updateUser: (userId: string, patch: Partial<AppState['users'][number]>) => void;
  updateTaskAdmin: (patch: Partial<AppState['task']>) => void;
  addProjectRule: (rule: string) => void;
  removeProjectRule: (index: number) => void;
}) {
  const [newRule, setNewRule] = useState('');

  return (
    <div className="admin-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-title">Пользователи</span>
            <h2>Роли и доступ</h2>
          </div>
          <Users {...iconSize()} />
        </div>
        <div className="user-table">
          {state.users.map((user) => (
            <div key={user.id} className="admin-user-row">
              <span>
                <strong>{user.fullName}</strong>
                <small>{user.email}</small>
              </span>
              <select value={user.role} onChange={(event) => updateUser(user.id, { role: event.target.value as RoleName })} aria-label={`Роль ${user.fullName}`}>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {roleTitle(role)}
                  </option>
                ))}
              </select>
              <button
                className={`action-button compact ${user.status === 'active' ? '' : 'danger'}`}
                onClick={() => updateUser(user.id, { status: user.status === 'active' ? 'blocked' : 'active' })}
              >
                {user.status === 'active' ? 'Активен' : 'Заблокирован'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-title">Правила</span>
            <h2>Инструкция проекта</h2>
          </div>
          <ClipboardCheck {...iconSize()} />
        </div>
        <div className="rule-editor">
          <input
            value={newRule}
            onChange={(event) => setNewRule(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                addProjectRule(newRule);
                setNewRule('');
              }
            }}
            placeholder="Новое правило проекта"
          />
          <button
            className="action-button primary"
            disabled={!newRule.trim()}
            onClick={() => {
              addProjectRule(newRule);
              setNewRule('');
            }}
          >
            <Plus {...iconSize()} />
            Добавить
          </button>
        </div>
        <ul className="rule-list">
          {state.project.rules.map((rule, index) => (
            <li key={`${rule}-${index}`}>
              <span>{rule}</span>
              <button className="icon-button" onClick={() => removeProjectRule(index)} title="Удалить правило" aria-label="Удалить правило">
                <Trash2 {...iconSize(15)} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-title">Задача</span>
            <h2>Статус и приоритет</h2>
          </div>
          <UserCheck {...iconSize()} />
        </div>
        <div className="admin-task-controls">
          <label>
            <span>Статус</span>
            <select value={state.task.status} onChange={(event) => updateTaskAdmin({ status: event.target.value as TaskStatus })}>
              {taskStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Приоритет</span>
            <select value={state.task.priority} onChange={(event) => updateTaskAdmin({ priority: event.target.value as AppState['task']['priority'] })}>
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
            </select>
          </label>
          <label>
            <span>Ответственный</span>
            <select value={state.task.assigneeId} onChange={(event) => updateTaskAdmin({ assigneeId: event.target.value })}>
              {state.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Верификатор</span>
            <select value={state.task.verifierId} onChange={(event) => updateTaskAdmin({ verifierId: event.target.value })}>
              {state.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <span className="section-title">AuditLog</span>
            <h2>{state.auditLog.length} действий</h2>
          </div>
          <button className="action-button" onClick={onReset}>
            <RefreshCcw {...iconSize()} />
            Reset demo
          </button>
        </div>
        <div className="audit-list">
          {state.auditLog.map((entry) => (
            <div key={entry.id}>
              <span>{new Date(entry.createdAt).toLocaleString('ru-RU')}</span>
              <strong>{entry.action}</strong>
              <small>{entry.entityType} / {entry.entityId}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Checklist({
  items,
  onToggle,
  onAdd,
  onRename,
  onDelete
}: {
  items: ChecklistItem[];
  onToggle: (id: string, done: boolean) => void;
  onAdd: (label: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');

  function startEditing(item: ChecklistItem) {
    setEditingId(item.id);
    setEditingDraft(item.label);
  }

  function saveEditing() {
    if (!editingId) return;
    const nextLabel = editingDraft.trim();
    if (nextLabel) onRename(editingId, nextLabel);
    setEditingId(null);
    setEditingDraft('');
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingDraft('');
  }

  return (
    <div className="checklist">
      {items.map((item) =>
        editingId === item.id ? (
          <div key={item.id} className="check-item editing">
            <input type="checkbox" checked={item.done} onChange={(event) => onToggle(item.id, event.target.checked)} />
            <input
              value={editingDraft}
              onChange={(event) => setEditingDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveEditing();
                if (event.key === 'Escape') cancelEditing();
              }}
              aria-label="Текст пункта чек-листа"
            />
            <div className="check-item-actions">
              <button type="button" className="icon-button" onClick={saveEditing} title="Сохранить пункт" aria-label="Сохранить пункт" disabled={!editingDraft.trim()}>
                <Check {...iconSize(15)} />
              </button>
              <button type="button" className="icon-button" onClick={cancelEditing} title="Отменить" aria-label="Отменить">
                <X {...iconSize(15)} />
              </button>
            </div>
          </div>
        ) : (
          <div key={item.id} className="check-item">
            <label className="check-item-main">
              <input type="checkbox" checked={item.done} onChange={(event) => onToggle(item.id, event.target.checked)} />
              <span>{item.label}</span>
            </label>
            <div className="check-item-actions">
              <button type="button" className="icon-button" onClick={() => startEditing(item)} title="Редактировать пункт" aria-label="Редактировать пункт">
                <Pencil {...iconSize(15)} />
              </button>
              <button type="button" className="icon-button" onClick={() => onDelete(item.id)} title="Удалить пункт" aria-label="Удалить пункт">
                <Trash2 {...iconSize(15)} />
              </button>
            </div>
          </div>
        )
      )}
      <div className="checklist-add">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onAdd(draft);
              setDraft('');
            }
          }}
          placeholder="Новый пункт чек-листа"
        />
        <button
          className="action-button primary compact"
          type="button"
          disabled={!draft.trim()}
          onClick={() => {
            onAdd(draft);
            setDraft('');
          }}
        >
          <Plus {...iconSize(15)} />
          Добавить
        </button>
      </div>
    </div>
  );
}

function StatusBars({ terms }: { terms: Term[] }) {
  const statuses: Term['status'][] = ['new', 'review', 'approved', 'disputed', 'rejected'];
  return (
    <div className="status-bars">
      {statuses.map((status) => {
        const count = terms.filter((term) => term.status === status).length;
        const width = Math.max(6, (count / Math.max(1, terms.length)) * 100);
        return (
          <div key={status}>
            <span>{status}</span>
            <strong>
              <em style={{ width: `${width}%` }} />
            </strong>
            <b>{count}</b>
          </div>
        );
      })}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <section className="panel metric">
      <Icon {...iconSize(20)} />
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function NavButton({ icon: Icon, label, active, disabled, onClick }: { icon: LucideIcon; label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? 'active' : ''}`} disabled={disabled} onClick={onClick}>
      <Icon {...iconSize()} />
      <span>{label}</span>
    </button>
  );
}

function FileInput({ icon: Icon, label, accept, onFile }: { icon: LucideIcon; label: string; accept: string; onFile: (file?: File) => void }) {
  return (
    <label className="file-button">
      <Icon {...iconSize()} />
      <span>{label}</span>
      <input type="file" accept={accept} onChange={(event) => onFile(event.target.files?.[0])} />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: 'neutral' | 'info' | 'good' | 'warning' | 'danger' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export default App;
