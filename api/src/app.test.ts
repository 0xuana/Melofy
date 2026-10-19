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

test("exposes authenticated search and playlist action endpoints", async () => {
  const added: string[] = [];
  const playlist = { id: "playlist-1", dirId: "4", title: "Road trip", coverUrl: null, trackCount: 2, kind: "created" };
  const provider = {
    searchTracks: async (query: string, page: number, limit: number) => ({ items: [{ id: "track-1", title: query }], nextCursor: page < 2 ? "2" : null, total: limit }),
    getTrackPlaylistMembership: async (trackId: string) => trackId === "track-1" ? ["playlist-1"] : [],
    getPlaylists: async () => [playlist],
    createPlaylist: async (name: string) => ({ ...playlist, id: "new", title: name }),
    addTrackToPlaylist: async (trackId: string, target: { id: string }) => { added.push(`${trackId}:${target.id}`); },
  } as unknown as QQMusicProvider;
  const server = createServer(createRequestHandler(provider));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const search = await fetch(`${base}/api/search?query=hello&page=2&limit=10`);
    assert.deepEqual(await search.json(), { items: [{ id: "track-1", title: "hello" }], nextCursor: null, total: 10 });
    const membership = await fetch(`${base}/api/tracks/track-1/playlists`);
    assert.deepEqual(await membership.json(), { playlistIds: ["playlist-1"] });
    const created = await fetch(`${base}/api/playlists`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "New" }) });
    assert.equal((await created.json() as { playlist: { title: string } }).playlist.title, "New");
    const addedResponse = await fetch(`${base}/api/playlists/playlist-1/tracks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trackId: "track-1" }) });
    assert.deepEqual(await addedResponse.json(), { added: true, verified: true });
    assert.deepEqual(added, ["track-1:playlist-1"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("does not report a playlist add as successful when QQ rejects the write", async () => {
  const playlist = { id: "playlist-1", dirId: "4", title: "Road trip", coverUrl: null, trackCount: 2, kind: "created" };
  const provider = {
    getPlaylists: async () => [playlist],
    addTrackToPlaylist: async () => { throw new Error("QQMusic add to playlist failed with code 80105"); },
  } as unknown as QQMusicProvider;
  const server = createServer(createRequestHandler(provider));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/playlists/playlist-1/tracks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackId: "track-1" }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "QQMusic add to playlist failed with code 80105" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
