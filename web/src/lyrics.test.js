import assert from "node:assert/strict";
import test from "node:test";

import { parseLyrics } from "./lyrics.js";

test("parses, sorts, and joins translated LRC lines", () => {
  assert.deepEqual(parseLyrics("[00:02.50]Second\n[00:01.00][00:03.00]Line", "[00:01.00]翻译"), [
    { at: 1_000, text: "Line", translation: "翻译" },
    { at: 2_500, text: "Second", translation: "" },
    { at: 3_000, text: "Line", translation: "" },
  ]);
});

test("aligns translated lines when QQ Music timestamps differ slightly", () => {
  assert.deepEqual(parseLyrics("[00:01.00]First\n[00:04.00]Second", "[00:01.35]第一句\n[00:04.80]第二句"), [
    { at: 1_000, text: "First", translation: "第一句" },
    { at: 4_000, text: "Second", translation: "第二句" },
  ]);
});
