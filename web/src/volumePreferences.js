const volumeKey = "qqmusic-web.volume";
const lastAudibleVolumeKey = "qqmusic-web.lastAudibleVolume";

function readVolume(value, fallback) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

export function loadVolumePreferences(storage = globalThis.localStorage) {
  const volume = readVolume(storage?.getItem(volumeKey), 0.8);
  const lastAudibleVolume = readVolume(storage?.getItem(lastAudibleVolumeKey), volume > 0 ? volume : 0.8);
  return { volume, lastAudibleVolume: lastAudibleVolume > 0 ? lastAudibleVolume : 0.8 };
}

export function saveVolumePreferences(volume, lastAudibleVolume, storage = globalThis.localStorage) {
  storage?.setItem(volumeKey, String(volume));
  if (volume > 0) storage?.setItem(lastAudibleVolumeKey, String(lastAudibleVolume));
}

export function toggleMuteVolume(volume, lastAudibleVolume) {
  return volume > 0 ? 0 : lastAudibleVolume;
}
