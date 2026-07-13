import type {
  AppState,
  AuditLogEntry,
  ChecklistItem,
  GeckoExport,
  GeckoV2Export,
  GeckoV2Speaker,
  GeckoV2Term,
  HistoryEntry,
  QualityCheck,
  RoleName,
  Segment,
  SegmentQualityLevel,
  Speaker,
  TaskStatus,
  Term,
  TranscriptVersion
} from './types';

export const STORAGE_KEY = 'gecko-next-mvp-state';

export function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}

export function formatTime(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const centiseconds = Math.round((safe - Math.floor(safe)) * 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

export function seconds(value: number): number {
  return Number(value.toFixed(2));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function roleTitle(role: RoleName): string {
  const titles: Record<RoleName, string> = {
    annotator: 'Разметчик',
    verifier: 'Верификатор',
    supervisor: 'Супервайзер',
    admin: 'Администратор'
  };
  return titles[role];
}

export function statusTone(status: TaskStatus): 'neutral' | 'info' | 'good' | 'warning' | 'danger' {
  if (status === 'Принята' || status === 'Выгружена') return 'good';
  if (status === 'На проверке' || status === 'Исправлена') return 'info';
  if (status === 'На доработке') return 'danger';
  if (status === 'В работе') return 'warning';
  return 'neutral';
}

export function computeQuality(state: AppState, hasUnsavedChanges = false): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const ordered = [...state.segments].sort((a, b) => a.startTime - b.startTime);
  const dictionary = new Set(state.terms.map((term) => term.normalizedValue.toLowerCase()));
  const checklistDone = state.annotatorChecklist.every((item) => item.done);

  const push = (check: QualityCheck) => checks.push(check);

  ordered.forEach((segment, index) => {
    if (!segment.text.trim()) {
      push({
        id: `empty-${segment.id}`,
        type: 'segment_text',
        result: false,
        message: `Сегмент ${segment.id} без текста`,
        severity: 'critical',
        segmentId: segment.id
      });
    }

    if (segment.endTime <= segment.startTime) {
      push({
        id: `time-${segment.id}`,
        type: 'segment_time',
        result: false,
        message: `У сегмента ${segment.id} нарушен порядок времени`,
        severity: 'critical',
        segmentId: segment.id
      });
    }

    const duration = segment.endTime - segment.startTime;
    if (duration < 0.5) {
      push({
        id: `short-${segment.id}`,
        type: 'segment_duration',
        result: false,
        message: `Сегмент ${segment.id} короче 0.5 сек: проверьте короткую реплику`,
        severity: 'warning',
        segmentId: segment.id
      });
    }

    if (duration > 15) {
      push({
        id: `long-${segment.id}`,
        type: 'segment_duration',
        result: false,
        message: `Сегмент ${segment.id} длиннее 15 сек`,
        severity: 'warning',
        segmentId: segment.id
      });
    }

    if (segment.confidence < 0.7) {
      push({
        id: `confidence-${segment.id}`,
        type: 'asr_confidence',
        result: false,
        message: `Низкая уверенность ASR в сегменте ${segment.id}: ${Math.round(segment.confidence * 100)}%`,
        severity: 'warning',
        segmentId: segment.id
      });
    }

    if (segment.text.trim() && /^[а-яa-z]/.test(segment.text.trim())) {
      push({
        id: `capital-${segment.id}`,
        type: 'text_rule',
        result: false,
        message: `Сегмент ${segment.id} начинается не с заглавной буквы`,
        severity: 'warning',
        segmentId: segment.id
      });
    }

    const possibleTerms = findPossibleTerms(segment.text);
    possibleTerms.forEach((term) => {
      if (!dictionary.has(term.toLowerCase())) {
        push({
          id: `term-${segment.id}-${term}`,
          type: 'term',
          result: false,
          message: `Термин "${term}" не подтверждён в словаре`,
          severity: 'warning',
          segmentId: segment.id
        });
      }
    });

    const next = ordered[index + 1];
    if (next && segment.endTime > next.startTime) {
      push({
        id: `overlap-${segment.id}-${next.id}`,
        type: 'segment_overlap',
        result: false,
        message: `Сегменты ${segment.id} и ${next.id} пересекаются`,
        severity: 'critical',
        segmentId: segment.id
      });
    }
  });

  const openComments = state.comments.filter((comment) => comment.status === 'open').length;
  if (openComments > 0 && state.task.status === 'На доработке') {
    push({
      id: 'comments-open',
      type: 'verification_comments',
      result: false,
      message: `Открытых замечаний после возврата: ${openComments}`,
      severity: 'critical'
    });
  }

  if (!checklistDone && state.task.status !== 'Принята' && state.task.status !== 'Выгружена') {
    push({
      id: 'checklist',
      type: 'checklist',
      result: false,
      message: 'Чек-лист разметчика заполнен не полностью',
      severity: 'warning'
    });
  }

  if (hasUnsavedChanges) {
    push({
      id: 'unsaved',
      type: 'autosave',
      result: false,
      message: 'Есть несохранённые изменения',
      severity: 'critical'
    });
  }

  if (checks.length === 0) {
    checks.push({
      id: 'ok',
      type: 'all',
      result: true,
      message: 'Критических проблем не найдено',
      severity: 'ok'
    });
  }

  return checks;
}

export function findPossibleTerms(text: string): string[] {
  const terms = new Set<string>();
  const patterns = [
    /\b[A-ZА-ЯЁ]{2,}(?:\/[A-ZА-ЯЁ]{2,})?\b/g,
    /\b(?:json|csv|ini|asn1)\b/gi,
    /\b[A-ZА-ЯЁ]+['’][а-яё]+/g,
    /\b(?:TATLIN|VEGMAN|UNIFIED|BACKUP|FLEX|ARCHIVE)\b/gi
  ];

  patterns.forEach((pattern) => {
    text.match(pattern)?.forEach((match) => terms.add(match));
  });

  return [...terms];
}

export function buildAiHints(state: AppState): Array<{ id: string; segmentId: string; title: string; detail: string; action: string }> {
  const hints: Array<{ id: string; segmentId: string; title: string; detail: string; action: string }> = [];

  state.segments.forEach((segment) => {
    if (segment.confidence < 0.7) {
      hints.push({
        id: `low-${segment.id}`,
        segmentId: segment.id,
        title: 'Низкая уверенность ASR',
        detail: `Проверьте текст и границы: ${Math.round(segment.confidence * 100)}%.`,
        action: 'Открыть сегмент'
      });
    }

    if (segment.text.trim() && /^[а-яa-z]/.test(segment.text.trim())) {
      hints.push({
        id: `case-${segment.id}`,
        segmentId: segment.id,
        title: 'Пунктуация и регистр',
        detail: 'Начало предложения похоже на строчную букву.',
        action: 'Исправить регистр'
      });
    }

    if (segment.endTime - segment.startTime < 0.8) {
      hints.push({
        id: `short-${segment.id}`,
        segmentId: segment.id,
        title: 'Короткая реплика',
        detail: 'Сохраните "да", "нет", "угу", "ага", если реплика значима.',
        action: 'Проверить'
      });
    }

    findPossibleTerms(segment.text).forEach((term) => {
      const known = state.terms.some((item) => item.normalizedValue.toLowerCase() === term.toLowerCase());
      if (!known) {
        hints.push({
          id: `term-${segment.id}-${term}`,
          segmentId: segment.id,
          title: 'Технический термин',
          detail: `Добавьте "${term}" в словарь или отметьте спорным.`,
          action: 'Добавить термин'
        });
      }
    });
  });

  return hints.slice(0, 8);
}

export function getSegmentQualityLevel(segment: Segment, checks: QualityCheck[]): SegmentQualityLevel {
  const segmentChecks = checks.filter((check) => check.segmentId === segment.id && !check.result);
  if (segmentChecks.some((check) => check.severity === 'critical')) return 'red';
  if (segmentChecks.some((check) => check.severity === 'warning') || segment.confidence < 0.7) return 'yellow';
  return 'green';
}

export function summarizeSegmentQuality(segments: Segment[], checks: QualityCheck[]) {
  return segments.reduce<Record<SegmentQualityLevel, number>>(
    (summary, segment) => {
      summary[getSegmentQualityLevel(segment, checks)] += 1;
      return summary;
    },
    { green: 0, yellow: 0, red: 0 }
  );
}

export function exportGeckoJson(state: AppState, checks: QualityCheck[]): GeckoExport | GeckoV2Export {
  if (state.sourceSchemaVersion === '2.0' || state.segments.some((segment) => segment.sourceFormat === 'gecko-v2')) {
    return exportGeckoV2(state);
  }

  const speakers = new Map(state.speakers.map((speaker) => [speaker.id, speaker.originalName]));
  return {
    metadata: {
      projectId: state.project.id,
      taskId: state.task.id,
      exportedAt: new Date().toISOString(),
      status: state.task.status,
      version: state.version
    },
    segments: state.segments
      .slice()
      .sort((a, b) => a.startTime - b.startTime)
      .map((segment) => ({
        id: segment.id,
        start: seconds(segment.startTime),
        end: seconds(segment.endTime),
        text: segment.text,
        speaker: speakers.get(segment.speakerId) ?? segment.speakerId,
        confidence: segment.confidence,
        is_crosstalk: segment.isCrosstalk,
        status: segment.status
      })),
    terms: state.terms,
    comments: state.comments,
    quality: checks
  };
}

function exportGeckoV2(state: AppState): GeckoV2Export {
  const speakers = new Map(state.speakers.map((speaker) => [speaker.id, speaker]));
  return {
    schemaVersion: state.sourceSchemaVersion ?? '2.0',
    monologues: state.segments
      .slice()
      .sort((a, b) => a.startTime - b.startTime)
      .map((segment) => {
        const speaker = speakers.get(segment.speakerId);
        const sourceSpeaker = segment.sourceSpeaker ?? {};
        const sourceExtra = segment.sourceExtra ?? {};
        const sourceSpeakerExtra = segment.sourceSpeakerExtra ?? {};
        const speakerId = sourceSpeaker.id ?? speaker?.originalName ?? segment.speakerId;
        const speakerName = sourceSpeaker.name ?? speaker?.displayName ?? speaker?.originalName ?? speakerId;
        return {
          ...sourceExtra,
          speaker: {
            ...sourceSpeakerExtra,
            id: speakerId,
            name: speakerName
          },
          start: seconds(segment.startTime),
          end: seconds(segment.endTime),
          terms: buildGeckoV2Terms(segment)
        };
      })
  };
}

export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function addAudit(state: AppState, userId: string, entityType: string, entityId: string, action: string, oldValue?: string, newValue?: string): AppState {
  const entry: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId,
    entityType,
    entityId,
    action,
    oldValue,
    newValue,
    createdAt: new Date().toISOString()
  };

  return {
    ...state,
    auditLog: [entry, ...state.auditLog].slice(0, 60)
  };
}

export function addHistory(state: AppState, userId: string, action: string, target: string, before?: string, after?: string): AppState {
  const entry: HistoryEntry = {
    id: `hist-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
    userId,
    action,
    target,
    before,
    after
  };

  return {
    ...state,
    history: [entry, ...state.history].slice(0, 80),
    version: state.version + 1
  };
}

export function updateChecklist(items: ChecklistItem[], id: string, done: boolean): ChecklistItem[] {
  return items.map((item) => (item.id === id ? { ...item, done } : item));
}

type JsonRecord = Record<string, unknown>;

export interface ImportResult {
  segments: Segment[];
  speakers: Speaker[];
  duration?: number;
  version: TranscriptVersion;
  sourceSchemaVersion?: string;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function firstNumber(record: JsonRecord, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function firstString(record: JsonRecord, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (value && typeof value === 'object') {
      const nested = asRecord(value);
      const nestedValue = nested.name ?? nested.id ?? nested.label;
      if (typeof nestedValue === 'string' || typeof nestedValue === 'number') return String(nestedValue);
    }
  }
  return fallback;
}

function firstBoolean(record: JsonRecord, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['true', '1', 'yes', 'да'].includes(value.toLowerCase());
    if (typeof value === 'number') return value !== 0;
  }
  return fallback;
}

function omitKeys(record: JsonRecord, keys: string[]): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

function isGeckoV2Payload(payload: unknown): boolean {
  const root = asRecord(payload);
  return root.schemaVersion === '2.0' && Array.isArray(root.monologues);
}

function termText(term: JsonRecord): string {
  const value = term.text;
  return typeof value === 'string' ? value : String(value ?? '');
}

export function composeTermsText(terms: JsonRecord[]): string {
  const noSpaceBefore = new Set(['.', ',', '!', '?', ';', ':', ')', ']', '}', '%', '»']);
  const noSpaceAfter = new Set(['(', '[', '{', '«']);
  return terms.reduce((text, term) => {
    const value = termText(term);
    if (!value) return text;
    if (!text) return value;
    const previous = text[text.length - 1] ?? '';
    if (noSpaceBefore.has(value) || noSpaceAfter.has(previous) || value.startsWith("'")) return `${text}${value}`;
    return `${text} ${value}`;
  }, '');
}

function normalizeGeckoTerm(term: JsonRecord): GeckoV2Term {
  return {
    ...term,
    text: termText(term),
    type: firstString(term, ['type'], 'WORD'),
    start: seconds(firstNumber(term, ['start'], 0)),
    end: seconds(firstNumber(term, ['end'], firstNumber(term, ['start'], 0)))
  };
}

function tokenizeText(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?|[^\s\p{L}\p{N}]/gu) ?? [];
}

function buildTermsFromText(text: string, start: number, end: number): GeckoV2Term[] {
  const tokens = tokenizeText(text);
  if (tokens.length === 0) {
    return [{ text: '', type: 'WORD', start: seconds(start), end: seconds(Math.max(end, start + 0.01)) }];
  }

  const wordTokens = tokens.filter((token) => /[\p{L}\p{N}]/u.test(token));
  const step = (end - start) / Math.max(1, wordTokens.length);
  let wordIndex = 0;
  let cursor = start;

  return tokens.map((token) => {
    const isWord = /[\p{L}\p{N}]/u.test(token);
    if (!isWord) {
      return { text: token, type: 'PUNCTUATION', start: seconds(cursor), end: seconds(cursor) };
    }

    const termStart = start + wordIndex * step;
    const termEnd = wordIndex === wordTokens.length - 1 ? end : start + (wordIndex + 1) * step;
    wordIndex += 1;
    cursor = termEnd;
    return { text: token, type: 'WORD', start: seconds(termStart), end: seconds(Math.max(termEnd, termStart)) };
  });
}

function buildGeckoV2Terms(segment: Segment): GeckoV2Term[] {
  const sourceTerms = segment.sourceTerms?.map((term) => normalizeGeckoTerm(term));
  const currentText = segment.text.trim();

  if (!sourceTerms || composeTermsText(sourceTerms).trim() !== currentText) {
    return buildTermsFromText(currentText, segment.startTime, segment.endTime);
  }

  const oldStart = Math.min(...sourceTerms.map((term) => term.start));
  const oldEnd = Math.max(...sourceTerms.map((term) => term.end));
  const oldDuration = Math.max(0.01, oldEnd - oldStart);
  const newDuration = Math.max(0.01, segment.endTime - segment.startTime);

  return sourceTerms.map((term) => ({
    ...term,
    start: seconds(segment.startTime + ((term.start - oldStart) / oldDuration) * newDuration),
    end: seconds(segment.startTime + ((term.end - oldStart) / oldDuration) * newDuration)
  }));
}

function geckoV2ToSegments(current: AppState, payload: unknown): { segments: Segment[]; speakers: Speaker[]; duration?: number } {
  const root = asRecord(payload);
  const monologues = asArray(root.monologues);
  let speakers = [...current.speakers];

  const segments = monologues
    .map((monologue, index) => {
      const speakerRecord = asRecord(monologue.speaker);
      const speakerId = firstString(speakerRecord, ['id', 'name'], `SPEAKER_${String(index + 1).padStart(2, '0')}`);
      const speakerName = firstString(speakerRecord, ['name', 'id'], speakerId);
      speakers = ensureSpeaker(speakers, current.task.id, speakerId);
      const speaker = speakers.find((item) => item.id === speakerId || item.originalName === speakerId || item.displayName === speakerId) ?? speakers[0];
      const rawTerms = asArray(monologue.terms);
      const sourceTerms = rawTerms.map(normalizeGeckoTerm);
      const termStarts = sourceTerms.map((term) => term.start).filter(Number.isFinite);
      const termEnds = sourceTerms.map((term) => term.end).filter(Number.isFinite);
      const start = firstNumber(monologue, ['start'], termStarts.length ? Math.min(...termStarts) : 0);
      const end = firstNumber(monologue, ['end'], termEnds.length ? Math.max(...termEnds) : start + 0.01);
      const text = composeTermsText(sourceTerms);

      return {
        id: firstString(monologue, ['id', 'segment_id', 'segmentId'], `mono-${index + 1}`),
        taskId: current.task.id,
        startTime: seconds(start),
        endTime: seconds(Math.max(end, start + 0.01)),
        text,
        sourceText: text,
        speakerId: speaker?.id ?? current.speakers[0]?.id ?? 'spk-1',
        status: 'new' as const,
        confidence: Math.max(0, Math.min(1, firstNumber(monologue, ['confidence', 'score', 'probability'], 0.75))),
        isCrosstalk: false,
        listened: false,
        sourceFormat: 'gecko-v2' as const,
        sourceIndex: index,
        sourceSpeaker: { id: speakerId, name: speakerName } satisfies GeckoV2Speaker,
        sourceTerms,
        sourceExtra: omitKeys(monologue, ['speaker', 'start', 'end', 'terms']),
        sourceSpeakerExtra: omitKeys(speakerRecord, ['id', 'name'])
      };
    })
    .filter((segment) => segment.text.trim() || segment.endTime > segment.startTime)
    .sort((a, b) => a.startTime - b.startTime);

  const duration = Math.max(0, ...segments.map((segment) => segment.endTime));
  return { segments, speakers, duration: duration > 0 ? seconds(duration) : undefined };
}

function getCandidateSegments(payload: unknown): JsonRecord[] {
  const root = asRecord(payload);
  const candidatePaths: string[][] = [
    ['segments'],
    ['fragments'],
    ['annotations'],
    ['speech_segments'],
    ['speechSegments'],
    ['items'],
    ['result', 'segments'],
    ['result', 'fragments'],
    ['transcript', 'segments'],
    ['transcription', 'segments'],
    ['data', 'segments'],
    ['gecko', 'segments']
  ];

  for (const path of candidatePaths) {
    let cursor: unknown = root;
    for (const key of path) cursor = asRecord(cursor)[key];
    const list = asArray(cursor);
    if (list.length > 0) return list;
  }

  const words = asArray(root.words);
  if (words.length > 0) {
    return words.map((word, index) => ({
      id: `word-${index + 1}`,
      start: firstNumber(word, ['start', 'start_time', 'from', 'begin'], index),
      end: firstNumber(word, ['end', 'end_time', 'to', 'finish'], index + 0.5),
      text: firstString(word, ['text', 'word', 'value']),
      confidence: firstNumber(word, ['confidence', 'score', 'probability'], 0.75)
    }));
  }

  return [];
}

function getDurationFromPayload(payload: unknown, segments: Segment[]): number | undefined {
  const root = asRecord(payload);
  const duration = firstNumber(root, ['duration', 'audio_duration', 'media_duration', 'length'], 0);
  if (duration > 0) return seconds(duration);
  const metadata = asRecord(root.metadata);
  const metaDuration = firstNumber(metadata, ['duration', 'audio_duration', 'media_duration', 'length'], 0);
  if (metaDuration > 0) return seconds(metaDuration);
  const maxEnd = Math.max(0, ...segments.map((segment) => segment.endTime));
  return maxEnd > 0 ? seconds(maxEnd) : undefined;
}

function ensureSpeaker(speakers: Speaker[], taskId: string, speakerName: string): Speaker[] {
  if (speakers.some((item) => item.id === speakerName || item.originalName === speakerName || item.displayName === speakerName)) return speakers;
  const id = `spk-import-${speakers.length + 1}`;
  return [
    ...speakers,
    {
      id,
      taskId,
      originalName: speakerName,
      displayName: speakerName.startsWith('SPEAKER') ? `Спикер ${speakers.length + 1}` : speakerName,
      editable: false
    }
  ];
}

export function importSegmentsFromGecko(current: AppState, payload: unknown, label = 'Импорт Gecko JSON'): ImportResult {
  if (isGeckoV2Payload(payload)) {
    const imported = geckoV2ToSegments(current, payload);
    if (imported.segments.length === 0) {
      throw new Error('В Gecko JSON v2 не найдено валидных monologues/terms');
    }

    const version: TranscriptVersion = {
      id: `version-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      version: current.version + 1,
      label,
      createdAt: new Date().toISOString(),
      authorId: current.currentUserId ?? 'system',
      source: 'import',
      segments: cloneJson(imported.segments),
      comment: `Импортировано monologues: ${imported.segments.length}`
    };

    return { ...imported, version, sourceSchemaVersion: '2.0' };
  }

  const rawSegments = getCandidateSegments(payload);

  if (rawSegments.length === 0) {
    throw new Error('В файле не найден массив segments/fragments/annotations или список words');
  }

  let speakers = [...current.speakers];
  const segments = rawSegments
    .map((segment, index) => {
      const speakerName = firstString(segment, ['speaker_id', 'speakerId', 'speaker', 'speaker_name', 'speakerName', 'channel'], current.speakers[0]?.originalName ?? 'SPEAKER_00');
      speakers = ensureSpeaker(speakers, current.task.id, speakerName);
      const speaker = speakers.find((item) => item.id === speakerName || item.originalName === speakerName || item.displayName === speakerName) ?? speakers[0];
      const start = firstNumber(segment, ['start', 'start_time', 'startTime', 'from', 'begin', 'start_ts', 'offset'], 0);
      const end = firstNumber(segment, ['end', 'end_time', 'endTime', 'to', 'finish', 'end_ts'], start + firstNumber(segment, ['duration'], 1));
      const text = firstString(segment, ['text', 'transcript', 'transcription', 'value', 'phrase', 'normalized_text', 'normalizedText']);

      return {
        id: firstString(segment, ['id', 'segment_id', 'segmentId'], `imported-${index + 1}`),
        taskId: current.task.id,
        startTime: seconds(start),
        endTime: seconds(Math.max(end, start + 0.01)),
        text,
        sourceText: firstString(segment, ['sourceText', 'source_text', 'asr_text', 'raw_text'], text),
        speakerId: speaker?.id ?? current.speakers[0]?.id ?? 'spk-1',
        status: 'new' as const,
        confidence: Math.max(0, Math.min(1, firstNumber(segment, ['confidence', 'score', 'probability', 'asr_confidence'], 0.75))),
        isCrosstalk: firstBoolean(segment, ['is_crosstalk', 'isCrosstalk', 'crosstalk', 'overlap'], false),
        listened: false
      };
    })
    .sort((a, b) => a.startTime - b.startTime);

  const duration = getDurationFromPayload(payload, segments);
  const version: TranscriptVersion = {
    id: `version-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    version: current.version + 1,
    label,
    createdAt: new Date().toISOString(),
    authorId: current.currentUserId ?? 'system',
    source: 'import',
    segments,
    comment: `Импортировано сегментов: ${segments.length}`
  };

  return { segments, speakers, duration, version };
}

export function parseAnnotationText(fileName: string, text: string): unknown {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (extension === 'json') return JSON.parse(text);

  if (extension === 'csv') {
    const [headerLine, ...rows] = lines;
    if (!headerLine) return { segments: [] };
    const headers = headerLine.split(',').map((item) => item.trim().replace(/^"|"$/g, ''));
    const segments = rows.map((row, index) => {
      const cells = row.match(/("([^"]|"")*"|[^,]+)/g)?.map((cell) => cell.trim().replace(/^"|"$/g, '').replace(/""/g, '"')) ?? [];
      const record = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? '']));
      return {
        id: record.id || `csv-${index + 1}`,
        start: record.start || record.start_time || record.from || record.begin,
        end: record.end || record.end_time || record.to || record.finish,
        text: record.text || record.transcript || record.transcription || record.value,
        speaker: record.speaker || record.speaker_id || record.speakerName,
        confidence: record.confidence || record.score,
        is_crosstalk: record.is_crosstalk || record.crosstalk || record.overlap
      };
    });
    return { segments };
  }

  if (extension === 'rttm') {
    return {
      segments: lines
        .map((line, index) => {
          const parts = line.split(/\s+/);
          if (parts[0] !== 'SPEAKER' || parts.length < 8) return null;
          const start = Number(parts[3]);
          const duration = Number(parts[4]);
          return {
            id: `rttm-${index + 1}`,
            start,
            end: start + duration,
            text: '[speech]',
            speaker: parts[7],
            confidence: 0.75
          };
        })
        .filter(Boolean)
    };
  }

  if (extension === 'ctm') {
    return {
      segments: lines.map((line, index) => {
        const parts = line.split(/\s+/);
        const start = Number(parts[2]);
        const duration = Number(parts[3]);
        return {
          id: `ctm-${index + 1}`,
          start,
          end: start + duration,
          text: parts.slice(4, -1).join(' ') || parts[4] || '',
          speaker: parts[0],
          confidence: Number(parts[parts.length - 1]) || 0.75
        };
      })
    };
  }

  throw new Error('Поддерживаются JSON, CSV, RTTM и CTM');
}

export function createTranscriptVersion(state: AppState, label: string, source: TranscriptVersion['source'], comment: string): TranscriptVersion {
  return {
    id: `version-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    version: state.version + 1,
    label,
    createdAt: new Date().toISOString(),
    authorId: state.currentUserId ?? 'system',
    source,
    segments: cloneState({ ...state, segments: state.segments }).segments,
    comment
  };
}

export function analytics(state: AppState) {
  const durationMinutes = state.media.duration / 60;
  const corrections = state.history.length;
  const openComments = state.comments.filter((comment) => comment.status === 'open').length;
  const termsByStatus = state.terms.reduce<Record<string, number>>((acc, term) => {
    acc[term.status] = (acc[term.status] ?? 0) + 1;
    return acc;
  }, {});
  const checkedSegments = state.segments.filter((segment) => segment.status === 'checked' || segment.status === 'accepted').length;
  const qualityScore = Math.round((checkedSegments / Math.max(1, state.segments.length)) * 70 + (openComments === 0 ? 20 : 8) + (state.task.status === 'Принята' ? 10 : 0));

  return {
    processedFiles: state.task.status === 'Принята' || state.task.status === 'Выгружена' ? 1 : 0,
    durationMinutes,
    speed: 12.4,
    corrections,
    comments: state.comments.length,
    openComments,
    returnRate: state.task.returnCount > 0 ? 100 : 0,
    termsByStatus,
    qualityScore,
    progress: Math.round((checkedSegments / Math.max(1, state.segments.length)) * 100)
  };
}
