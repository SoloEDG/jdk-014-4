<script setup lang="ts">
import { Play, Pause, X, SkipBack, AlertTriangle } from "lucide-vue-next";
import type { ReconcileReport } from "../../../shared/session";
defineProps<{
  title: string;
  playing: boolean;
  time: number;
  duration: number;
  progress: number;
  report: ReconcileReport | null;
}>();
const emit = defineEmits<{
  toggle: [];
  seek: [value: number];
  close: [];
}>();
function fmt(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function onInput(e: Event) {
  emit("seek", Number((e.target as HTMLInputElement).value));
}
</script>
<template>
  <div class="playback-bar" :class="{ drifted: report?.changed }">
    <div class="playback-head">
      <span class="playback-title">▶ {{ title }}</span>
      <button class="playback-close" aria-label="退出回放" @click="emit('close')">
        <X :size="14" />
      </button>
    </div>
    <div v-if="report?.changed" class="playback-warning">
      <AlertTriangle :size="12" />
      <span
        >作品已在录制后修改（版本 {{ report.currentRevision.slice(0, 6) }}）·
        已按身份重新关联，{{ report.missingCount }} 处无法匹配的镜头将跳过并标注</span
      >
    </div>
    <div class="playback-controls">
      <button aria-label="回到开头" @click="emit('seek', 0)">
        <SkipBack :size="15" />
      </button>
      <button
        class="playback-play"
        :aria-label="playing ? '暂停回放' : '播放回放'"
        @click="emit('toggle')"
      >
        <Pause v-if="playing" :size="16" />
        <Play v-else :size="16" />
      </button>
      <span class="playback-time">{{ fmt(time) }}</span>
      <input
        class="playback-scrub"
        type="range"
        min="0"
        :max="Math.max(1, duration)"
        step="50"
        :value="time"
        aria-label="拖动回放时间点"
        @input="onInput"
      />
      <span class="playback-time">{{ fmt(duration) }}</span>
    </div>
    <div class="playback-track">
      <i :style="{ width: `${Math.round(progress * 100)}%` }"></i>
    </div>
  </div>
</template>
