import { ref, computed, watch, onBeforeUnmount, type ComputedRef } from "vue";
import type { Panel } from "../../../shared/document";
import { AmbientSynth } from "../lib/synth";
import { cueFor } from "../lib/cues";
export function useAudio(panel: ComputedRef<Panel | undefined>) {
  const enabled = ref(false),
    volume = ref(0.35),
    dialogue = ref(true),
    error = ref(""),
    cue = computed(() => cueFor(panel.value));
  const synth = new AmbientSynth();
  let generation = 0;
  async function play() {
    const own = ++generation;
    try {
      await synth.start(cue.value.kind, volume.value);
      // 异步恢复期间若已被暂停 / 切换 / 拖动作废，则立即停掉，杜绝迟到的声音
      if (own !== generation || !enabled.value) synth.stop();
    } catch {
      if (own === generation) {
        enabled.value = false;
        error.value = "浏览器未能启动声音，请再次点击播放";
      }
    }
  }
  function toggle() {
    setEnabled(!enabled.value);
  }
  /** 统一的开关入口：用户操作与回放驱动共用，代次保护对两者都生效 */
  function setEnabled(value: boolean) {
    enabled.value = value;
    if (value) void play();
    else {
      generation++;
      synth.stop();
    }
  }
  function setDialogue(value: boolean) {
    dialogue.value = value;
  }
  function stop() {
    generation++;
    synth.stop();
    enabled.value = false;
  }
  watch(
    () => panel.value?.id,
    () => {
      if (enabled.value) void play();
    },
  );
  watch(volume, (v) => synth.volume(v));
  onBeforeUnmount(() => synth.dispose());
  return {
    enabled,
    volume,
    dialogue,
    error,
    cue,
    toggle,
    setEnabled,
    setDialogue,
    stop,
  };
}
