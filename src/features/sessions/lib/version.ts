import type { ComicDocument } from "../../../shared/document";
import type { PanelRef } from "../../../shared/session";

/**
 * 结构内容指纹：只纳入章节 / 页 / 分镜的稳定身份与叙事内容，
 * 不纳入缩放、平移这类阅读状态。作品被修改后指纹必然变化。
 * FNV-1a，32 位，输出十六进制，确定性且无需依赖 crypto。
 */
export function documentRevision(doc: ComicDocument): string {
  let hash = 0x811c9dc5;
  const push = (value: string | number) => {
    const text = String(value);
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x1f;
    hash = Math.imul(hash, 0x01000193);
  };
  push(doc.id);
  doc.chapters.forEach((c, ci) => {
    push(ci);
    push(c.id);
    push(c.title);
    c.pages.forEach((p, pi) => {
      push(pi);
      push(p.id);
      p.panels.forEach((panel, gi) => {
        push(gi);
        push(panel.id);
        push(panel.dialogue);
        push(panel.speaker);
        push(panel.sound);
      });
    });
  });
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function refFromLocation(
  doc: ComicDocument,
  location: { chapterId: string; pageId: string; panelId: string },
): PanelRef {
  const chapterIndex = doc.chapters.findIndex(
    (c) => c.id === location.chapterId,
  );
  const chapter = doc.chapters[chapterIndex];
  const pageIndex =
    chapter?.pages.findIndex((p) => p.id === location.pageId) ?? -1;
  const page = chapter?.pages[pageIndex];
  const panelIndex =
    page?.panels.findIndex((p) => p.id === location.panelId) ?? -1;
  return {
    chapterId: location.chapterId,
    pageId: location.pageId,
    panelId: location.panelId,
    chapterIndex: Math.max(0, chapterIndex),
    pageIndex: Math.max(0, pageIndex),
    panelIndex: Math.max(0, panelIndex),
  };
}
