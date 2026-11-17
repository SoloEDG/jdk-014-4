import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaybackScheduler, toTimeline } from "../src/features/sessions/lib/scheduler.ts";
import { reconcileSession, resolveRef, chapterImpact } from "../src/features/sessions/lib/reconcile.ts";
import { documentRevision } from "../src/features/sessions/lib/version.ts";

/** 可控时钟 + 手动定时器，保证测试确定性 */
function fakeTimers() {
  let now = 0;
  /** @type {{at:number, fn:Function}[]} */
  const pending = [];
  const clock = () => now;
  const origSet = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => {
    pending.push({ at: now + ms, fn });
    return pending.length;
  };
  function advance(ms) {
    const deadline = now + ms;
    while (pending.length && Math.min(...pending.map((p) => p.at)) <= deadline) {
      const next = pending.sort((a, b) => a.at - b.at).shift();
      now = next.at;
      next.fn();
    }
    now = deadline;
  }
  function restore() {
    globalThis.setTimeout = origSet;
  }
  function pendingCount() {
    return pending.length;
  }
  return { clock, advance, restore, pendingCount };
}

function loc(id) {
  return { chapterId: "c0", pageId: "p0", panelId: id, zoom: 1, x: 0, y: 0 };
}
function view(at, id, matched = true) {
  return {
    event: {
      kind: "view",
      at,
      ref: { chapterId: "c0", pageId: "p0", panelId: id, chapterIndex: 0, pageIndex: 0, panelIndex: Number(id.replace("g", "")) },
      location: loc(id),
      mode: "panel",
    },
    at,
    matched,
    location: matched ? loc(id) : undefined,
    mode: matched ? "panel" : undefined,
  };
}
function sound(at, enabled, dialogue = true) {
  return {
    event: { kind: "sound", at, enabled, dialogue },
    at,
    matched: true,
  };
}

test("拖动时间点后，拖动前仍在等待的声音不会被播出", () => {
  const timers = fakeTimers();
  const views = [], sounds = [];
  const items = [
    view(0, "g0"),
    sound(1000, true),
    view(2000, "g1"),
    sound(3000, false),
  ];
  const s = new PlaybackScheduler(
    items,
    5000,
    { applyView: (l) => views.push(l.panelId), applySound: (on) => sounds.push(on) },
    timers.clock,
  );
  s.play(0);
  // 时间推进到 500ms：1000ms 的“开声音”仍在等待
  timers.advance(500);
  assert.deepEqual(sounds, []);
  // 此时拖到 3500ms（该时刻声音应为关）
  s.seek(3500);
  // 把原本等待中的定时器时间点走完
  timers.advance(2000);
  // 旧的“开声音”回调必须已失效，最终只剩 seek 重建出的 false
  assert.deepEqual(sounds, [false]);
  timers.restore();
});

test("回放按时间先后还原画面与对白声音顺序", () => {
  const timers = fakeTimers();
  const views = [], sounds = [];
  const items = [
    view(0, "g0"),
    sound(100, true, false),
    view(200, "g1"),
    sound(400, true, true),
  ];
  const s = new PlaybackScheduler(
    items,
    600,
    {
      applyView: (l) => views.push(l.panelId),
      applySound: (on, d) => sounds.push({ on, d }),
    },
    timers.clock,
  );
  s.play(0);
  timers.advance(600);
  assert.deepEqual(views, ["g0", "g1"]);
  assert.deepEqual(sounds, [
    { on: true, d: false },
    { on: true, d: true },
  ]);
  timers.restore();
});

test("无法匹配的片段被跳过，不会静默替换成别的画面", () => {
  const timers = fakeTimers();
  const views = [];
  const items = [
    view(0, "g0"),
    { ...view(100, "g1", false), location: undefined, mode: undefined },
    view(200, "g2"),
  ];
  const s = new PlaybackScheduler(
    items,
    400,
    { applyView: (l) => views.push(l.panelId), applySound: () => {} },
    timers.clock,
  );
  s.play(0);
  timers.advance(400);
  assert.deepEqual(views, ["g0", "g2"]);
  timers.restore();
});

function makeDoc(ids) {
  return {
    version: 1,
    id: "doc",
    title: "t",
    author: "a",
    chapters: [
      {
        id: "c0",
        title: "章",
        subtitle: "",
        pages: [
          {
            id: "p0",
            title: "页",
            image: "",
            width: 100,
            height: 100,
            panels: ids.map((id, i) => ({
              id,
              rect: { x: 0, y: 0, width: 10, height: 10 },
              dialogue: `d${i}`,
              speaker: "旁白",
              sound: "rain",
              duration: 4,
            })),
          },
        ],
      },
    ],
  };
}

test("版本变化时按身份（id）重新关联，id 失效再用序号兜底", () => {
  const session = {
    id: "s1",
    title: "会话",
    created: 0,
    duration: 1000,
    version: { documentId: "doc", revision: "old", recordedAt: 0 },
    events: [
      {
        kind: "view",
        at: 0,
        ref: { chapterId: "c0", pageId: "p0", panelId: "g0", chapterIndex: 0, pageIndex: 0, panelIndex: 0 },
        location: loc("g0"),
        mode: "panel",
      },
    ],
  };
  // id 仍在 → 直接关联
  const same = reconcileSession(makeDoc(["g0", "g1"]), session);
  assert.equal(same.changed, true);
  assert.equal(same.events[0].match.status, "matched");
  // id 变了但序号有效 → 序号兜底
  const renamed = reconcileSession(makeDoc(["new0", "new1"]), session);
  assert.equal(renamed.events[0].match.status, "matched");
  assert.equal(renamed.events[0].match.location.panelId, "new0");
  // 章节都没了 → 无法匹配，明示原因
  const emptyDoc = { ...makeDoc([]), chapters: [] };
  const gone = reconcileSession(emptyDoc, session);
  assert.equal(gone.events[0].match.status, "missing");
});

test("resolveRef 对彻底失联的引用返回原因而不是就近改指", () => {
  const doc = makeDoc(["g0"]);
  const r = resolveRef(doc, {
    chapterId: "gone", pageId: "gone", panelId: "gone",
    chapterIndex: 9, pageIndex: 0, panelIndex: 0,
  });
  assert.equal(r.ok, false);
});

test("documentRevision 对内容修改敏感、对无关改动稳定", () => {
  const doc = makeDoc(["g0", "g1"]);
  const base = documentRevision(doc);
  assert.equal(documentRevision(JSON.parse(JSON.stringify(doc))), base);
  const changed = JSON.parse(JSON.stringify(doc));
  changed.chapters[0].pages[0].panels[0].dialogue = "改了对白";
  assert.notEqual(documentRevision(changed), base);
});

test("chapterImpact 统计删除章节后失联的镜头数，供删除前确认", () => {
  const doc = makeDoc(["g0", "g1"]);
  const session = {
    id: "s1", title: "x", created: 0, duration: 10,
    version: { documentId: "doc", revision: "r", recordedAt: 0 },
    events: [
      { kind: "view", at: 0, ref: { chapterId: "c0", pageId: "p0", panelId: "g0", chapterIndex: 0, pageIndex: 0, panelIndex: 0 }, location: loc("g0"), mode: "panel" },
      { kind: "view", at: 5, ref: { chapterId: "c0", pageId: "p0", panelId: "g1", chapterIndex: 0, pageIndex: 0, panelIndex: 1 }, location: loc("g1"), mode: "panel" },
      { kind: "sound", at: 6, enabled: true, dialogue: true },
    ],
  };
  const impact = chapterImpact(doc, [session], "c0");
  assert.equal(impact.totalMissing, 2);
  assert.equal(impact.sessions[0].missingViews, 2);
  // 不相关章节 → 无影响，可直接删除
  assert.equal(chapterImpact(doc, [session], "other").totalMissing, 0);
});

test("toTimeline 保留全部事件并标注匹配状态", () => {
  const doc = makeDoc(["g0"]);
  const session = {
    id: "s", title: "x", created: 0, duration: 10,
    version: { documentId: "doc", revision: "r", recordedAt: 0 },
    events: [
      { kind: "sound", at: 0, enabled: false, dialogue: true },
      { kind: "view", at: 1, ref: { chapterId: "x", pageId: "x", panelId: "x", chapterIndex: 9, pageIndex: 0, panelIndex: 0 }, location: loc("x"), mode: "panel" },
    ],
  };
  const timeline = toTimeline(reconcileSession(doc, session).events);
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].matched, true);
  assert.equal(timeline[1].matched, false);
});
