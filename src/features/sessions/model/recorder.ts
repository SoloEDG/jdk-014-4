import { ref, computed, watch, onBeforeUnmount, type Ref } from "vue";
import type {
  ComicDocument,
  ReadingLocation,
  ReadingMode,
} from "../../../shared/document";
import type { ReadingSession, SessionEvent } from "../../../shared/session";
import { makeId } from "../../../shared/commands";
import { documentRevision, refFromLocation } from "../lib/version";

/** 对联合类型逐成员生效的 Omit */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
type EventBody = DistributiveOmit<SessionEvent, "at">;

export function useRecorder(
  doc: Ref<ComicDocument>,
  location: Ref<ReadingLocation>,
  mode: Ref<ReadingMode>,
  soundEnabled: Ref<boolean>,
  dialogue: Ref<boolean>,
) {
  const recording = ref(false);
  const paused = ref(false);
  const events = ref<SessionEvent[]>([]);
  const startedAt = ref(0);
  const accumulated = ref(0);
  // 心跳：让录制计时在界面上每秒跳动
  const now = ref(Date.now());
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const clock = computed(() =>
    recording.value
      ? accumulated.value + (paused.value ? 0 : now.value - startedAt.value)
      : 0,
  );

  /** 当前录制时间轴上的精确时间（事件打戳用墙钟，避免心跳粒度误差） */
  function timelineNow() {
    if (!recording.value) return 0;
    return (
      accumulated.value + (paused.value ? 0 : Date.now() - startedAt.value)
    );
  }

  function push(event: EventBody) {
    if (!recording.value || paused.value) return;
    events.value.push({ ...event, at: timelineNow() });
  }

  function view() {
    push({
      kind: "view",
      ref: refFromLocation(doc.value, location.value),
      location: { ...location.value },
      mode: mode.value,
    });
  }

  // 翻页 / 分镜选择 / 缩放停留：可见位置一变就逐次记录意图
  watch(location, view, { deep: true });
  watch(mode, view);
  // 声音切换（含临时关闭）与对白显隐
  watch(soundEnabled, (enabled) =>
    push({ kind: "sound", enabled, dialogue: dialogue.value }),
  );
  watch(dialogue, (value) =>
    push({ kind: "sound", enabled: soundEnabled.value, dialogue: value }),
  );

  function start() {
    if (recording.value) return;
    events.value = [];
    accumulated.value = 0;
    startedAt.value = Date.now();
    now.value = startedAt.value;
    paused.value = false;
    recording.value = true;
    heartbeat = setInterval(() => {
      now.value = Date.now();
    }, 250);
    // 首帧：保证回放一开始就有确定的可见位置
    view();
  }

  function pauseRecording() {
    if (!recording.value || paused.value) return;
    accumulated.value = timelineNow();
    paused.value = true;
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  function resumeRecording() {
    if (!recording.value || !paused.value) return;
    startedAt.value = Date.now();
    now.value = startedAt.value;
    paused.value = false;
    heartbeat = setInterval(() => {
      now.value = Date.now();
    }, 250);
  }

  /** 重看：录制中回到之前的画面，追加一条新的 view 事件，时间线不回退 */
  function markReplay() {
    if (!recording.value || paused.value) return;
    view();
  }

  function finish(): ReadingSession | null {
    if (!recording.value) return null;
    const duration = timelineNow();
    const session: ReadingSession = {
      id: makeId("session"),
      title: `讲解回放 · ${new Date().toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      created: Date.now(),
      duration,
      version: {
        documentId: doc.value.id,
        revision: documentRevision(doc.value),
        recordedAt: Date.now(),
      },
      events: [...events.value].sort((a, b) => a.at - b.at),
    };
    reset();
    return session;
  }

  function reset() {
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    recording.value = false;
    paused.value = false;
    events.value = [];
    accumulated.value = 0;
  }

  function discard() {
    reset();
  }

  onBeforeUnmount(reset);

  return {
    recording,
    paused,
    clock,
    eventCount: computed(() => events.value.length),
    start,
    pauseRecording,
    resumeRecording,
    markReplay,
    finish,
    discard,
  };
}
