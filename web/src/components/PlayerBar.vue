<script setup>
import ProgressBar from "./ProgressBar.vue";
import IconButton from "./IconButton.vue";

defineProps({
  track: { type: Object, default: null }, playing: Boolean, currentTime: { type: Number, default: 0 },
  duration: { type: Number, default: 0 }, volume: { type: Number, default: 0.8 },
  mode: { type: String, default: "sequence" }, quality: { type: String, default: "high" },
  queueCount: { type: Number, default: 0 }, queueOpen: Boolean, lyricsOpen: Boolean,
});
const emit = defineEmits(["toggle", "previous", "next", "seek", "volume", "mute", "mode", "quality", "queue", "lyrics"]);
const modeIcon = { sequence: "list", "repeat-list": "repeat", "repeat-one": "repeatOne", shuffle: "shuffle" };
const modeLabel = { sequence: "顺序播放", "repeat-list": "列表循环", "repeat-one": "单曲循环", shuffle: "随机播放" };
function format(value) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}
</script>

<template>
  <footer class="player-bar">
    <ProgressBar :current-time="currentTime" :duration="duration" @seek="emit('seek', $event)" />
    <div class="now-playing">
      <button class="mini-cover" type="button" :aria-label="track ? `打开《${track.title}》歌词` : '暂无正在播放的歌曲'" :disabled="!track" :style="track?.album?.coverUrl ? { backgroundImage: `url(${track.album.coverUrl})` } : {}" @click="emit('lyrics')">{{ track ? '♫' : 'Q' }}</button>
      <div class="track-copy"><strong>{{ track?.title || '尚未播放' }}</strong><small>{{ track?.artists?.map(a => a.name).join(' / ') || '从歌单选择歌曲' }}</small></div>
      <IconButton icon="music" label="打开歌词" :active="lyricsOpen" :disabled="!track" @click="emit('lyrics')" />
    </div>
    <div class="player-center">
      <div class="transport">
        <IconButton icon="previous" label="上一首" @click="emit('previous')" />
        <IconButton class="transport-play" :icon="playing ? 'pause' : 'play'" :label="playing ? '暂停' : '播放'" variant="primary" size="large" @click="emit('toggle')" />
        <IconButton icon="next" label="下一首" @click="emit('next')" />
      </div>
      <div class="time-row"><span>{{ format(currentTime) }}</span><span>/</span><span>{{ format(duration) }}</span></div>
    </div>
    <div class="player-options">
      <select :value="quality" aria-label="音质" @change="emit('quality', $event.target.value)"><option value="standard">标准</option><option value="high">高品质</option><option value="lossless">无损</option><option value="hires">Hi-Res</option></select>
      <IconButton :icon="modeIcon[mode]" :label="modeLabel[mode]" @click="emit('mode')" />
      <label class="volume"><IconButton :icon="volume === 0 ? 'mute' : 'volume'" :label="volume === 0 ? '取消静音' : '静音'" @click="emit('mute')" /><input type="range" min="0" max="1" step="0.01" :value="volume" aria-label="音量" @input="emit('volume', Number($event.target.value))"></label>
      <IconButton icon="queue" label="播放队列" :active="queueOpen" @click="emit('queue')"><template v-if="queueCount">{{ queueCount }}</template></IconButton>
    </div>
  </footer>
</template>
