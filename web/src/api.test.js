import assert from "node:assert/strict";
import test from "node:test";

import { resolveStream } from "./api.js";

test("stream resolution preserves QQMusic's unplayable reason for auto-skip logic", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    trackId: "blocked-track",
    reason: "rights",
    message: "QQMusic did not authorize this audio representation.",
  }), { status: 403, headers: { "content-type": "application/json" } });
  try {
    await assert.rejects(resolveStream("blocked-track", "high"), (error) => {
      assert.equal(error.reason, "rights");
      assert.equal(error.trackId, "blocked-track");
      return true;
    });
  } finally { globalThis.fetch = originalFetch; }
});
