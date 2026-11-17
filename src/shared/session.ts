import type { ReadingLocation, ReadingMode } from "./document";

/** 分镜身份引用：优先按稳定 id 重新关联，序号仅在 id 失效时兜底 */
export interface PanelRef {
  chapterId: string;
  pageId: string;
  panelId: string;
  /** 录制时的章节 / 页 / 分镜序号，供 id 无法匹配时按身份重新关联 */
  chapterIndex: number;
  pageIndex: number;
  panelIndex: number;
}

/** 录制时引用的作品版本指纹 */
export interface SessionVersion {
  documentId: string;
  /** 结构内容的稳定指纹：章节 / 页 / 分镜 id 与对白变化都会改变它 */
  revision: string;
  recordedAt: number;
}

/** 逐次记录的操作事件：保留“意图”，而不是画面快照 */
export type SessionEvent =
  | {
      kind: "view";
      at: number;
      ref: PanelRef;
      location: ReadingLocation;
      mode: ReadingMode;
    }
  | {
      kind: "sound";
      at: number;
      /** 临时关闭 / 重新打开声音（含录制暂停期间的操作） */
      enabled: boolean;
      /** 是否展示对白，回放时还原对白出现的先后 */
      dialogue: boolean;
    };

export interface ReadingSession {
  id: string;
  title: string;
  created: number;
  /** 总时长（毫秒），录制结束时落定 */
  duration: number;
  version: SessionVersion;
  events: SessionEvent[];
}

/** 单个事件与当前作品重新关联后的状态 */
export type EventMatch =
  | {
      status: "matched";
      /** 仅 view 事件携带；sound 事件无画面位置 */
      location?: ReadingLocation;
      mode?: ReadingMode;
    }
  | { status: "missing"; reason: string };

export interface ReconciledEvent {
  event: SessionEvent;
  index: number;
  match: EventMatch;
}

export interface ReconcileReport {
  /** 与录制版本相比，当前作品是否已变化 */
  changed: boolean;
  currentRevision: string;
  events: ReconciledEvent[];
  missingCount: number;
  matchedCount: number;
}

/** 章节删除对已有会话的影响（删除前必须确认） */
export interface ChapterImpact {
  chapterId: string;
  chapterTitle: string;
  sessions: {
    id: string;
    title: string;
    /** 该章节内、删除后将无法匹配的 view 事件数量 */
    missingViews: number;
  }[];
  totalMissing: number;
}
