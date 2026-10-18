<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createLoginQR, endSession, loadAccountProfile, loadLyrics, loadPlaylists, loadPlaylistTracks, loadSession, pollLoginQR, resolveStream } from "./api.js";
import AppIcon from "./components/AppIcon.vue";
import IconButton from "./components/IconButton.vue";
import PlayerBar from "./components/PlayerBar.vue";
import { registerMediaSessionActions } from "./mediaSession.js";
import { isUnplayableTrack, loadTrackStream, unplayableLabel } from "./playbackFailure.js";
import { formatTrackDuration } from "./trackPresentation.js";
import { applyThemePreferences, loadThemePreferences, saveThemePreferences } from "./themePreferences.js";
import { loadVolumePreferences, saveVolumePreferences, toggleMuteVolume } from "./volumePreferences.js";
import QueuePanel from "./components/QueuePanel.vue";
import { parseLyrics } from "./lyrics.js";
import { useQueue } from "./stores/queue.js";
import { normalizePath, resolvePath } from "./navigation.js";

const queue = useQueue();
const audio = ref();
const mainView = ref();
const tracks = ref([]);
const unplayableTrackReasons = ref(new Map());
const playlists = ref([]);
const selectedPlaylist = ref(null);
const filter = ref("");
const loading = ref(true);
const error = ref("");
const showQueue = ref(false);
const playing = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const savedVolumePreferences = loadVolumePreferences();
const volume = ref(savedVolumePreferences.volume);
const lastAudibleVolume = ref(savedVolumePreferences.lastAudibleVolume);
const savedThemePreferences = loadThemePreferences();
const theme = ref(savedThemePreferences.theme);
const appearanceMode = ref(savedThemePreferences.mode);
const appearanceOptions = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];
const systemColorScheme = window.matchMedia("(prefers-color-scheme: dark)");
const lyricLines = ref([]);
const showLyrics = ref(false);
const lyricsScroll = ref();
const session = ref(null);
const routePath = ref(normalizePath(window.location.pathname));
const accountProfile = ref(null);
const qr = ref(null);
const loginStatus = ref("idle");
const loginProvider = ref("qq");
const showAccountMenu = ref(false);
const showThemeMenu = ref(false);
const loggingOut = ref(false);
const showScrollTop = ref(false);
const showJumpToCurrent = ref(false);
const trackElements = new Map();
const lyricElements = new Map();
let loginTimer;
let lyricsResumeTimer;
let lyricsFollowPaused = false;
let loginPolling = false;
let playbackRequest = 0;
let removeMediaSessionActions = () => {};

function navigate(path, replace = false) {
  const nextPath = normalizePath(path);
  if (window.location.pathname !== nextPath) window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
  routePath.value = nextPath;
}

function openProfile() {
  showAccountMenu.value = false;
  navigate("/profile");
  void refreshAccountProfile();
}

function handleRouteChange() {
  const nextPath = resolvePath(window.location.pathname, Boolean(session.value));
  if (nextPath !== window.location.pathname) window.history.replaceState({}, "", nextPath);
  routePath.value = nextPath;
  if (nextPath === "/profile" && session.value) void refreshAccountProfile();
}

async function refreshAccountProfile() {
  try { accountProfile.value = await loadAccountProfile(); }
  catch (reason) {
    if (reason.status === 401 || reason.code === 1000) {
      session.value = null;
      accountProfile.value = null;
      error.value = "QQ 音乐已拒绝此登录会话，请重新扫码登录";
      navigate("/login", true);
    } else error.value = reason.message || "账号资料加载失败";
  }
}

const visibleTracks = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  return needle ? tracks.value.filter((track) => [track.title, track.album?.name, ...track.artists.map((artist) => artist.name)].some((value) => value?.toLowerCase().includes(needle))) : tracks.value;
});
const activeLyric = computed(() => {
  let active = -1;
  for (let index = 0; index < lyricLines.value.length; index++) if (lyricLines.value[index].at <= currentTime.value * 1000) active = index;
  return active;
});

watch(() => queue.current, (track) => {
  const artist = track?.artists?.map((item) => item.name).filter(Boolean).join(" / ");
  document.title = track?.title
    ? `Melofy - ${track.title}${artist ? `-${artist}` : ""}`
    : "Melofy";
  const mediaSession = navigator.mediaSession;
  if (mediaSession && typeof MediaMetadata === "function") {
    mediaSession.metadata = track ? new MediaMetadata({
      title: track.title,
      artist: artist || "",
      album: track.album?.name || "",
      artwork: track.album?.coverUrl ? [{ src: track.album.coverUrl }] : [],
    }) : null;
  }
}, { immediate: true });

watch(playing, (isPlaying) => {
  if (navigator.mediaSession) navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
});

watch([theme, appearanceMode], ([selectedTheme, selectedMode]) => {
  const preferences = { theme: selectedTheme, mode: selectedMode };
  applyThemePreferences(document.documentElement, preferences, systemColorScheme.matches);
  saveThemePreferences(preferences);
}, { immediate: true });

function updateSystemColorScheme() {
  if (appearanceMode.value === "system") {
    applyThemePreferences(document.documentElement, { theme: theme.value, mode: appearanceMode.value }, systemColorScheme.matches);
  }
}

function setTrackElement(trackId, element) {
  if (element) trackElements.set(trackId, element);
  else trackElements.delete(trackId);
}

function setLyricElement(index, element) {
  if (element) lyricElements.set(index, element);
  else lyricElements.delete(index);
}

function scrollToActiveLyric(behavior = "smooth") {
  const container = lyricsScroll.value;
  const line = lyricElements.get(activeLyric.value);
  if (!container || !line) return;
  const viewport = container.getBoundingClientRect();
  const bounds = line.getBoundingClientRect();
  const top = container.scrollTop + bounds.top - viewport.top - (container.clientHeight - bounds.height) / 2;
  container.scrollTo({ top, behavior });
}

function pauseLyricsFollow() {
  if (!showLyrics.value) return;
  lyricsFollowPaused = true;
  clearTimeout(lyricsResumeTimer);
  lyricsResumeTimer = setTimeout(() => {
    lyricsFollowPaused = false;
    nextTick(() => scrollToActiveLyric());
  }, 10_000);
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape" || (!showLyrics.value && !showQueue.value)) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
  if (showQueue.value) showQueue.value = false;
  else showLyrics.value = false;
}

function updateShortcutVisibility() {
  const mainElement = mainView.value;
  if (!mainElement) return;
  showScrollTop.value = mainElement.scrollTop > 180;
  const currentId = queue.currentId;
  if (!currentId || !tracks.value.some((track) => track.id === currentId)) {
    showJumpToCurrent.value = false;
    return;
  }
  if (!visibleTracks.value.some((track) => track.id === currentId)) {
    showJumpToCurrent.value = true;
    return;
  }
  const row = trackElements.get(currentId);
  if (!row) {
    showJumpToCurrent.value = true;
    return;
  }
  const viewport = mainElement.getBoundingClientRect();
  const bounds = row.getBoundingClientRect();
  const visible = bounds.bottom > viewport.top + 72 && bounds.top < viewport.bottom - 8;
  showJumpToCurrent.value = !visible;
}

function scrollToTop() {
  mainView.value?.scrollTo({ top: 0, behavior: "smooth" });
}

async function jumpToCurrentTrack() {
  const currentId = queue.currentId;
  if (!currentId || !tracks.value.some((track) => track.id === currentId)) return;
  if (!visibleTracks.value.some((track) => track.id === currentId)) filter.value = "";
  await nextTick();
  const mainElement = mainView.value;
  const row = trackElements.get(currentId);
  if (!mainElement || !row) return;
  const viewport = mainElement.getBoundingClientRect();
  const bounds = row.getBoundingClientRect();
  const top = mainElement.scrollTop + bounds.top - viewport.top - (mainElement.clientHeight - bounds.height) / 2;
  mainElement.scrollTo({ top, behavior: "smooth" });
}

async function play(track, context = visibleTracks.value) {
  queue.playNow(track, context);
  await loadCurrent(track);
}

async function loadCurrent(track) {
  const request = ++playbackRequest;
  lyricLines.value = [];
  loadLyrics(track.id).then((result) => {
    if (request === playbackRequest && queue.current?.id === track.id) lyricLines.value = parseLyrics(result.lyric, result.translation);
  }).catch(() => {});
  try {
    error.value = "";
    const loaded = await loadTrackStream(track, {
      resolve: (trackId) => resolveStream(trackId, queue.quality),
      setSource: (url) => { if (request === playbackRequest && queue.current?.id === track.id) audio.value.src = url; },
      markUnplayable: (trackId, reason) => {
        if (request === playbackRequest && queue.current?.id === track.id) markTrackUnplayable(trackId, reason);
      },
      skip: async () => {
        if (request !== playbackRequest || queue.current?.id !== track.id) return;
        await advance(1, "unplayable");
      },
    });
    if (request !== playbackRequest || queue.current?.id !== track.id || !loaded) return;
    await audio.value.play();
  } catch (reason) {
    if (request === playbackRequest) {
      audio.value?.pause();
      error.value = reason.message || "播放失败";
    }
  }
}

function markTrackUnplayable(trackId, reason) {
  unplayableTrackReasons.value = new Map(unplayableTrackReasons.value).set(trackId, reason);
}

function isTrackUnplayable(track) {
  return unplayableTrackReasons.value.has(track.id) || isUnplayableTrack(track);
}

function trackUnplayableLabel(track) {
  return unplayableLabel(unplayableTrackReasons.value.get(track.id) || (track.playable === false ? "unavailable" : null));
}

async function advance(delta, reason = "manual") {
  const next = queue.advance(delta, reason);
  if (next) await loadCurrent(next);
  else if (delta > 0) { audio.value?.pause(); playing.value = false; }
}
async function ended() {
  if (queue.mode === "repeat-one" && queue.current) {
    audio.value.currentTime = 0;
    await audio.value.play();
    return;
  }
  await advance(1, "ended");
}
async function toggle() {
  if (!audio.value) return;
  try {
    if (!queue.current && tracks.value[0]) return await play(tracks.value[0]);
    if (!audio.value.src && queue.current) return await loadCurrent(queue.current);
    if (audio.value.paused) await audio.value.play(); else audio.value.pause();
  } catch (reason) { error.value = reason.message || "播放失败"; }
}
function clearQueue() { playbackRequest++; audio.value?.pause(); audio.value?.removeAttribute("src"); currentTime.value = 0; duration.value = 0; queue.clear(); }
async function removeFromQueue(index) {
  const wasCurrent = queue.remove(index);
  if (!wasCurrent) return;
  if (queue.current) await loadCurrent(queue.current); else clearQueue();
}
async function playQueueTrack(track) { queue.select(track.id); await loadCurrent(track); }
function seek(value) { if (audio.value) audio.value.currentTime = value; currentTime.value = value; }
function setVolume(value) {
  volume.value = Math.min(1, Math.max(0, value));
  if (volume.value > 0) lastAudibleVolume.value = volume.value;
  if (audio.value) audio.value.volume = volume.value;
  saveVolumePreferences(volume.value, lastAudibleVolume.value);
}
function toggleMute() { setVolume(toggleMuteVolume(volume.value, lastAudibleVolume.value)); }
async function setQuality(value) { queue.setQuality(value); if (queue.current) await loadCurrent(queue.current); }
function cyclePlaybackMode() {
  queue.cycleMode(tracks.value);
  if (queue.mode === "shuffle") showQueue.value = true;
}

async function loadLibrary() {
  loading.value = true;
  try {
    playlists.value = await loadPlaylists();
    const preferred = playlists.value.find((playlist) => playlist.kind === "liked") || playlists.value[0];
    if (preferred) await selectPlaylist(preferred);
    session.value = await loadSession();
    return true;
  }
  catch (reason) {
    error.value = reason.message || "歌单加载失败";
    if (reason.status === 401 || reason.code === 1000) {
      session.value = null;
      accountProfile.value = null;
      navigate("/login", true);
    }
    return false;
  }
  finally { loading.value = false; }
}

async function selectPlaylist(playlist) {
  selectedPlaylist.value = playlist;
  filter.value = "";
  loading.value = true;
  try {
    tracks.value = await loadPlaylistTracks(playlist);
    unplayableTrackReasons.value = new Map(tracks.value.filter((track) => track.playable === false).map((track) => [track.id, "unavailable"]));
  }
  catch (reason) { error.value = reason.message || "歌单加载失败"; tracks.value = []; }
  finally { loading.value = false; }
}

async function beginLogin() {
  try {
    error.value = "";
    clearInterval(loginTimer);
    qr.value = null;
    loginStatus.value = "loading";
    qr.value = { ...await createLoginQR(loginProvider.value), provider: loginProvider.value };
    loginStatus.value = "waiting";
    loginTimer = setInterval(checkLogin, 2_000);
  } catch (reason) { loginStatus.value = "error"; error.value = reason.message || "二维码创建失败"; }
}

function selectLoginProvider(provider) {
  if (loginProvider.value === provider) return;
  loginProvider.value = provider;
  clearInterval(loginTimer);
  qr.value = null;
  loginStatus.value = "idle";
  error.value = "";
}

async function checkLogin() {
  if (!qr.value || loginPolling) return;
  const pollingId = qr.value.id;
  loginPolling = true;
  try {
    const result = await pollLoginQR(qr.value.provider || loginProvider.value, pollingId);
    if (qr.value?.id !== pollingId) return;
    loginStatus.value = result.status;
    if (result.status === "complete") {
      clearInterval(loginTimer);
      session.value = await loadSession();
      qr.value = null;
      if (session.value && await loadLibrary()) navigate("/", true);
    } else if (["expired", "refused"].includes(result.status)) clearInterval(loginTimer);
  } catch (reason) { clearInterval(loginTimer); loginStatus.value = "error"; error.value = reason.message || "登录状态检查失败"; }
  finally { loginPolling = false; }
}

async function logout() {
  loggingOut.value = true;
  error.value = "";
  try {
    await endSession();
    playbackRequest++;
    clearInterval(loginTimer);
    audio.value?.pause();
    audio.value?.removeAttribute("src");
    audio.value?.load();
    queue.clear();
    tracks.value = [];
    playlists.value = [];
    selectedPlaylist.value = null;
    filter.value = "";
    lyricLines.value = [];
    currentTime.value = 0;
    duration.value = 0;
    playing.value = false;
    showQueue.value = false;
    showLyrics.value = false;
    qr.value = null;
    loginStatus.value = "idle";
    session.value = null;
    accountProfile.value = null;
    navigate("/login", true);
  } catch (reason) {
    error.value = reason.message || "退出登录失败";
  } finally {
    loggingOut.value = false;
  }
}

onMounted(async () => {
  window.addEventListener("resize", updateShortcutVisibility);
  window.addEventListener("popstate", handleRouteChange);
  window.addEventListener("keydown", handleGlobalKeydown);
  systemColorScheme.addEventListener("change", updateSystemColorScheme);
  removeMediaSessionActions = registerMediaSessionActions(navigator.mediaSession, {
    play: toggle,
    pause: () => audio.value?.pause(),
    previous: () => advance(-1),
    next: () => advance(1),
  });
  if (audio.value) audio.value.volume = volume.value;
  try {
    session.value = await loadSession();
    const resolved = resolvePath(window.location.pathname, Boolean(session.value));
    navigate(resolved, true);
    if (session.value && await loadLibrary()) {
      if (routePath.value === "/profile") await refreshAccountProfile();
      else if (routePath.value === "/login") navigate("/", true);
    } else {
      loading.value = false;
      if (!session.value) navigate("/login", true);
    }
  }
  catch (reason) { loading.value = false; error.value = reason.message || "登录状态加载失败"; }
});
watch([() => queue.currentId, () => filter.value, () => tracks.value], () => nextTick(updateShortcutVisibility));
watch([activeLyric, showLyrics], async ([, isVisible]) => {
  if (!isVisible) {
    clearTimeout(lyricsResumeTimer);
    lyricsFollowPaused = false;
    return;
  }
  if (lyricsFollowPaused) return;
  await nextTick();
  scrollToActiveLyric();
});
onBeforeUnmount(() => {
  clearInterval(loginTimer);
  clearTimeout(lyricsResumeTimer);
  removeMediaSessionActions();
  window.removeEventListener("resize", updateShortcutVisibility);
  window.removeEventListener("popstate", handleRouteChange);
  window.removeEventListener("keydown", handleGlobalKeydown);
  systemColorScheme.removeEventListener("change", updateSystemColorScheme);
});
</script>

<template>
  <div v-if="routePath === '/login' || !session" class="login-screen">
      <div class="login-card">
        <div class="brand"><span><img src="/melofy-icon.svg" alt="" /></span> Melofy</div>
        <p class="eyebrow">YOUR MUSIC, YOUR WAY</p>
        <h1>登录 QQ 音乐</h1>
        <p class="login-description">选择 QQ 或微信扫码登录。登录信息将安全保存在这台电脑上。</p>
        <div class="login-methods" role="tablist" aria-label="登录方式">
          <button type="button" role="tab" :aria-selected="loginProvider === 'qq'" :class="{ active: loginProvider === 'qq' }" @click="selectLoginProvider('qq')">QQ 扫码</button>
          <button type="button" role="tab" :aria-selected="loginProvider === 'wechat'" :class="{ active: loginProvider === 'wechat' }" @click="selectLoginProvider('wechat')">微信扫码</button>
        </div>
        <div class="qr-stage" :class="{ 'qr-stage--ready': qr }">
          <img v-if="qr" :src="qr.imageDataUrl" :alt="`${loginProvider === 'wechat' ? '微信' : 'QQ'}登录二维码`">
          <div v-else-if="loginStatus === 'loading'" class="qr-placeholder qr-loading"><span></span><small>正在获取安全二维码…</small></div>
          <div v-else class="qr-placeholder"><div class="qr-decoration"><i></i><i></i><i></i><i></i><span>{{ loginProvider === 'wechat' ? '微' : 'Q' }}</span></div><small>点击下方按钮获取二维码</small></div>
        </div>
        <p v-if="loginStatus === 'scanned'" class="login-state"><span class="status-dot"></span>已扫码，请在{{ loginProvider === 'wechat' ? '微信' : '手机 QQ' }}上确认登录</p>
        <p v-else-if="loginStatus === 'expired'" class="login-state login-state--warning">二维码已过期，请重新获取</p>
        <p v-else-if="loginStatus === 'refused'" class="login-state login-state--warning">登录已取消，可以重新扫码</p>
        <p v-else-if="loginStatus === 'waiting'" class="login-state"><span class="status-dot status-dot--pulse"></span>等待{{ loginProvider === 'wechat' ? '微信' : '手机 QQ' }}扫码</p>
        <p v-else-if="loginStatus === 'complete'" class="login-state">登录成功，正在载入歌单…</p>
        <IconButton class="login-action" icon="refresh" :label="loginStatus === 'loading' ? '正在获取二维码' : qr ? '刷新二维码' : `获取${loginProvider === 'wechat' ? '微信' : 'QQ'}登录二维码`" variant="primary" :disabled="loginStatus === 'loading'" with-label @click="beginLogin" />
        <p class="login-privacy"><AppIcon name="account" />登录凭据仅保存在本机，不会发送给浏览器</p>
        <p v-if="error" class="login-error">{{ error }}</p>
      </div>
  </div>
  <section v-else-if="routePath === '/profile'" class="profile-screen">
    <div class="profile-card">
      <button class="profile-back" type="button" @click="navigate('/')">← 返回播放器</button>
      <div class="brand"><span><img src="/melofy-icon.svg" alt="" /></span> Melofy</div>
      <p class="eyebrow">ACCOUNT PROFILE</p>
      <img v-if="accountProfile?.avatarUrl || session.avatarUrl" class="profile-avatar" :src="accountProfile?.avatarUrl || session.avatarUrl" alt="账号头像" />
      <div v-else class="profile-avatar profile-avatar--empty"><AppIcon name="account" /></div>
      <h1>{{ accountProfile?.displayName || 'QQ 音乐账号' }}</h1>
      <p class="profile-account-id">账号：{{ accountProfile?.accountId || session.accountId }}</p>
      <p v-if="error" class="login-error">{{ error }}</p>
      <button class="account-action profile-logout" :disabled="loggingOut" @click="logout"><AppIcon name="logout" /><span>{{ loggingOut ? '正在退出…' : '退出登录' }}</span></button>
    </div>
  </section>
  <div v-else class="shell" @click="showAccountMenu = false; showThemeMenu = false">
    <aside class="sidebar">
      <div class="brand"><span><img src="/melofy-icon.svg" alt="" /></span> Melofy</div>
      <div class="sidebar-scroll">
        <button v-for="playlist in playlists.filter(p => p.kind === 'liked')" :key="`liked-${playlist.id}`" class="nav" :class="{ active: selectedPlaylist?.id === playlist.id && selectedPlaylist?.kind === playlist.kind }" @click="selectPlaylist(playlist)"><AppIcon class="nav-icon" name="heart" /><span class="nav-title">{{ playlist.title }}</span></button>
        <div class="section-label">我的歌单</div>
        <button v-for="playlist in playlists.filter(p => p.kind !== 'liked')" :key="`${playlist.kind}-${playlist.id}`" class="nav playlist-nav" :class="{ active: selectedPlaylist?.id === playlist.id && selectedPlaylist?.kind === playlist.kind }" @click="selectPlaylist(playlist)"><AppIcon class="nav-icon" name="collection" /><span class="nav-title">{{ playlist.title }}</span></button>
      </div>
    </aside>
    <main ref="mainView" @scroll="updateShortcutVisibility">
      <header class="topbar"><label class="search-box"><AppIcon name="search" /><input v-model="filter" placeholder="在当前歌单中搜索"></label><div class="topbar-actions"><div class="theme-menu-wrap"><button class="icon-button" :class="{ active: showThemeMenu }" type="button" aria-label="外观设置" :aria-expanded="showThemeMenu" @click.stop="showThemeMenu = !showThemeMenu; showAccountMenu = false"><AppIcon name="settings" /></button><div v-if="showThemeMenu" class="account-dropdown theme-dropdown" @click.stop><strong class="menu-title">外观设置</strong><label class="account-setting"><span>色彩主题</span><select v-model="theme" aria-label="色彩主题"><option value="pink">柔粉</option><option value="orange">暖橙</option><option value="green">清绿</option><option value="blue">清蓝</option></select></label><div class="appearance-setting" role="group" aria-label="外观模式" :style="{ '--appearance-index': appearanceOptions.findIndex(option => option.value === appearanceMode) }"><span class="appearance-slider" aria-hidden="true"></span><button v-for="option in appearanceOptions" :key="option.value" type="button" :class="{ active: appearanceMode === option.value }" :aria-pressed="appearanceMode === option.value" @click="appearanceMode = option.value">{{ option.label }}</button></div></div></div><div class="account-menu-wrap"><button class="account-trigger icon-button" :class="{ active: showAccountMenu }" type="button" :aria-label="showAccountMenu ? '关闭账号菜单' : '打开账号菜单'" :aria-expanded="showAccountMenu" @click.stop="showAccountMenu = !showAccountMenu; showThemeMenu = false"><img v-if="session?.avatarUrl" :src="session.avatarUrl" alt="" /><AppIcon v-else name="account" /></button><div v-if="showAccountMenu" class="account-dropdown" @click.stop><div class="account-summary"><img v-if="session?.avatarUrl" class="account-avatar" :src="session.avatarUrl" alt="" /><span v-else class="account-avatar">Q</span><span><strong>QQ 音乐账号</strong><small>{{ session?.accountId || '本机已登录' }}</small></span></div><button class="account-action" @click="openProfile"><AppIcon name="account" /><span>账号资料</span></button><button class="account-action" :disabled="loggingOut" @click="logout"><AppIcon name="logout" /><span>{{ loggingOut ? '正在退出…' : '退出登录' }}</span></button></div></div></div></header>
      <section class="hero"><div class="cover" :style="selectedPlaylist?.coverUrl ? { backgroundImage: `url(${selectedPlaylist.coverUrl})` } : {}">{{ selectedPlaylist?.coverUrl ? '' : selectedPlaylist?.kind === 'liked' ? '♥' : '♫' }}</div><div class="hero-copy"><p class="eyebrow">{{ selectedPlaylist?.kind === 'collected' ? 'COLLECTED PLAYLIST' : selectedPlaylist?.kind === 'liked' ? 'YOUR FAVORITES' : 'YOUR PLAYLIST' }}</p><h1>{{ selectedPlaylist?.title || 'Melofy' }}</h1><p>{{ tracks.length }} 首歌曲 · 已从 QQ 音乐完整分页加载</p></div></section>
      <p v-if="error" class="error">{{ error }}</p>
      <section class="list">
        <div class="list-head"><span>#</span><span>歌曲</span><span>专辑</span><span>时长</span><span>操作</span></div>
        <p v-if="loading" class="empty">正在加载歌单…</p>
        <div v-for="(track, index) in visibleTracks" :key="track.id" :ref="(element) => setTrackElement(track.id, element)" class="track" :class="{ 'is-current': track.id === queue.currentId, 'is-unplayable': isTrackUnplayable(track) }" @dblclick="play(track)">
          <span class="track-index"><span v-if="track.id === queue.currentId" class="playing-meter" :class="{ paused: !playing }" aria-label="当前播放"><i></i><i></i><i></i></span><template v-else>{{ index + 1 }}</template></span><span class="song-cell"><strong>{{ track.title }}<span v-if="isTrackUnplayable(track)" class="unplayable-badge">{{ trackUnplayableLabel(track) }}</span></strong><small>{{ track.artists.map(a => a.name).join(' / ') }}</small></span><span class="album-cell">{{ track.album?.name || '—' }}</span><span class="duration-cell">{{ formatTrackDuration(track.durationMs) }}</span>
          <span class="actions"><IconButton icon="play" :label="`播放 ${track.title}`" variant="row-play" @click="play(track)" /><IconButton icon="forward" :label="`${track.title} 下一首播放`" @click="queue.playNext(track)" /><IconButton icon="add" :label="`${track.title} 加入队列`" @click="queue.append(track)" /></span>
        </div>
      </section>
      <div class="list-shortcuts">
        <IconButton v-if="showJumpToCurrent" icon="locate" label="跳转到正在播放的歌曲" @click="jumpToCurrentTrack" />
        <IconButton v-if="showScrollTop" icon="top" label="回到列表顶部" @click="scrollToTop" />
      </div>
    </main>
    <PlayerBar :track="queue.current" :playing="playing" :current-time="currentTime" :duration="duration" :volume="volume" :mode="queue.mode" :quality="queue.quality" :queue-count="queue.items.length" :queue-open="showQueue" @toggle="toggle" @previous="advance(-1)" @next="advance(1)" @seek="seek" @volume="setVolume" @mute="toggleMute" @mode="cyclePlaybackMode" @quality="setQuality" @queue="showQueue = !showQueue" @lyrics="showLyrics = !showLyrics" />
    <audio ref="audio" @play="playing = true" @pause="playing = false" @timeupdate="currentTime = $event.currentTarget.currentTime" @durationchange="duration = Number.isFinite($event.currentTarget.duration) ? $event.currentTarget.duration : 0" @ended="ended" />
    <QueuePanel v-if="showQueue" :items="queue.items" :current-id="queue.currentId" :mode="queue.mode" @play="playQueueTrack" @move="queue.move" @remove="removeFromQueue" @clear="clearQueue" @close="showQueue = false" />
    <section v-if="showLyrics" class="lyrics-panel"><IconButton class="lyrics-close" icon="close" label="关闭歌词" @click="showLyrics = false" /><div class="lyrics-artwork-wrap"><img v-if="queue.current?.album?.coverUrl" class="lyrics-artwork" :src="queue.current.album.coverUrl" :alt="`${queue.current.album.name || queue.current.title} 专辑封面`"><div v-else class="lyrics-artwork lyrics-artwork--empty"><AppIcon name="music" /></div><div class="lyrics-artwork-meta"><strong>{{ queue.current?.album?.name || queue.current?.title || '歌词' }}</strong><span>{{ queue.current?.title }}</span><small>{{ queue.current?.artists?.map((artist) => artist.name).join(' / ') }}</small></div></div><div class="lyrics-content"><p class="eyebrow">NOW PLAYING</p><h2>{{ queue.current?.title || '歌词' }}</h2><div ref="lyricsScroll" class="lyrics-scroll" tabindex="0" aria-label="歌词" @wheel.passive="pauseLyricsFollow" @touchstart.passive="pauseLyricsFollow" @pointerdown="pauseLyricsFollow" @keydown="pauseLyricsFollow"><p v-if="!lyricLines.length" class="muted">暂无歌词</p><p v-for="(line, index) in lyricLines" :key="`${line.at}-${index}`" :ref="(element) => setLyricElement(index, element)" :class="{ active: index === activeLyric }">{{ line.text }}<small v-if="line.translation">{{ line.translation }}</small></p></div></div></section>
  </div>
</template>
