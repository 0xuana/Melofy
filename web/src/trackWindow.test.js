import assert from "node:assert/strict";
import test from "node:test";
import { calculateTrackWindow, resetPlaylistScroll } from "./trackWindow.js";

test("playlist rendering keeps a bounded window for large playlists", () => {
  const window = calculateTrackWindow(20_000, 640_000, 0, 800);
  assert.equal(window.start, 9_992);
  assert.equal(window.end - window.start, 29);
  assert.equal(window.top, window.start * 64);
  assert.equal(window.bottom, (20_000 - window.end) * 64);
});

test("playlist rendering clamps the visible window at list boundaries", () => {
  assert.deepEqual(calculateTrackWindow(3, 0, 0, 800), { start: 0, end: 3, top: 0, bottom: 0 });
  const end = calculateTrackWindow(100, 20_000, 0, 400);
  assert.equal(end.end, 100);
  assert.equal(end.bottom, 0);
});

test("switching playlists resets the shared scroll position to the first row", () => {
  const mainView = { scrollTop: 18_000 };
  resetPlaylistScroll(mainView);
  assert.equal(mainView.scrollTop, 0);
  assert.equal(calculateTrackWindow(1_000, mainView.scrollTop, 300, 800).start, 0);
});
