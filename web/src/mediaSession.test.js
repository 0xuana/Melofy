import assert from "node:assert/strict";
import test from "node:test";
import { registerMediaSessionActions } from "./mediaSession.js";

test("registers system playback actions and removes them on cleanup", () => {
  const calls = [];
  const mediaSession = { setActionHandler: (action, handler) => calls.push([action, handler]) };
  const actions = { play() {}, pause() {}, previous() {}, next() {} };

  const cleanup = registerMediaSessionActions(mediaSession, actions);

  assert.deepEqual(calls.map(([action]) => action), ["play", "pause", "previoustrack", "nexttrack"]);
  assert.equal(calls[2][1], actions.previous);
  assert.equal(calls[3][1], actions.next);
  cleanup();
  assert.deepEqual(calls.slice(4), [["play", null], ["pause", null], ["previoustrack", null], ["nexttrack", null]]);
});

test("continues when the browser does not support a media action", () => {
  const calls = [];
  const mediaSession = {
    setActionHandler(action, handler) {
      calls.push([action, handler]);
      if (action === "previoustrack") throw new TypeError("unsupported");
    },
  };

  const cleanup = registerMediaSessionActions(mediaSession, { play() {}, pause() {}, previous() {}, next() {} });

  assert.deepEqual(calls.slice(0, 4).map(([action]) => action), ["play", "pause", "previoustrack", "nexttrack"]);
  cleanup();
  assert.deepEqual(calls.slice(4).map(([action]) => action), ["play", "pause", "nexttrack"]);
});
