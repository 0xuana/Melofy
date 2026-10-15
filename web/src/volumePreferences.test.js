import assert from "node:assert/strict";
import test from "node:test";
import { loadVolumePreferences, saveVolumePreferences, toggleMuteVolume } from "./volumePreferences.js";

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("mute restores the last non-zero volume after reload", () => {
  const storage = createStorage();
  saveVolumePreferences(0.37, 0.37, storage);
  saveVolumePreferences(0, 0.37, storage);
  const restored = loadVolumePreferences(storage);

  assert.equal(restored.volume, 0);
  assert.equal(restored.lastAudibleVolume, 0.37);
  assert.equal(toggleMuteVolume(restored.volume, restored.lastAudibleVolume), 0.37);
});

test("legacy muted preference falls back to the default audible volume", () => {
  assert.deepEqual(loadVolumePreferences(createStorage({ "qqmusic-web.volume": "0" })), {
    volume: 0,
    lastAudibleVolume: 0.8,
  });
});
