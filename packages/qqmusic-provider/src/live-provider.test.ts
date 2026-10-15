import assert from "node:assert/strict";
import test from "node:test";

import { LiveQQMusicProvider } from "./live-provider.js";

test("loads the liked collection and resolves an authenticated stream", async () => {
  const requests: { url: string; body: Record<string, unknown> | null }[] = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    requests.push({ url, body });

    if (url.includes("fcg_get_profile_homepage")) {
      return Response.json({ code: 0, data: { creator: { avatarUrl: "https://img.example/avatar.jpg" }, mymusic: [{ type: 1, id: "42" }] } });
    }

    if (url.includes("fcg_query_lyric_new")) return Response.json({ code: 0, lyric: Buffer.from("[00:01.00]Line").toString("base64"), trans: Buffer.from("[00:01.00]翻译").toString("base64") });

    if (body?.library) {
      return Response.json({
        code: 0,
        library: {
          code: 0,
          data: {
            total_song_num: 1,
            songlist: [
              {
                id: 7,
                mid: "track-mid",
                type: 0,
                title: "Live track",
                interval: 123,
                singer: [{ id: 8, mid: "artist-mid", name: "Artist" }],
                album: { id: 9, mid: "album-mid", title: "Album" },
                action: { play: 1 },
                file: { size_320mp3: 2048 },
              },
            ],
          },
        },
      });
    }

    return Response.json({
      code: 0,
      stream: {
        code: 0,
        data: {
          expiration: 3600,
          sip: ["https://audio.example/"],
          midurlinfo: [{ purl: "track.mp3?temporary=yes" }],
        },
      },
    });
  }) as typeof globalThis.fetch;

  const provider = new LiveQQMusicProvider(
    {
      accountId: "12345",
      accountType: "qq",
      musicKey: "private-key",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    },
    fakeFetch,
  );

  const page = await provider.getLikedSongs(null, 100);
  assert.equal(page.total, 1);
  assert.equal(page.items[0]?.id, "7");
  assert.equal(page.items[0]?.mid, "track-mid");
  assert.equal((await provider.getSession())?.avatarUrl, "https://img.example/avatar.jpg");

  const stream = await provider.resolveStream("7", "high");
  assert.ok("url" in stream);
  assert.equal(stream.url, "https://audio.example/track.mp3?temporary=yes");

  const libraryRequest = requests.find((request) => request.body?.library);
  assert.equal((libraryRequest?.body?.comm as Record<string, unknown>).authst, "private-key");
  assert.doesNotMatch(JSON.stringify(page), /private-key/);
  assert.deepEqual(await provider.getLyrics("7"), { trackId: "7", lyric: "[00:01.00]Line", translation: "[00:01.00]翻译" });
});

test("normalizes created and collected playlists and pages playlist tracks", async () => {
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (url.includes("fcg_get_profile_homepage")) return Response.json({ code: 0, data: { creator: { encrypt_uin: "encrypted" }, mymusic: [{ type: 1, id: 42, title: "Liked", songnum: 3 }] } });
    if (body.created) return Response.json({ code: 0, created: { code: 0, data: { v_playlist: [{ tid: 42, dirId: 201, dirName: "Liked", songNum: 3 }, { tid: 51, dirId: 7, dirName: "Road trip", songNum: 2 }] } } });
    if (body.collected) return Response.json({ code: 0, collected: { code: 0, data: { total: 1, hasmore: 0, v_list: [{ tid: 61, dirId: 0, title: "Collected", songnum: 8 }] } } });
    return Response.json({ code: 0, playlist: { code: 0, data: { total_song_num: 1, songlist: [{ id: 71, mid: "mid-71", title: "Track", interval: 60, singer: [], file: { size_128mp3: 1 } }] } } });
  }) as typeof globalThis.fetch;
  const provider = new LiveQQMusicProvider({ accountId: "123", accountType: "qq", musicKey: "key", expiresAt: new Date("2030-01-01") }, fakeFetch);

  assert.deepEqual(await provider.getPlaylists(), [
    { id: "42", dirId: null, title: "Liked", coverUrl: null, trackCount: 3, kind: "liked" },
    { id: "51", dirId: "7", title: "Road trip", coverUrl: null, trackCount: 2, kind: "created" },
    { id: "61", dirId: "0", title: "Collected", coverUrl: null, trackCount: 8, kind: "collected" },
  ]);
  const page = await provider.getPlaylistSongs("51", "7", null, 100);
  assert.equal(page.items[0]?.id, "71");
  assert.equal(page.nextCursor, null);
});
