const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 8;

function keyFor(playlist) {
  return `${playlist.kind}:${playlist.id}`;
}
export function createPlaylistTrackCache({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
  const entries = new Map();

  function touch(key, entry) {
    entries.delete(key);
    entries.set(key, entry);
  }

  function save(key, entry) {
    touch(key, entry);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }

  return {
    read(playlist, now = Date.now()) {
      const key = keyFor(playlist);
      const entry = entries.get(key);
      if (!entry) return null;
      touch(key, entry);
      return { tracks: [...entry.tracks], fresh: now - entry.savedAt < ttlMs };
    },

    write(playlist, tracks, now = Date.now()) {
      save(keyFor(playlist), { tracks: [...tracks], savedAt: now });
    },

    addTrack(playlist, track) {
      const key = keyFor(playlist);
      const entry = entries.get(key);
      if (!entry || entry.tracks.some((item) => item.id === track.id)) return;
      save(key, { ...entry, tracks: [...entry.tracks, track] });
    },
  };
}
