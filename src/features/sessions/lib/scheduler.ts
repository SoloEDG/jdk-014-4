import type {
  ReadingLocation,
  ReadingMode,
} from "../../../shared/document";
import type { ReconciledEvent, SessionEvent } from "../../../shared/session";

/** 可调度的单条事件（已与当前作品重新关联） */
export interface TimelineItem {
  event: SessionEvent;
  at: number;
  matched: boolean;
  location?: ReadingLocation;
  mode?: ReadingMode;
}

export interface SchedulerAdapter {
  applyView: (location: ReadingLocation, mode: ReadingMode) => void;
  applySound: (enabled: boolean, dialogue: boolean) => void;
}

export function toTimeline(events: ReconciledEvent[]): TimelineItem[] {
  return events.map(({ event, match }) => ({
    event,
    at: event.at,
    matched: match.status === "matched",
    location: match.status === "matched" ? match.location : undefined,
    mode: match.status === "matched" ? match.mode : undefined,
  }));
}

/**
 * 会话回放调度器。
 *
 * 关键不变量：每次 seek / play / pause 都会令调度代次（generation）递增，
 * 旧代次排定的定时器回调即使晚到也会被丢弃 —— 因此“拖动前仍在等待的
 * 声音”绝不会在拖动之后播出来。时钟可注入，便于确定性测试。
 */
export class PlaybackScheduler {
  readonly items: TimelineItem[];
  readonly duration: number;
  private adapter: SchedulerAdapter;
  private clock: () => number;
  private generation = 0;
  private index = 0;
  private playing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentTime = 0;
  private wallOrigin = 0;

  constructor(
    items: TimelineItem[],
    duration: number,
    adapter: SchedulerAdapter,
    clock: () => number = Date.now,
  ) {
    this.items = items;
    this.duration = duration;
    this.adapter = adapter;
    this.clock = clock;
  }

  get isPlaying() {
    return this.playing;
  }

  get position() {
    return this.index;
  }

  get time() {
    return this.playing
      ? Math.min(
          this.duration,
          this.currentTime + (this.clock() - this.wallOrigin),
        )
      : this.currentTime;
  }

  /** 当前时间点应呈现的声音状态（取该时刻之前最后一条 sound 事件） */
  private soundAt(time: number) {
    let result: { enabled: boolean; dialogue: boolean } | null = null;
    for (const item of this.items) {
      if (item.at > time) break;
      if (item.event.kind === "sound")
        result = {
          enabled: item.event.enabled,
          dialogue: item.event.dialogue,
        };
    }
    return result;
  }

  /** 重建某一时刻的画面：取该时刻之前最后一条仍可匹配的 view 事件 */
  private viewAt(time: number): TimelineItem | null {
    let result: TimelineItem | null = null;
    for (const item of this.items) {
      if (item.at > time) break;
      if (item.event.kind === "view" && item.matched && item.location)
        result = item;
    }
    return result;
  }

  /** 跳到指定时间：重建画面与声音，旧代次全部作废 */
  seek(time: number) {
    this.generation++;
    this.clearTimer();
    this.playing = false;
    const clamped = Math.max(0, Math.min(this.duration, time));
    this.currentTime = clamped;
    this.index = this.items.findIndex((item) => item.at > clamped);
    if (this.index < 0) this.index = this.items.length;
    const view = this.viewAt(clamped);
    if (view?.location && view.mode)
      this.adapter.applyView(view.location, view.mode);
    const sound = this.soundAt(clamped);
    if (sound) this.adapter.applySound(sound.enabled, sound.dialogue);
    else this.adapter.applySound(false, true);
  }

  play(fromTime?: number) {
    const gen = ++this.generation;
    this.clearTimer();
    if (fromTime !== undefined) {
      this.currentTime = Math.max(0, Math.min(this.duration, fromTime));
    }
    this.wallOrigin = this.clock();
    this.playing = true;
    this.index = this.items.findIndex(
      (item) => item.at >= this.currentTime,
    );
    if (this.index < 0) this.index = this.items.length;
    this.pump(gen);
  }

  pause() {
    if (!this.playing) return;
    this.currentTime = this.time;
    this.generation++;
    this.clearTimer();
    this.playing = false;
    // 记录暂停点，恢复时从下一条未触发事件继续，不重复播出
    this.index = this.items.findIndex(
      (item) => item.at > this.currentTime,
    );
    if (this.index < 0) this.index = this.items.length;
  }

  stop() {
    this.pause();
    this.seek(0);
  }

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private pump(gen: number) {
    if (gen !== this.generation || !this.playing) return;
    // 无法匹配的片段直接跳过，绝不把原位置静默解释成别的画面
    while (this.index < this.items.length && !this.items[this.index]!.matched)
      this.index++;
    if (this.index >= this.items.length) {
      this.playing = false;
      this.currentTime = this.duration;
      return;
    }
    const item = this.items[this.index]!;
    const delay = Math.max(0, item.at - this.time);
    this.timer = setTimeout(() => {
      // 代次校验：拖动 / 暂停后，旧代次排定的回调一律不执行
      if (gen !== this.generation || !this.playing) return;
      if (item.event.kind === "view" && item.location && item.mode)
        this.adapter.applyView(item.location, item.mode);
      else if (item.event.kind === "sound")
        this.adapter.applySound(item.event.enabled, item.event.dialogue);
      this.index++;
      this.pump(gen);
    }, delay);
  }
}
