import { defineStore } from "pinia";

export const playbackModes = ["sequence", "repeat-list", "repeat-one", "shuffle"];
const storageKey = "qqmusic-web.playback.v2";

function loadState() {
  const fallback = { items: [], currentId: null, mode: "sequence", playNextIds: [], shuffleHistory: [], shuffleCursor: -1, quality: "high" };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!value || !Array.isArray(value.items) || !playbackModes.includes(value.mode)) return fallback;
    const ids = new Set(value.items.map((item) => item?.id).filter(Boolean));
    return {
      items: value.items,
      currentId: ids.has(value.currentId) ? value.currentId : null,
      mode: value.mode,
      playNextIds: Array.isArray(value.playNextIds) ? value.playNextIds.filter((id) => ids.has(id)) : [],
      shuffleHistory: Array.isArray(value.shuffleHistory) ? value.shuffleHistory.filter((id) => ids.has(id)) : [],
      shuffleCursor: Number.isInteger(value.shuffleCursor) ? value.shuffleCursor : -1,
      quality: ["standard", "high", "lossless", "hires"].includes(value.quality) ? value.quality : "high",
    };
  } catch { return fallback; }
}

function persist(state) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify({
    items: state.items,
    currentId: state.currentId,
    mode: state.mode,
    playNextIds: state.playNextIds,
    shuffleHistory: state.shuffleHistory,
    shuffleCursor: state.shuffleCursor,
    quality: state.quality,
  }));
}

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export const useQueue = defineStore("queue", {
  state: loadState,
  getters: {
    currentIndex: (state) => state.items.findIndex((item) => item.id === state.currentId),
    current: (state) => state.items.find((item) => item.id === state.currentId) || null,
  },
  actions: {
    save() { persist(this); },
    playNow(track, context = []) {
      const unique = new Map((context.length ? context : [track, ...this.items]).map((item) => [item.id, item]));
      if (!unique.has(track.id)) unique.set(track.id, track);
      this.items = [...unique.values()];
      this.currentId = track.id;
      this.playNextIds = [];
      this.shuffleHistory = [track.id];
      this.shuffleCursor = 0;
      this.save();
    },
    playNext(track) {
      if (!this.currentId) { this.playNow(track, [track, ...this.items]); return; }
      if (track.id === this.currentId) return;
      const existing = this.items.find((item) => item.id === track.id);
      this.items = this.items.filter((item) => item.id !== track.id || item.id === this.currentId);
      this.playNextIds = this.playNextIds.filter((id) => id !== track.id);
      const insertAt = this.currentIndex + 1 + this.playNextIds.length;
      this.items.splice(insertAt, 0, existing || track);
      this.playNextIds.push(track.id);
      this._cleanNavigation();
      this.save();
    },
    append(track) {
      if (!this.items.some((item) => item.id === track.id)) this.items.push(track);
      this.save();
    },
    select(trackId) {
      if (!this.items.some((item) => item.id === trackId)) return null;
      this.currentId = trackId;
      this.playNextIds = [];
      this.shuffleHistory = [trackId];
      this.shuffleCursor = 0;
      this.save();
      return this.current;
    },
    remove(index) {
      const removed = this.items[index];
      if (!removed) return false;
      const wasCurrent = removed.id === this.currentId;
      this.items.splice(index, 1);
      this.playNextIds = this.playNextIds.filter((id) => id !== removed.id);
      if (wasCurrent) this.currentId = this.items[index]?.id ?? this.items[index - 1]?.id ?? null;
      this._cleanNavigation();
      this.save();
      return wasCurrent;
    },
    move(index, delta) {
      const target = index + delta;
      if (target < 0 || target >= this.items.length) return;
      [this.items[index], this.items[target]] = [this.items[target], this.items[index]];
      this.playNextIds = [];
      this._cleanNavigation();
      this.save();
    },
    clear() {
      this.items = [];
      this.currentId = null;
      this.playNextIds = [];
      this.shuffleHistory = [];
      this.shuffleCursor = -1;
      this.save();
    },
    setMode(mode, sourceItems = this.items) {
      if (!playbackModes.includes(mode)) return;
      const current = this.current;
      const unique = new Map(sourceItems.map((item) => [item.id, item]));
      let replacement = [...unique.values()];
      if (current && !unique.has(current.id)) replacement.unshift(current);
      if (current && mode === "shuffle") {
        replacement = [current, ...shuffled(replacement.filter((item) => item.id !== current.id))];
      }
      this.items = replacement;
      this.mode = mode;
      this.playNextIds = [];
      this.shuffleHistory = this.currentId ? [this.currentId] : [];
      this.shuffleCursor = this.currentId ? 0 : -1;
      this.save();
    },
    cycleMode(sourceItems = this.items) {
      this.setMode(playbackModes[(playbackModes.indexOf(this.mode) + 1) % playbackModes.length], sourceItems);
    },
    setQuality(quality) { this.quality = quality; this.save(); },
    advance(direction = 1, reason = "manual") {
      if (!this.items.length || !this.currentId) return null;
      if (direction > 0 && this.playNextIds.length) {
        this.currentId = this.playNextIds.shift();
        this._recordShuffle(this.currentId);
        this.save();
        return this.current;
      }
      if (this.mode === "repeat-one" && reason === "ended") return this.current;
      if (this.mode === "shuffle") return this._advanceShuffle(direction);
      const nextIndex = this.currentIndex + direction;
      if (nextIndex >= 0 && nextIndex < this.items.length) this.currentId = this.items[nextIndex].id;
      else if (this.mode === "repeat-list" || (this.mode === "repeat-one" && reason === "manual")) this.currentId = this.items[(nextIndex + this.items.length) % this.items.length].id;
      else return null;
      this.save();
      return this.current;
    },
    _advanceShuffle(direction) {
      if (direction < 0) {
        if (this.shuffleCursor <= 0) return this.current;
        this.currentId = this.shuffleHistory[--this.shuffleCursor];
      } else if (this.shuffleCursor < this.shuffleHistory.length - 1) {
        this.currentId = this.shuffleHistory[++this.shuffleCursor];
      } else {
        const chosen = this.items[this.currentIndex + 1] || this.current;
        if (chosen.id === this.currentId) return null;
        this.currentId = chosen.id;
        this.shuffleHistory.push(chosen.id);
        this.shuffleCursor++;
      }
      this.save();
      return this.current;
    },
    _recordShuffle(trackId) {
      if (this.mode !== "shuffle") return;
      this.shuffleHistory = this.shuffleHistory.slice(0, this.shuffleCursor + 1);
      this.shuffleHistory.push(trackId);
      this.shuffleCursor++;
    },
    _cleanNavigation() {
      const ids = new Set(this.items.map((item) => item.id));
      this.shuffleHistory = this.shuffleHistory.filter((id) => ids.has(id));
      this.shuffleCursor = Math.min(this.shuffleCursor, this.shuffleHistory.length - 1);
    },
  },
});
