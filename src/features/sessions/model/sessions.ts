import { ref, computed, watch, type Ref } from "vue";
import type {
  ComicDocument,
  ReadingLocation,
  ReadingMode,
} from "../../../shared/document";
import type { ChapterImpact, ReadingSession } from "../../../shared/session";
import { makeId } from "../../../shared/commands";
import { readSessions, writeSessions } from "../lib/storage";
import { chapterImpact, reconcileSession } from "../lib/reconcile";
import { documentRevision } from "../lib/version";
import { useRecorder } from "./recorder";
import { usePlayback, type AudioController } from "./playback";

export interface ConfirmRequest {
  id: string;
  title: string;
  message: string;
  details: string[];
  onConfirm: () => void;
}

export function useSessions(
  doc: Ref<ComicDocument>,
  location: Ref<ReadingLocation>,
  mode: Ref<ReadingMode>,
  soundEnabled: Ref<boolean>,
  dialogue: Ref<boolean>,
  audio: AudioController,
) {
  const sessions = ref<ReadingSession[]>(readSessions());
  const status = ref("");
  const confirmRequest = ref<ConfirmRequest | null>(null);

  const recorder = useRecorder(
    doc,
    location,
    mode,
    soundEnabled,
    dialogue,
  );
  const playback = usePlayback(doc, location, mode, audio);

  watch(
    sessions,
    (value) => {
      status.value = writeSessions(value);
    },
    { deep: true },
  );

  const currentRevision = computed(() => documentRevision(doc.value));

  /** 每个会话相对当前作品的关联报告（驱动“无法匹配片段”展示） */
  const reports = computed(() =>
    sessions.value.map((session) => reconcileSession(doc.value, session)),
  );

  function saveRecording() {
    const session = recorder.finish();
    if (session) {
      sessions.value = [session, ...sessions.value];
      status.value = `已保存讲解会话（${session.events.length} 个操作）`;
    }
  }

  function discardRecording() {
    recorder.discard();
    status.value = "已放弃本次录制";
  }

  function removeSession(id: string) {
    if (playback.activeId.value === id) playback.close();
    sessions.value = sessions.value.filter((s) => s.id !== id);
  }

  function renameSession(id: string, title: string) {
    const session = sessions.value.find((s) => s.id === id);
    if (session && title.trim()) session.title = title.trim();
  }

  /**
   * 删除章节入口：先评估会话影响并弹出确认，绝不静默删除。
   * 返回 true 表示已进入确认流程（或无影响直接执行）。
   */
  function requestDeleteChapter(
    chapterId: string,
    doDelete: () => void,
  ): boolean {
    const impact: ChapterImpact = chapterImpact(
      doc.value,
      sessions.value,
      chapterId,
    );
    if (impact.totalMissing === 0) {
      doDelete();
      return true;
    }
    confirmRequest.value = {
      id: makeId("confirm"),
      title: `删除「${impact.chapterTitle}」将影响讲解会话`,
      message: `该章节被 ${impact.sessions.length} 个讲解会话引用，删除后共有 ${impact.totalMissing} 处镜头将无法匹配，回放时会明确标注而不会替换成别的画面。`,
      details: impact.sessions.map(
        (s) => `${s.title} · ${s.missingViews} 处镜头无法匹配`,
      ),
      onConfirm: () => {
        doDelete();
        confirmRequest.value = null;
      },
    };
    return false;
  }

  function cancelConfirm() {
    confirmRequest.value = null;
  }

  return {
    sessions,
    status,
    reports,
    currentRevision,
    confirmRequest,
    recorder,
    playback,
    saveRecording,
    discardRecording,
    removeSession,
    renameSession,
    requestDeleteChapter,
    cancelConfirm,
  };
}
