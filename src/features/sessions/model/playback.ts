import { ref, computed, onBeforeUnmount, type Ref } from "vue";
import type {
  ComicDocument,
  ReadingLocation,
  ReadingMode,
} from "../../../shared/document";
import type { ReadingSession, ReconcileReport } from "../../../shared/session";
import { reconcileSession } from "../lib/reconcile";
import { PlaybackScheduler, toTimeline } from "../lib/scheduler";

export interface AudioController {
  /** 直接设定声音开关（回放驱动），内部带代次保护，拒绝晚到的旧启动 */
  setEnabled: (enabled: boolean) => void;
  setDialogue: (visible: boolean) => void;
  stop: () => void;
}

export function usePlayback(
  doc: Ref<ComicDocument>,
  location: Ref<ReadingLocation>,
  mode: Ref<ReadingMode>,
  audio: AudioController,
) {
  const activeId = ref("");
  const playing = ref(false);
  const time = ref(0);
  const report = ref<ReconcileReport | null>(null);
  let scheduler: PlaybackScheduler | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;

  const duration = computed(() => scheduler?.duration ?? 0);
  const progress = computed(() =>
    duration.value ? Math.min(1, time.value / duration.value) : 0,
  );

  function clearTicker() {
    if (ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function syncTicker() {
    clearTicker();
    if (playing.value)
      ticker = setInterval(() => {
        if (!scheduler) return;
        time.value = scheduler.time;
        if (!scheduler.isPlaying) {
          // 自然播放到结尾
          playing.value = false;
          clearTicker();
          time.value = scheduler.time;
        }
      }, 100);
  }

  function open(session: ReadingSession) {
    close();
    activeId.value = session.id;
    const result = reconcileSession(doc.value, session);
    report.value = result;
    scheduler = new PlaybackScheduler(
      toTimeline(result.events),
      session.duration,
      {
        applyView: (loc, m) => {
          location.value = { ...loc };
          mode.value = m;
        },
        applySound: (enabled, dialogueVisible) => {
          // seek 会重建代次，旧的异步启动在此被作废，不会出声
          audio.setEnabled(enabled);
          audio.setDialogue(dialogueVisible);
        },
      },
    );
    scheduler.seek(0);
    time.value = 0;
    playing.value = false;
  }

  function play() {
    if (!scheduler) return;
    scheduler.play(time.value);
    playing.value = true;
    syncTicker();
  }

  function pause() {
    if (!scheduler) return;
    scheduler.pause();
    time.value = scheduler.time;
    playing.value = false;
    clearTicker();
  }

  function toggle() {
    if (playing.value) pause();
    else play();
  }

  /** 拖动时间点：旧代次等待中的声音立即作废，只呈现新时间点的状态 */
  function seek(value: number) {
    if (!scheduler) return;
    const wasPlaying = playing.value;
    scheduler.seek(value);
    time.value = scheduler.time;
    if (wasPlaying) {
      scheduler.play(time.value);
      syncTicker();
    } else {
      playing.value = false;
      clearTicker();
    }
  }

  function close() {
    scheduler?.stop();
    scheduler = null;
    clearTicker();
    activeId.value = "";
    playing.value = false;
    time.value = 0;
    report.value = null;
    audio.stop();
  }

  onBeforeUnmount(close);

  return {
    activeId,
    playing,
    time,
    duration,
    progress,
    report,
    open,
    play,
    pause,
    toggle,
    seek,
    close,
  };
}
