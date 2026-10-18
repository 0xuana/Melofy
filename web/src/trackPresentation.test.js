import assert from "node:assert/strict";
import test from "node:test";

import { formatTrackDuration } from "./trackPresentation.js";

test("playlist duration uses minutes and zero-padded seconds", () => {
  assert.equal(formatTrackDuration(185_000), "3:05");
  assert.equal(formatTrackDuration(3_600_000), "60:00");
});

test("missing or invalid playlist duration is displayed as unavailable", () => {
  assert.equal(formatTrackDuration(0), "—");
  assert.equal(formatTrackDuration(null), "—");
  assert.equal(formatTrackDuration(Number.NaN), "—");
});
