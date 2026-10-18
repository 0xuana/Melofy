import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { QQMusicSessionRejectedError } from "@qqmusic-web/provider";
import type { QQMusicProvider } from "@qqmusic-web/provider";

import { createRequestHandler } from "./app.js";

test("returns an explicit unauthorized response when QQ rejects profile credentials", async () => {
  const provider = {
    getAccountProfile: async () => { throw new QQMusicSessionRejectedError(); },
  } as unknown as QQMusicProvider;
  const server = createServer(createRequestHandler(provider));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/account/profile`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "QQMusic profile rejected the session with code 1000; please sign in again.",
      code: 1000,
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
