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

    if (url.includes("fcg_query_lyric_new")) return Response.json({ code: 0, lyric: Buffer.from("[ti:Song]\n[00:01.00]Line").toString("base64"), trans_v2: Buffer.from("[ti:Song]\n[00:01.00]翻译").toString("base64") });

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
  assert.deepEqual(await provider.getLyrics("7"), { trackId: "7", lyric: "[ti:Song]\n[00:01.00]Line", translation: "[ti:Song]\n[00:01.00]翻译" });
});

test("replacing credentials for the same account preserves loaded track metadata", async () => {
  const requests: Record<string, unknown>[] = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    requests.push(body);
    if (String(input).includes("fcg_get_profile_homepage")) return Response.json({ code: 0, data: { mymusic: [{ type: 1, id: "42" }] } });
    if (body.library) return Response.json({ code: 0, library: { code: 0, data: {
      total_song_num: 1,
      songlist: [{ id: 7, mid: "preserved-mid", title: "VIP track", action: { play: 1 }, file: { size_320mp3: 1200 } }],
    } } });
    return Response.json({ code: 0, stream: { code: 0, data: {
      sip: ["https://audio.example/"], midurlinfo: [{ purl: "vip.mp3" }],
    } } });
  }) as typeof globalThis.fetch;
  const provider = new LiveQQMusicProvider({ accountId: "123", accountType: "qq", musicKey: "old-key", expiresAt: new Date("2030-01-01") }, fakeFetch);

  await provider.getLikedSongs(null, 100);
  provider.replaceCredentials({ accountId: "123", accountType: "qq", musicKey: "fresh-key", expiresAt: new Date("2030-02-01") });

  const stream = await provider.resolveStream("7", "high");
  assert.ok("url" in stream, "the new session should still resolve previously loaded track metadata");
  assert.equal((requests.at(-1)?.comm as Record<string, unknown>).authst, "fresh-key");
  const streamRequest = requests.at(-1)?.stream as Record<string, unknown>;
  assert.deepEqual((streamRequest.param as Record<string, unknown>).songmid, ["preserved-mid"]);

  provider.replaceCredentials({ accountId: "456", accountType: "qq", musicKey: "another-account-key", expiresAt: new Date("2030-03-01") });
  assert.deepEqual(await provider.resolveStream("7", "high"), {
    trackId: "7", reason: "unavailable", message: "This legacy QQMusic entry has no playable song MID.",
  });
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

test("searches songs with QQ's desktop search request and normalizes search results", async () => {
  let sent: Record<string, unknown> = {};
  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ "music.search.SearchCgiService": { code: 0, data: {
      meta: { sum: 21 }, body: { song: { list: [{
        id: 7001, mid: "search-mid", type: 0, name: "Search result", interval: 95,
        singer: [{ id: 3, mid: "artist-mid", name: "Singer" }],
        album: { id: 4, mid: "album-mid", name: "Record" },
        file: { size_320mp3: 1024 }, action: { play: 1 },
      }] } },
    } } });
  }) as typeof globalThis.fetch;
  const provider = new LiveQQMusicProvider({ accountId: "123", accountType: "qq", musicKey: "key", expiresAt: new Date("2030-01-01") }, fakeFetch);

  const page = await provider.searchTracks("  query  ", 1, 20);

  assert.deepEqual(Object.keys(sent), ["music.search.SearchCgiService"]);
  const request = sent["music.search.SearchCgiService"] as Record<string, any>;
  assert.equal(request.method, "DoSearchForQQMusicDesktop");
  assert.deepEqual(request.param, { search_type: 0, query: "query", page_num: 1, num_per_page: 20 });
  assert.equal(page.items[0]?.id, "7001");
  assert.equal(page.items[0]?.mid, "search-mid");
  assert.equal(page.items[0]?.title, "Search result");
  assert.equal(page.items[0]?.artists[0]?.name, "Singer");
  assert.equal(page.nextCursor, "2");
  assert.equal(page.total, 21);
});

test("creates playlists and adds searched songs using QQ playlist write methods", async () => {
  const requests: Record<string, any>[] = [];
  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, any>;
    requests.push(body);
    if (body["music.search.SearchCgiService"]) return Response.json({ "music.search.SearchCgiService": { code: 0, data: {
      body: { song: { list: [{ id: 880, mid: "add-mid", type: 1, name: "Add me", singer: [], file: { size_128mp3: 10 } }] } },
    } } });
    if (body["music.musicasset.PlaylistBaseWrite"]) return Response.json({ code: 0, "music.musicasset.PlaylistBaseWrite": { code: 0, data: { result: { retCode: 0, tid: 991, dirId: 3, dirName: "New playlist" } } } });
    if (body["music.musicasset.PlaylistDetailWrite"]) return Response.json({ code: 0, "music.musicasset.PlaylistDetailWrite": { code: 0, data: { result: { retCode: 0 } } } });
    if (body.playlist) return Response.json({ code: 0, playlist: { code: 0, data: { total_song_num: 1, songlist: [{ id: 880, mid: "add-mid", type: 1, name: "Add me", singer: [] }] } } });
    throw new Error("Unexpected provider request");
  }) as typeof globalThis.fetch;
  const provider = new LiveQQMusicProvider({ accountId: "123", accountType: "qq", musicKey: "key", expiresAt: new Date("2030-01-01") }, fakeFetch);
  const track = (await provider.searchTracks("add", 1, 20)).items[0]!;

  const playlist = await provider.createPlaylist("New playlist");
  await provider.addTrackToPlaylist(track.id, playlist);

  assert.equal(playlist.id, "991");
  const createRequest = requests.find((request) => request["music.musicasset.PlaylistBaseWrite"])?.["music.musicasset.PlaylistBaseWrite"];
  assert.equal(createRequest?.module, "music.musicasset.PlaylistBaseWrite");
  assert.equal(createRequest?.method, "AddPlaylist");
  assert.deepEqual(createRequest?.param, { dirName: "New playlist" });
  const writeRequest = requests.find((request) => request["music.musicasset.PlaylistDetailWrite"])?.["music.musicasset.PlaylistDetailWrite"];
  assert.equal(writeRequest?.module, "music.musicasset.PlaylistDetailWrite");
  assert.equal(writeRequest?.method, "AddSonglist");
  assert.deepEqual(writeRequest?.param, {
    dirId: 3, v_songInfo: [{ songId: 880, songType: 1 }],
  });
});

test("accepts QQ add-song responses without envelope codes only when the mutation is confirmed", async () => {
  let addResponse: Record<string, any> = { result: { updateTime: 1_710_000_000 } };
  let playlistSongPresent = true;
  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, any>;
    if (body["music.search.SearchCgiService"]) return Response.json({ "music.search.SearchCgiService": { code: 0, data: {
      body: { song: { list: [{ id: 880, mid: "add-mid", type: 1, name: "Add me", singer: [] }] } },
    } } });
    if (body["music.musicasset.PlaylistDetailWrite"]) return Response.json({ "music.musicasset.PlaylistDetailWrite": { data: addResponse } });
    if (body.playlist) return Response.json({ code: 0, playlist: { code: 0, data: {
      total_song_num: playlistSongPresent ? 1 : 0,
      songlist: playlistSongPresent ? [{ id: 880, mid: "add-mid", type: 1, name: "Add me", singer: [] }] : [],
    } } });
    throw new Error("Unexpected provider request");
  }) as typeof globalThis.fetch;
  const provider = new LiveQQMusicProvider({ accountId: "123", accountType: "qq", musicKey: "key", expiresAt: new Date("2030-01-01") }, fakeFetch);
  const track = (await provider.searchTracks("add", 1, 20)).items[0]!;
  const playlist = { id: "991", dirId: "3", title: "New playlist", coverUrl: null, trackCount: null, kind: "created" as const };

  await provider.addTrackToPlaylist(track.id, playlist);
  addResponse = { result: {} };
  await assert.rejects(provider.addTrackToPlaylist(track.id, playlist), /did not confirm/);
  addResponse = { result: { retCode: 80105 } };
  await assert.rejects(provider.addTrackToPlaylist(track.id, playlist), /80105/);
  addResponse = { result: { updateTime: 1_710_000_001 } };
  playlistSongPresent = false;
  await assert.rejects(provider.addTrackToPlaylist(track.id, playlist), /track was not found/);
});

test("checks created playlist membership before presenting add destinations", async () => {
  const readPlaylists: string[] = [];
  let createdListReads = 0;
  let activePlaylistReads = 0;
  let maxConcurrentPlaylistReads = 0;
  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, any> : {};
    if (new URL(String(_input)).hostname === "c.y.qq.com") return Response.json({ code: 0, data: {
      creator: { encrypt_uin: "encrypted" }, mymusic: [{ type: 1, id: 42, title: "Liked" }],
    } });
    if (body.created) {
      createdListReads++;
      return Response.json({ code: 0, created: { code: 0, data: { v_playlist: [
        { tid: 51, dirId: 7, dirName: "Contains it" }, { tid: 52, dirId: 8, dirName: "Does not" },
      ] } } });
    }
    if (body.collected) return Response.json({ code: 0, collected: { code: 0, data: { total: 0, hasmore: 0, v_list: [] } } });
    const requestKey = Object.keys(body).find((key) => key === "playlist");
    assert.ok(requestKey);
    const param = body.playlist.param as Record<string, unknown>;
    readPlaylists.push(String(param.disstid));
    activePlaylistReads++;
    maxConcurrentPlaylistReads = Math.max(maxConcurrentPlaylistReads, activePlaylistReads);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activePlaylistReads--;
    const contains = param.disstid === 51;
    return Response.json({ code: 0, playlist: { code: 0, data: {
      total_song_num: contains ? 1 : 0,
      songlist: contains ? [{ id: 700, mid: "track-mid", title: "Track", singer: [] }] : [],
    } } });
  }) as typeof globalThis.fetch;
  const provider = new LiveQQMusicProvider({ accountId: "123", accountType: "qq", musicKey: "key", expiresAt: new Date("2030-01-01") }, fakeFetch);

  assert.deepEqual(await provider.getTrackPlaylistMembership("700"), ["51"]);
  assert.deepEqual(await provider.getTrackPlaylistMembership("700"), ["51"]);
  assert.deepEqual(readPlaylists.sort(), ["51", "52"]);
  assert.equal(createdListReads, 1, "created playlist summaries are reused");
  assert.equal(maxConcurrentPlaylistReads, 2, "membership scans run concurrently across playlists");
});

test("sends the persisted QQ authorization ticket when validating a profile", async () => {
  let profileCookie = "";
  let profileGToken = "";
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "c.y.qq.com") {
      profileCookie = new Headers(init?.headers).get("cookie") ?? "";
      profileGToken = url.searchParams.get("g_tk") ?? "";
      if (!profileCookie.includes("p_skey=profile-ticket")) return Response.json({ code: 1000 });
      return Response.json({ code: 0, data: { creator: { encrypt_uin: "encrypted", avatarUrl: "https://img.example/avatar.png" }, mymusic: [{ type: 1, id: 42, title: "Liked" }] } });
    }
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (body.created) return Response.json({ code: 0, created: { code: 0, data: { v_playlist: [] } } });
    if (body.collected) return Response.json({ code: 0, collected: { code: 0, data: { total: 0, hasmore: 0, v_list: [] } } });
    return Response.json({ code: 0 });
  }) as typeof globalThis.fetch;
  const provider = new LiveQQMusicProvider({
    accountId: "123",
    accountType: "qq",
    musicKey: "music-key",
    pSkey: "profile-ticket",
    expiresAt: new Date("2030-01-01"),
  } as ConstructorParameters<typeof LiveQQMusicProvider>[0], fakeFetch);

  const playlists = await provider.getPlaylists();

  assert.equal(profileCookie.includes("p_skey=profile-ticket"), true);
  assert.equal(profileGToken, String([..."profile-ticket"].reduce((hash, character) => ((hash << 5) + hash + character.charCodeAt(0)) & 0x7fffffff, 5381)));
  assert.equal(playlists[0]?.kind, "liked");
});
