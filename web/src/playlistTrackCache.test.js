import assert from "node:assert/strict";
import test from "node:test";
import { createPlaylistTrackCache } from "./playlistTrackCache.js";

const playlist = { id: "created-1", kind: "created" };

test("playlist cache returns fresh entries until the TTL expires", () => {
  const cache = createPlaylistTrackCache({ ttlMs: 1_000 });
  const tracks = [{ id: "track-1" }];
  cache.write(playlist, tracks, 10_000);

  assert.deepEqual(cache.read(playlist, 10_999), { tracks, fresh: true });
  assert.deepEqual(cache.read(playlist, 11_000), { tracks, fresh: false });
});

test("expired playlist data remains available while a caller refreshes it", () => {
  const cache = createPlaylistTrackCache({ ttlMs: 100 });
  cache.write(playlist, [{ id: "stale" }], 0);

  assert.deepEqual(cache.read(playlist, 101), { tracks: [{ id: "stale" }], fresh: false });
  cache.write(playlist, [{ id: "fresh" }], 102);
  assert.deepEqual(cache.read(playlist, 103), { tracks: [{ id: "fresh" }], fresh: true });
});

test("track additions update cached playlist rows without resetting their TTL", () => {
  const cache = createPlaylistTrackCache({ ttlMs: 100 });
  cache.write(playlist, [{ id: "one" }], 0);
  cache.addTrack(playlist, { id: "two" });
  cache.addTrack(playlist, { id: "two" });

  assert.deepEqual(cache.read(playlist, 50), { tracks: [{ id: "one" }, { id: "two" }], fresh: true });
  assert.equal(cache.read(playlist, 101).fresh, false);
});

test("playlist cache evicts the least recently used entry when bounded", () => {
  const cache = createPlaylistTrackCache({ maxEntries: 2 });
  const second = { id: "created-2", kind: "created" };
  const third = { id: "created-3", kind: "created" };
  cache.write(playlist, [{ id: "one" }]);
  cache.write(second, [{ id: "two" }]);
  cache.read(playlist);
  cache.write(third, [{ id: "three" }]);

  assert.ok(cache.read(playlist));
  assert.equal(cache.read(second), null);
  assert.ok(cache.read(third));
});
