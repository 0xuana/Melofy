import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";

import { useQueue } from "./queue.js";

const tracks = ["a", "b", "c", "d"].map((id) => ({ id, title: id.toUpperCase() }));
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
};

function queue() { setActivePinia(createPinia()); return useQueue(); }

test.beforeEach(() => memory.clear());

test("playNow uses visible context, selects the track, and removes duplicates", () => {
  const value = queue();
  value.playNow(tracks[1], [tracks[0], tracks[1], tracks[1], tracks[2]]);
  assert.equal(value.current.id, "b");
  assert.deepEqual(value.items.map((item) => item.id), ["a", "b", "c"]);
});

test("successive playNext requests preserve FIFO order", () => {
  const value = queue();
  value.playNow(tracks[0], tracks);
  value.playNext(tracks[2]);
  value.playNext(tracks[3]);
  value.playNext(tracks[1]);
  assert.deepEqual(value.items.map((item) => item.id), ["a", "c", "d", "b"]);
  assert.equal(value.advance().id, "c");
  assert.equal(value.advance().id, "d");
  assert.equal(value.advance().id, "b");
});

test("sequence stops at both ends and repeat-list wraps", () => {
  const value = queue();
  value.playNow(tracks[0], tracks.slice(0, 2));
  assert.equal(value.advance(-1), null);
  assert.equal(value.current.id, "a");
  value.select("b");
  assert.equal(value.advance(1, "ended"), null);
  assert.equal(value.current.id, "b");
  value.setMode("repeat-list");
  assert.equal(value.advance().id, "a");
  assert.equal(value.advance(-1).id, "b");
});

test("repeat-one repeats on ended but manual next changes track", () => {
  const value = queue();
  value.playNow(tracks[0], tracks.slice(0, 2));
  value.setMode("repeat-one");
  assert.equal(value.advance(1, "ended").id, "a");
  assert.equal(value.advance(1, "manual").id, "b");
});

test("shuffle keeps history for previous navigation", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const value = queue();
    value.playNow(tracks[0], tracks.slice(0, 3));
    value.setMode("shuffle");
    assert.deepEqual(value.items.map((item) => item.id), ["a", "c", "b"]);
    const next = value.advance().id;
    assert.equal(next, "c");
    assert.equal(value.advance(-1).id, "a");
    assert.equal(value.advance(1).id, next);
  } finally { Math.random = originalRandom; }
});

test("cycling playback mode rebuilds the queue from the selected playlist", () => {
  const value = queue();
  value.playNow(tracks[1], [tracks[1], tracks[3]]);
  value.playNext(tracks[0]);
  value.cycleMode([tracks[0], tracks[1], tracks[2]]);
  assert.equal(value.mode, "repeat-list");
  assert.deepEqual(value.items.map((item) => item.id), ["a", "b", "c"]);
  assert.deepEqual(value.playNextIds, []);
  assert.equal(value.current.id, "b");
});

test("queue and playback settings restore without signed stream URLs", () => {
  const first = queue();
  first.playNow(tracks[1], tracks);
  first.setMode("shuffle");
  first.setQuality("lossless");
  const restored = queue();
  assert.equal(restored.current.id, "b");
  assert.equal(restored.mode, "shuffle");
  assert.equal(restored.quality, "lossless");
  assert.doesNotMatch(memory.get("qqmusic-web.playback.v2"), /https?:\/\//);
});

test("move and removal preserve current identity", () => {
  const value = queue();
  value.playNow(tracks[1], tracks.slice(0, 3));
  value.move(1, 1);
  assert.equal(value.current.id, "b");
  assert.equal(value.remove(2), true);
  assert.equal(value.current.id, "c");
  value.clear();
  assert.equal(value.current, null);
});
