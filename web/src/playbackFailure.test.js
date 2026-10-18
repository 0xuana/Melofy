import assert from "node:assert/strict";
import test from "node:test";

import { loadTrackStream, unplayableLabel } from "./playbackFailure.js";

test("a rights-rejected stream is marked and automatically skipped", async () => {
  const calls = [];
  const loaded = await loadTrackStream({ id: "blocked", playable: true }, {
    resolve: async () => { throw Object.assign(new Error("no rights"), { reason: "rights" }); },
    setSource: () => calls.push(["source"]),
    markUnplayable: (id) => calls.push(["mark", id]),
    skip: async () => calls.push(["skip"]),
  });

  assert.equal(loaded, false);
  assert.deepEqual(calls, [["mark", "blocked"], ["skip"]]);
});

test("a track known to be unavailable is skipped even if the stream error is generic", async () => {
  let skipped = false;
  const loaded = await loadTrackStream({ id: "unavailable", playable: false }, {
    resolve: async () => { throw new Error("network"); },
    setSource() {},
    markUnplayable() {},
    skip: async () => { skipped = true; },
  });
  assert.equal(loaded, false);
  assert.equal(skipped, true);
});

test("ordinary playback errors are not marked or skipped", async () => {
  let called = false;
  await assert.rejects(loadTrackStream({ id: "normal", playable: true }, {
    resolve: async () => { throw new Error("network"); },
    setSource() {},
    markUnplayable() { called = true; },
    skip() { called = true; },
  }), /network/);
  assert.equal(called, false);
});

test("playability labels distinguish rights restrictions from other failures", () => {
  assert.equal(unplayableLabel("rights"), "无版权");
  assert.equal(unplayableLabel("subscription"), "需会员");
  assert.equal(unplayableLabel("region"), "地区限制");
  assert.equal(unplayableLabel("unavailable"), "暂不可播");
});
