import assert from "node:assert/strict";
import test from "node:test";
import { shouldCloseQueuePanel } from "./queuePanel.js";

test("outside clicks close the queue panel but panel and toggle clicks do not count as outside", () => {
  assert.equal(shouldCloseQueuePanel({ closest: () => null }), true);
  assert.equal(shouldCloseQueuePanel({ closest: (selector) => selector.includes(".queue-panel") ? {} : null }), false);
  assert.equal(shouldCloseQueuePanel({ closest: (selector) => selector.includes(".queue-toggle") ? {} : null }), false);
});
