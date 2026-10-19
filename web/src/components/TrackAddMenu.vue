<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { addTrackToPlaylist, createPlaylist, getTrackPlaylistMembership } from "../api.js";
import { addablePlaylists, calculateAddMenuPosition, isPlaylistDestinationUnavailable } from "../addMenu.js";
import AppIcon from "./AppIcon.vue";
import IconButton from "./IconButton.vue";

const props = defineProps({
  track: { type: Object, required: true },
  playlists: { type: Array, default: () => [] },
  likedIds: { type: Set, default: () => new Set() },
  queueIds: { type: Set, default: () => new Set() },
  open: { type: Boolean, default: false },
});
const emit = defineEmits(["toggle", "close", "append", "liked", "playlist-created", "playlist-updated"]);
const memberships = ref(new Set());
const membershipLoading = ref(false);
const adding = ref(false);
const creating = ref(false);
const playlistName = ref("");
const error = ref("");
const success = ref("");
const controlElement = ref();
const menuElement = ref();
const menuPosition = ref({ left: 8, top: 72, width: 258, maxHeight: 440 });
const writablePlaylists = computed(() => addablePlaylists(props.playlists));

function updateMenuPosition() {
  if (!props.open || !controlElement.value || !menuElement.value) return;
  const trigger = controlElement.value.querySelector(".icon-button")?.getBoundingClientRect();
  const main = controlElement.value.closest("main");
  if (!trigger || !main) return;
  const mainBounds = main.getBoundingClientRect();
  const playerBounds = document.querySelector(".player-bar")?.getBoundingClientRect();
  const safeTop = Math.max(mainBounds.top + 72, 8);
  const safeBottom = Math.min(mainBounds.bottom, playerBounds?.top ?? window.innerHeight) - 8;
  menuPosition.value = calculateAddMenuPosition(
    { left: trigger.left, top: trigger.top, height: trigger.height },
    { width: 258, height: menuElement.value.scrollHeight },
    { width: window.innerWidth, height: window.innerHeight },
    safeTop,
    safeBottom,
  );
}

function scheduleMenuPosition() {
  void nextTick(() => requestAnimationFrame(updateMenuPosition));
}

watch(() => props.open, async (open) => {
  if (!open) {
    window.removeEventListener("resize", scheduleMenuPosition);
    window.removeEventListener("scroll", scheduleMenuPosition, true);
    return;
  }
  window.addEventListener("resize", scheduleMenuPosition);
  window.addEventListener("scroll", scheduleMenuPosition, true);
  await nextTick();
  updateMenuPosition();
}, { immediate: true });

watch([membershipLoading, adding, creating, success, error, writablePlaylists], scheduleMenuPosition);
onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleMenuPosition);
  window.removeEventListener("scroll", scheduleMenuPosition, true);
});

watch(() => props.open, async (open) => {
  if (!open) return;
  error.value = "";
  success.value = "";
  creating.value = false;
  playlistName.value = "";
  membershipLoading.value = true;
  try { memberships.value = new Set(await getTrackPlaylistMembership(props.track.id)); }
  catch { memberships.value = new Set(); }
  finally { membershipLoading.value = false; }
}, { immediate: true });

function hasTrack(playlist) {
  return memberships.value.has(playlist.id);
}

function isUnavailable(playlist) {
  return isPlaylistDestinationUnavailable(playlist, memberships.value, membershipLoading.value, adding.value);
}

async function addToPlaylist(playlist) {
  if (!playlist || adding.value || hasTrack(playlist)) return;
  adding.value = true;
  error.value = "";
  try {
    await addTrackToPlaylist(props.track.id, playlist.id);
    memberships.value = new Set([...memberships.value, playlist.id]);
    emit("playlist-updated", { playlist, track: props.track });
    if (playlist.kind === "liked") emit("liked", props.track);
    success.value = `已添加到「${playlist.title}」`;
  } catch (reason) { error.value = reason.message || "添加歌曲失败"; }
  finally { adding.value = false; }
}

async function createAndAdd() {
  const name = playlistName.value.trim();
  if (!name || creating.value || adding.value) return;
  creating.value = true;
  error.value = "";
  success.value = "";
  try {
    const playlist = await createPlaylist(name);
    emit("playlist-created", playlist);
    await addTrackToPlaylist(props.track.id, playlist.id);
    memberships.value = new Set([...memberships.value, playlist.id]);
    emit("playlist-updated", { playlist, track: props.track });
    success.value = `已添加到「${playlist.title}」`;
  } catch (reason) { error.value = reason.message || "创建歌单或添加歌曲失败"; }
  finally { creating.value = false; }
}

function appendToQueue() {
  emit("append", props.track);
  emit("close");
}
</script>

<template>
  <div ref="controlElement" class="track-add-control">
    <IconButton icon="add" :label="`添加 ${track.title}`" :active="open" @click="emit('toggle')" />
    <div v-if="open" ref="menuElement" class="add-menu" :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px`, width: `${menuPosition.width}px`, maxHeight: `${menuPosition.maxHeight}px` }" @pointerdown.stop @click.stop>
      <p v-if="error" class="add-menu-error" role="alert">添加失败：{{ error }}</p>
      <p class="add-menu-title">添加到</p>
      <button type="button" class="add-menu-item" :class="{ unavailable: likedIds.has(track.id) || !playlists.some(playlist => playlist.kind === 'liked') }" :disabled="likedIds.has(track.id) || !playlists.some(playlist => playlist.kind === 'liked') || adding" @click="addToPlaylist(playlists.find(playlist => playlist.kind === 'liked'))"><AppIcon name="heart" /><span>我喜欢</span><small>{{ likedIds.has(track.id) ? '已添加' : playlists.some(playlist => playlist.kind === 'liked') ? '收藏' : '不可用' }}</small></button>
      <button type="button" class="add-menu-item" :class="{ unavailable: queueIds.has(track.id) }" :disabled="queueIds.has(track.id)" @click="appendToQueue"><AppIcon name="queue" /><span>当前播放队列</span><small>{{ queueIds.has(track.id) ? '已在队列' : '添加' }}</small></button>
      <button type="button" class="add-menu-item" @click="creating = !creating"><AppIcon name="add" /><span>新建歌单</span><small>创建并添加</small></button>
      <form v-if="creating" class="create-playlist-form" @submit.prevent="createAndAdd"><input v-model="playlistName" aria-label="新歌单名称" maxlength="40" placeholder="输入歌单名称"><button type="submit" :disabled="!playlistName.trim() || creating">{{ creating ? '创建中…' : '创建' }}</button></form>
      <div class="add-menu-divider"></div>
      <p class="add-menu-subtitle">我的歌单</p>
      <button v-for="playlist in writablePlaylists.filter(item => item.kind !== 'liked')" :key="playlist.id" type="button" class="add-menu-item" :class="{ unavailable: isUnavailable(playlist) }" :disabled="isUnavailable(playlist)" @click="addToPlaylist(playlist)"><AppIcon name="collection" /><span>{{ playlist.title }}</span><small>{{ adding ? '添加中…' : membershipLoading ? '检查中…' : hasTrack(playlist) ? '已添加' : '添加' }}</small></button>
      <p v-if="membershipLoading" class="membership-note">正在检查歌单内是否已有这首歌…</p>
      <p v-if="success" class="add-menu-success" role="status">{{ success }}</p>
    </div>
  </div>
</template>
