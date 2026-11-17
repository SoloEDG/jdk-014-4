import type { ReadingSession, SessionEvent } from "../../../shared/session";

const KEY = "panel-jdk014-sessions-v1";

function isValidEvent(event: unknown): event is SessionEvent {
  if (typeof event !== "object" || event === null) return false;
  const e = event as Record<string, unknown>;
  if (typeof e.at !== "number" || e.at < 0) return false;
  if (e.kind === "sound")
    return typeof e.enabled === "boolean" && typeof e.dialogue === "boolean";
  if (e.kind !== "view") return false;
  const ref = e.ref as Record<string, unknown> | undefined;
  const location = e.location as Record<string, unknown> | undefined;
  return (
    !!ref &&
    typeof ref.chapterId === "string" &&
    typeof ref.pageId === "string" &&
    typeof ref.panelId === "string" &&
    !!location &&
    typeof location.chapterId === "string" &&
    (e.mode === "page" || e.mode === "panel")
  );
}

function isValidSession(value: unknown): value is ReadingSession {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  const version = s.version as Record<string, unknown> | undefined;
  return (
    typeof s.id === "string" &&
    typeof s.title === "string" &&
    typeof s.duration === "number" &&
    !!version &&
    typeof version.revision === "string" &&
    typeof version.documentId === "string" &&
    Array.isArray(s.events) &&
    s.events.every(isValidEvent)
  );
}

export function readSessions(): ReadingSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(isValidSession);
  } catch {
    return [];
  }
}

export function writeSessions(sessions: ReadingSession[]): string {
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions));
    return "会话已保存到此浏览器";
  } catch {
    return "存储空间不足，会话仅保留在当前页面";
  }
}
