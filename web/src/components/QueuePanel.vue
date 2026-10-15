<script setup>
import { nextTick, onMounted, ref, watch } from "vue";
import IconButton from "./IconButton.vue";

const props = defineProps({ items: { type: Array, required: true }, currentId: { type: String, default: null }, mode: { type: String, default: "sequence" } });
const emit = defineEmits(["play", "move", "remove", "clear", "close"]);
const listElement = ref();
const rowElements = new Map();

function setRowElement(trackId, element) {
  if (element) rowElements.set(trackId, element);
  else rowElements.delete(trackId);
}

async function scrollToCurrent() {
  await nextTick();
  const list = listElement.value;
  const row = rowElements.get(props.currentId);
  if (!list || !row) return;
  const listBounds = list.getBoundingClientRect();
  const rowBounds = row.getBoundingClientRect();
  const top = list.scrollTop + rowBounds.top - listBounds.top - (list.clientHeight - rowBounds.height) / 2;
  list.scrollTop = top;
}

onMounted(scrollToCurrent);
watch(() => [props.currentId, props.items], scrollToCurrent, { flush: "post" });
</script>

<template>
  <section class="queue-panel">
    <header><div><h2>{{ mode === 'shuffle' ? '随机播放队列' : '当前播放' }}</h2><small>{{ mode === 'shuffle' ? '已随机排列后续歌曲 · ' : '' }}{{ items.length }} 首歌曲</small></div><div><IconButton icon="locate" label="定位当前播放歌曲" :disabled="!items.some(track => track.id === currentId)" @click="scrollToCurrent" /><IconButton icon="trash" label="清空队列" :disabled="!items.length" @click="emit('clear')" /><IconButton icon="close" label="关闭队列" @click="emit('close')" /></div></header>
    <div ref="listElement" class="queue-list">
      <p v-if="!items.length" class="queue-empty">播放队列是空的</p>
      <div v-for="(track, index) in items" :key="track.id" :ref="(element) => setRowElement(track.id, element)" class="queue-row" :class="{ current: track.id === currentId }">
        <button class="queue-song" @click="emit('play', track)"><span class="queue-indicator">{{ track.id === currentId ? '▶' : index + 1 }}</span><span><strong>{{ track.title }}</strong><small>{{ track.artists?.map(a => a.name).join(' / ') }}</small><span v-if="track.id === currentId" class="queue-playing-label">正在播放</span></span></button>
        <div class="queue-actions"><IconButton icon="up" label="上移" :disabled="index === 0" @click="emit('move', index, -1)" /><IconButton icon="down" label="下移" :disabled="index === items.length - 1" @click="emit('move', index, 1)" /><IconButton icon="close" label="从队列移除" @click="emit('remove', index)" /></div>
      </div>
    </div>
  </section>
</template>
