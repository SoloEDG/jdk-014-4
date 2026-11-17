import type {
  ComicDocument,
  ReadingLocation,
  ReadingMode,
} from "../../../shared/document";
import type {
  PanelRef,
  ReadingSession,
  ReconcileReport,
  ReconciledEvent,
  EventMatch,
  ChapterImpact,
} from "../../../shared/session";
import { documentRevision } from "./version";

/**
 * 按身份重新关联分镜引用：
 * 1. 章节 / 页 / 分镜 id 全部命中 → 直接关联；
 * 2. id 失效（作品被修改）→ 用录制时的序号在当前结构里兜底；
 * 3. 序号也越界 → 判定无法匹配，交界面明示，绝不静默改指别的画面。
 */
export function resolveRef(
  doc: ComicDocument,
  ref: PanelRef,
):
  | { ok: true; location: ReadingLocation; mode: ReadingMode }
  | { ok: false; reason: string } {
  const byId = doc.chapters.find((c) => c.id === ref.chapterId);
  if (byId) {
    const page = byId.pages.find((p) => p.id === ref.pageId);
    const panel = page?.panels.find((p) => p.id === ref.panelId);
    if (page && panel)
      return {
        ok: true,
        location: {
          chapterId: byId.id,
          pageId: page.id,
          panelId: panel.id,
          zoom: 1,
          x: 0,
          y: 0,
        },
        mode: "panel",
      };
  }
  const chapter = doc.chapters[ref.chapterIndex];
  const page = chapter?.pages[ref.pageIndex];
  const panel = page?.panels[ref.panelIndex];
  if (chapter && page && panel)
    return {
      ok: true,
      location: {
        chapterId: chapter.id,
        pageId: page.id,
        panelId: panel.id,
        zoom: 1,
        x: 0,
        y: 0,
      },
      mode: "panel",
    };
  if (!chapter) return { ok: false, reason: "原章节已不存在" };
  if (!page) return { ok: false, reason: "原页面已不存在" };
  return { ok: false, reason: "原分镜已不存在" };
}

export function reconcileSession(
  doc: ComicDocument,
  session: ReadingSession,
): ReconcileReport {
  const currentRevision = documentRevision(doc);
  const events: ReconciledEvent[] = session.events.map((event, index) => {
    if (event.kind === "sound")
      return { event, index, match: { status: "matched" as const } };
    const result = resolveRef(doc, event.ref);
    const match: EventMatch = result.ok
      ? {
          status: "matched",
          location: { ...event.location, ...result.location },
          mode: event.mode,
        }
      : { status: "missing", reason: result.reason };
    return { event, index, match };
  });
  const missingCount = events.filter((e) => e.match.status === "missing").length;
  return {
    changed: currentRevision !== session.version.revision,
    currentRevision,
    events,
    missingCount,
    matchedCount: events.length - missingCount,
  };
}

/** 删除章节前评估对会话的影响，用于强制确认 */
export function chapterImpact(
  doc: ComicDocument,
  sessions: ReadingSession[],
  chapterId: string,
): ChapterImpact {
  const chapter = doc.chapters.find((c) => c.id === chapterId);
  const impacted: ChapterImpact["sessions"] = [];
  let totalMissing = 0;
  for (const session of sessions) {
    const missingViews = session.events.filter(
      (e) => e.kind === "view" && e.ref.chapterId === chapterId,
    ).length;
    if (missingViews > 0) {
      impacted.push({
        id: session.id,
        title: session.title,
        missingViews,
      });
      totalMissing += missingViews;
    }
  }
  return {
    chapterId,
    chapterTitle: chapter?.title ?? "该章节",
    sessions: impacted,
    totalMissing,
  };
}
