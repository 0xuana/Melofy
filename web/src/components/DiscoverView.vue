<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { searchTracks } from "../api.js";
import { formatTrackDuration } from "../trackPresentation.js";
import { shouldCloseAddMenu } from "../addMenu.js";
import AppIcon from "./AppIcon.vue";
import IconButton from "./IconButton.vue";
import TrackAddMenu from "./TrackAddMenu.vue";

const props = defineProps({
  playlists: { type: Array, default: () => [] },
  likedIds: { type: Set, default: () => new Set() },
  queueIds: { type: Set, default: () => new Set() },
});
const emit = defineEmits(["play", "append", "liked", "playlist-created", "playlist-updated"]);
const query = ref("");
const results = ref([]);
const loading = ref(false);
const error = ref("");
const cursor = ref(null);
const total = ref(null);
const activeTrackId = ref(null);

function closeMenuOnOutsideClick(event) {
  if (shouldCloseAddMenu(event.target)) activeTrackId.value = null;
}

onMounted(() => document.addEventListener("pointerdown", closeMenuOnOutsideClick));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeMenuOnOutsideClick));

const canLoadMore = computed(() => Boolean(cursor.value));

async function search(reset = true) {
  const keyword = query.value.trim();
  if (!keyword) { results.value = []; cursor.value = null; return; }
  if (reset) { results.value = []; cursor.value = null; }
  loading.value = true;
  error.value = "";
  try {
    const page = cursor.value ? Number(cursor.value) : 1;
    const response = await searchTracks(keyword, page, 20);
    results.value = reset ? [...response.items] : [...results.value, ...response.items];
    cursor.value = response.nextCursor;
    total.value = response.total;
  } catch (reason) { error.value = reason.message || "搜索失败"; }
  finally { loading.value = false; }
}

function toggleMenu(track) { activeTrackId.value = activeTrackId.value === track.id ? null : track.id; }
</script>

<template>
  <section class="discover-page">
    <div class="discover-heading">
      <p class="eyebrow">DISCOVER</p>
      <h1>发现音乐</h1>
      <p>搜索 QQ 音乐，找到喜欢的歌曲并加入歌单或播放队列。</p>
    </div>
    <form class="discover-search" @submit.prevent="search(true)">
      <AppIcon name="search" />
      <input v-model="query" aria-label="搜索歌曲" placeholder="搜索歌曲、歌手或专辑" maxlength="100">
      <button v-if="query" class="clear-filter" type="button" aria-label="清空搜索内容" @click="query = ''; results = []; cursor = null"><AppIcon name="close" /></button>
      <button type="submit" :disabled="loading || !query.trim()">搜索</button>
    </form>
    <p v-if="error" class="error discover-error" @click.stop>{{ error }}</p>
    <div v-if="results.length" class="discover-results">
      <div class="discover-list-head"><span>歌曲</span><span>专辑</span><span>时长</span><span>操作</span></div>
      <article v-for="track in results" :key="track.id" class="discover-track" :class="{ 'has-open-add-menu': activeTrackId === track.id }" @click.stop>
        <div class="discover-song"><span class="discover-heart" :class="{ liked: likedIds.has(track.id) }" role="img" :aria-label="likedIds.has(track.id) ? '已添加到我喜欢' : '未添加到我喜欢'"><AppIcon name="heart" /></span><span class="discover-song-copy"><strong>{{ track.title }}</strong><small>{{ track.artists.map(artist => artist.name).join(' / ') }}</small></span></div>
        <span class="discover-album">{{ track.album?.name || '—' }}</span>
        <span class="discover-duration">{{ formatTrackDuration(track.durationMs) }}</span>
        <div class="discover-actions"><IconButton icon="play" :label="`播放 ${track.title}`" variant="row-play" @click="emit('play', track, results)" /><TrackAddMenu :track="track" :playlists="playlists" :liked-ids="likedIds" :queue-ids="queueIds" :open="activeTrackId === track.id" @toggle="toggleMenu(track)" @close="activeTrackId = null" @append="emit('append', $event)" @liked="emit('liked', $event)" @playlist-created="emit('playlist-created', $event)" @playlist-updated="emit('playlist-updated', $event)" /></div>
      </article>
    <button v-if="canLoadMore" class="load-more" :disabled="loading" @click="search(false)">{{ loading ? '正在加载…' : '加载更多' }}</button>
      <p v-if="total !== null" class="search-total">共找到 {{ total }} 首相关歌曲</p>
    </div>
    <div v-else-if="loading" class="empty">正在搜索…</div>
    <div v-else-if="query.trim()" class="empty">没有找到相关歌曲</div>
    <div v-else class="discover-empty"><AppIcon name="search" /><span>输入歌曲、歌手或专辑名称开始搜索</span></div>
  </section>
</template>
