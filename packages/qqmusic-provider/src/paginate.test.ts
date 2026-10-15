import assert from "node:assert/strict";
import test from "node:test";

import { collectAllPages } from "./paginate.js";

test("collectAllPages follows cursors and removes duplicate records", async () => {
  const pages = new Map([
    [null, { items: [{ id: "1" }, { id: "2" }], nextCursor: "next", total: 3 }],
    ["next", { items: [{ id: "2" }, { id: "3" }], nextCursor: null, total: 3 }],
  ]);

  const result = await collectAllPages({
    fetchPage: async (cursor) => {
      const page = pages.get(cursor);
      assert.ok(page);
      return page as { items: { id: string }[]; nextCursor: string | null; total: number };
    },
    identify: (item) => item.id,
  });

  assert.deepEqual(result, [{ id: "1" }, { id: "2" }, { id: "3" }]);
});

test("collectAllPages rejects a repeated cursor", async () => {
  await assert.rejects(
    collectAllPages({
      fetchPage: async () => ({ items: [], nextCursor: "same", total: null }),
      identify: (item: { id: string }) => item.id,
    }),
    /repeated cursor/,
  );
});

