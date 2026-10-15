<script setup>
import { computed, ref } from "vue";

const props = defineProps({ currentTime: { type: Number, default: 0 }, duration: { type: Number, default: 0 } });
const emit = defineEmits(["seek"]);
const bar = ref(null);
const dragging = ref(false);
const preview = ref(0);
const shownTime = computed(() => dragging.value ? preview.value : props.currentTime);
const percent = computed(() => props.duration ? Math.min(100, Math.max(0, shownTime.value / props.duration * 100)) : 0);

function timeAt(event) {
  if (!bar.value || !props.duration) return 0;
  const rect = bar.value.getBoundingClientRect();
  return Math.min(props.duration, Math.max(0, (event.clientX - rect.left) / rect.width * props.duration));
}
function begin(event) {
  dragging.value = true;
  preview.value = timeAt(event);
  bar.value?.setPointerCapture(event.pointerId);
}
function move(event) { if (dragging.value) preview.value = timeAt(event); }
function finish(event) {
  if (!dragging.value) return;
  preview.value = timeAt(event);
  dragging.value = false;
  emit("seek", preview.value);
}
</script>

<template>
  <div ref="bar" class="progress" role="slider" aria-label="播放进度" :aria-valuemin="0" :aria-valuemax="Math.round(duration)" :aria-valuenow="Math.round(shownTime)" tabindex="0" @pointerdown="begin" @pointermove="move" @pointerup="finish" @pointercancel="dragging = false">
    <div class="progress-fill" :style="{ width: `${percent}%` }"><i /></div>
  </div>
</template>
