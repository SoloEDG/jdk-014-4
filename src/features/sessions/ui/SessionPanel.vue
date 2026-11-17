<script setup lang="ts">
import { computed } from "vue";
import {
  CircleDot,
  Pause,
  Play,
  Square,
  Trash2,
  RotateCcw,
  Film,
  Unlink,
  CheckCircle2,
} from "lucide-vue-next";
import type { ReadingSession } from "../../../shared/session";
import type { useSessions } from "../model/sessions";

const props = defineProps<{
  sessions: ReadingSession[];
  reports: ReturnType<typeof useSessions>["reports"]["value"];
  currentRevision: string;
  recording: boolean;
  paused: boolean;
  clock: number;
  eventCount: number;
  activeId: string;
  status: string;
}>();
const emit = defineEmits<{
  start: [];
  pause: [];
  resume: [];
  save: [];
  discard: [];
  replay: [];
  open: [session: ReadingSession];
  remove: [id: string];
}>();

function fmt(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
const reportOf = computed(
  () => new Map(props.reports.map((r, i) => [props.sessions[i]!.id, r])),
);
</script>
<template>
  <section class="session-panel">
    <div class="section-heading">
      <span><Film :size="14" /> 讲解会话 <small>GUIDED READING</small></span>
      <span class="muted">{{ sessions.length }} 段</span>
    </div>

    <!-- 录制控制台 -->
    <div class="recorder" :class="{ live: recording, paused }">
      <template v-if="!recording">
        <p class="recorder-hint">把翻页、分镜、缩放停留与声音切换录成可回放的讲解节奏</p>
        <button class="recorder-start" @click="emit('start')">
          <CircleDot :size="15" /> 开始讲解录制
        </button>
      </template>
      <template v-else>
        <div class="recorder-status">
          <span class="rec-dot"></span>
          <strong>{{ paused ? "已暂停" : "录制中" }}</strong>
          <b>{{ fmt(clock) }}</b>
          <small>{{ eventCount }} 个操作</small>
        </div>
        <div class="recorder-buttons">
          <button v-if="!paused" class="rec-btn" @click="emit('pause')">
            <Pause :size="13" /> 暂停
          </button>
          <button v-else class="rec-btn" @click="emit('resume')">
            <Play :size="13" /> 继续
          </button>
          <button class="rec-btn" title="重看当前镜头（追加记录，不回退时间）" @click="emit('replay')">
            <RotateCcw :size="13" /> 重看
          </button>
          <button class="rec-btn danger" @click="emit('discard')">
            <Trash2 :size="13" /> 放弃
          </button>
          <button class="rec-btn primary" @click="emit('save')">
            <Square :size="12" /> 完成保存
          </button>
        </div>
        <p class="recorder-tip">暂停期间可自由翻看与临时关声音，恢复后继续计时</p>
      </template>
    </div>

    <!-- 会话列表 -->
    <div v-if="!sessions.length" class="session-empty">
      <Film :size="22" />
      <p>还没有讲解会话，录一段试试</p>
    </div>
    <article
      v-for="session in sessions"
      :key="session.id"
      class="session-item"
      :class="{ active: session.id === activeId }"
    >
      <button class="session-open" @click="emit('open', session)">
        <div class="session-meta">
          <strong>{{ session.title }}</strong>
          <small>
            {{ fmt(session.duration) }} · {{ session.events.length }} 个操作 ·
            {{ new Date(session.created).toLocaleDateString("zh-CN") }}
          </small>
        </div>
        <span
          class="version-badge"
          :class="{
            drifted: reportOf.get(session.id)?.changed,
            broken: (reportOf.get(session.id)?.missingCount ?? 0) > 0,
          }"
          :title="`录制版本 ${session.version.revision.slice(0, 8)} / 当前 ${currentRevision.slice(0, 8)}`"
        >
          <template v-if="(reportOf.get(session.id)?.missingCount ?? 0) > 0">
            <Unlink :size="10" /> {{ reportOf.get(session.id)?.missingCount }} 处失联
          </template>
          <template v-else-if="reportOf.get(session.id)?.changed">
            版本已变 · 已重新关联
          </template>
          <template v-else>
            <CheckCircle2 :size="10" /> 版本一致
          </template>
        </span>
      </button>

      <!-- 无法匹配的片段：明示，绝不静默改指 -->
      <div
        v-if="(reportOf.get(session.id)?.missingCount ?? 0) > 0"
        class="missing-fragments"
      >
        <p><Unlink :size="11" /> 以下镜头在当前作品中无法匹配：</p>
        <ul>
          <li
            v-for="entry in reportOf
              .get(session.id)
              ?.events.filter((e) => e.match.status === 'missing')
              .slice(0, 4)"
            :key="entry.index"
          >
            #{{ entry.index + 1 }} ·
            {{ entry.match.status === "missing" ? entry.match.reason : "" }}
            <small>（{{ fmt(entry.event.at) }}）</small>
          </li>
        </ul>
      </div>

      <div class="session-actions">
        <button title="回放此会话" @click="emit('open', session)">
          <Play :size="12" /> 回放
        </button>
        <button
          class="session-delete"
          title="删除会话"
          @click="emit('remove', session.id)"
        >
          <Trash2 :size="12" />
        </button>
      </div>
    </article>

    <p v-if="status" class="session-status">{{ status }}</p>
  </section>
</template>
