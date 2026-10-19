import type {
  AccountSession,
  AudioQuality,
  Page,
  PlaylistSummary,
  QQMusicProvider,
  StreamResolution,
  Track,
  TrackLyrics,
  UnplayableResolution,
} from "./types.js";

export interface QQMusicCredentials {
  readonly accountId: string;
  readonly accountType: string;
  readonly musicKey: string;
  readonly pSkey?: string;
  readonly expiresAt: Date;
}

interface RawSong {
  readonly id?: number;
  readonly songid?: number;
  readonly song_id?: number;
  readonly type?: number;
  readonly songtype?: number;
  readonly mid?: string;
  readonly songmid?: string;
  readonly title?: string;
  readonly name?: string;
  readonly interval?: number;
  readonly singer?: readonly { id?: number; mid?: string; name?: string }[];
  readonly album?: { id?: number; mid?: string; name?: string; title?: string };
  readonly action?: { play?: number };
  readonly file?: Record<string, unknown>;
}

interface CachedTrack {
  readonly mid: string;
  readonly songType: number;
  readonly file: Record<string, unknown>;
}

const musicuUrl = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const profileUrl = "https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function decodeLrc(value: unknown): string {
  if (typeof value !== "string" || /\[\d{1,3}:\d{2}(?:\.\d+)?\]/.test(value)) return typeof value === "string" ? value : "";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return value;
  const decoded = Buffer.from(value, "base64").toString("utf8");
  return /\[\d{1,3}:\d{2}(?:\.\d+)?\]/.test(decoded) ? decoded : value;
}

function firstLrc(...values: unknown[]): string {
  for (const value of values) {
    const decoded = decodeLrc(value);
    if (/\[\d{1,3}:\d{2}(?:\.\d+)?\]/.test(decoded)) return decoded;
  }
  return "";
}

function numericCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  const value = Number.parseInt(cursor, 10);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid QQMusic library cursor");
  return value;
}

export class LiveQQMusicProvider implements QQMusicProvider {
  readonly #credentials: QQMusicCredentials;
  readonly #fetch: typeof globalThis.fetch;
  readonly #tracks = new Map<string, CachedTrack>();
  readonly #membershipCache = new Map<string, { readonly ids: readonly string[]; readonly expiresAt: number }>();
  readonly #membershipRequests = new Map<string, Promise<readonly string[]>>();
  #favoritePlaylistId: number | null = null;
  #profile: Record<string, unknown> | null = null;
  #createdPlaylistsCache: { readonly playlists: readonly PlaylistSummary[]; readonly expiresAt: number } | null = null;
  #createdPlaylistsRequest: Promise<readonly PlaylistSummary[]> | null = null;

  constructor(credentials: QQMusicCredentials, fetchImplementation: typeof globalThis.fetch = globalThis.fetch) {
    this.#credentials = credentials;
    this.#fetch = fetchImplementation;
  }

  async getSession(): Promise<AccountSession | null> {
    return {
      accountId: this.#credentials.accountId,
      provider: this.#credentials.accountType.toLowerCase().includes("wx") ? "wechat" : "qq",
      expiresAt: this.#credentials.expiresAt.toISOString(),
      avatarUrl: this.#avatarUrl(),
    };
  }

  #avatarUrl(): string | null {
    const creator = asRecord(this.#profile?.creator);
    const candidate = creator.avatarUrl ?? creator.headUrl ?? creator.headurl ?? creator.avatar ?? creator.faceurl;
    if (typeof candidate !== "string" || !candidate) return null;
    const url = candidate.startsWith("//") ? `https:${candidate}` : candidate;
    return /^https:\/\//i.test(url) ? url : null;
  }

  async getAccountProfile() {
    const profile = await this.#getProfile();
    const creator = asRecord(profile.creator);
    const displayName = creator.nick ?? creator.nickname ?? creator.name;
    return {
      accountId: this.#credentials.accountId,
      displayName: typeof displayName === "string" && displayName ? displayName : null,
      avatarUrl: this.#avatarUrl(),
    };
  }

  async searchTracks(query: string, page: number, pageSize: number): Promise<Page<Track>> {
    const keyword = query.trim();
    if (!keyword) return { items: [], nextCursor: null, total: 0 };
    const pageNumber = Math.max(1, Math.floor(page));
    const limit = Math.max(1, Math.min(50, Math.floor(pageSize)));
    const module = "music.search.SearchCgiService";
    const response = await this.#fetch(musicuUrl, {
      method: "POST",
      headers: { ...this.#headers(), "content-type": "application/json" },
      body: JSON.stringify({ [module]: {
        module,
        method: "DoSearchForQQMusicDesktop",
        param: { search_type: 0, query: keyword, page_num: pageNumber, num_per_page: limit },
      } }),
    });
    if (!response.ok) throw new Error(`QQMusic search failed with HTTP ${response.status}`);
    const payload = asRecord(await response.json());
    const result = asRecord(payload[module]);
    if (payload.code !== undefined && payload.code !== 0) throw new Error(`QQMusic search failed with code ${String(payload.code)}`);
    if (result.code !== 0) throw new Error(`QQMusic search failed with code ${String(result.code)}`);
    const data = asRecord(result.data);
    const body = asRecord(data.body);
    const song = asRecord(body.song);
    const songs = Array.isArray(song.list) ? song.list as RawSong[] : [];
    const meta = asRecord(data.meta);
    const totalValue = Number(meta.sum ?? meta.total ?? song.total);
    const total = Number.isSafeInteger(totalValue) && totalValue >= 0 ? totalValue : null;
    const items = songs.flatMap((item) => { const track = this.#toTrack(item); return track ? [track] : []; });
    const nextPage = pageNumber + 1;
    const hasMore = total === null ? songs.length === limit : pageNumber * limit < total;
    return { items, nextCursor: hasMore ? String(nextPage) : null, total };
  }

  async getLikedSongs(cursor: string | null, pageSize: number): Promise<Page<Track>> {
    const offset = numericCursor(cursor);
    const limit = Math.max(1, Math.min(pageSize, 100));
    const playlistId = await this.#getFavoritePlaylistId();
    const response = await this.#requestMusicu("library", {
      module: "music.srfDissInfo.aiDissInfo",
      method: "uniform_get_Dissinfo",
      param: {
        disstid: playlistId,
        userinfo: 1,
        tag: 1,
        orderlist: 1,
        song_begin: offset,
        song_num: limit,
        onlysonglist: 0,
        enc_host_uin: "",
      },
    });

    const songs = Array.isArray(response.songlist) ? (response.songlist as RawSong[]) : [];
    const total = typeof response.total_song_num === "number" ? response.total_song_num : null;
    const items = songs.flatMap((song) => {
      const track = this.#toTrack(song);
      return track ? [track] : [];
    });
    const nextOffset = offset + songs.length;

    return {
      items,
      nextCursor: songs.length > 0 && (total === null || nextOffset < total) ? String(nextOffset) : null,
      total,
    };
  }

  async getPlaylists(): Promise<readonly PlaylistSummary[]> {
    const profile = await this.#getProfile();
    const music = Array.isArray(profile.mymusic) ? profile.mymusic.map(asRecord) : [];
    const favorite = music.find((item) => item.type === 1);
    const liked = this.#toPlaylist(favorite ?? {}, "liked", "我喜欢");

    const created = (await this.#getCreatedPlaylists()).filter((playlist) => playlist.id !== liked?.id);
    const creator = asRecord(profile.creator);
    const encryptedUin = typeof creator.encrypt_uin === "string" ? creator.encrypt_uin : "";
    const collected: PlaylistSummary[] = [];
    if (encryptedUin) {
      let offset = 0;
      for (;;) {
        const data = await this.#requestMusicu("collected", {
          module: "music.musicasset.PlaylistFavRead",
          method: "CgiGetPlaylistFavInfo",
          param: { uin: encryptedUin, offset, size: 100 },
        });
        const batch = (Array.isArray(data.v_list) ? data.v_list : []).map(asRecord);
        collected.push(...batch.map((item) => this.#toPlaylist(item, "collected")).filter((item): item is PlaylistSummary => item !== null));
        offset += batch.length;
        const total = typeof data.total === "number" ? data.total : null;
        if (batch.length === 0 || (total !== null && offset >= total) || data.hasmore === 0) break;
      }
    }
    return [liked, ...created, ...collected].filter((item): item is PlaylistSummary => item !== null)
      .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id && candidate.kind === item.kind) === index);
  }

  async #getCreatedPlaylists(): Promise<readonly PlaylistSummary[]> {
    if (this.#createdPlaylistsCache && this.#createdPlaylistsCache.expiresAt > Date.now()) return this.#createdPlaylistsCache.playlists;
    if (this.#createdPlaylistsRequest) return this.#createdPlaylistsRequest;
    this.#createdPlaylistsRequest = (async () => {
      const createdData = await this.#requestMusicu("created", {
      module: "music.musicasset.PlaylistBaseRead",
      method: "GetPlaylistByUin",
      param: { uin: this.#credentials.accountId },
      });
      const playlists = (Array.isArray(createdData.v_playlist) ? createdData.v_playlist : [])
        .map(asRecord).map((item) => this.#toPlaylist(item, "created"))
        .filter((item): item is PlaylistSummary => item !== null);
      this.#createdPlaylistsCache = { playlists, expiresAt: Date.now() + 30_000 };
      return playlists;
    })();
    try { return await this.#createdPlaylistsRequest; }
    finally { this.#createdPlaylistsRequest = null; }
  }

  async getPlaylistSongs(playlistId: string, dirId: string | null, cursor: string | null, pageSize: number): Promise<Page<Track>> {
    const offset = numericCursor(cursor);
    const limit = Math.max(1, Math.min(pageSize, 100));
    const response = await this.#requestMusicu("playlist", {
      module: "music.srfDissInfo.DissInfo",
      method: "CgiGetDiss",
      param: { disstid: Number(playlistId), dirid: Number(dirId ?? 0), tag: true, song_begin: offset, song_num: limit, userinfo: true, orderlist: true, onlysonglist: false },
    });
    const songs = Array.isArray(response.songlist) ? response.songlist as RawSong[] : [];
    const total = typeof response.total_song_num === "number" ? response.total_song_num : null;
    const items = songs.flatMap((song) => { const track = this.#toTrack(song); return track ? [track] : []; });
    const nextOffset = offset + songs.length;
    return { items, nextCursor: songs.length > 0 && (total === null || nextOffset < total) ? String(nextOffset) : null, total };
  }

  async getTrackPlaylistMembership(trackId: string): Promise<readonly string[]> {
    const cached = this.#membershipCache.get(trackId);
    if (cached && cached.expiresAt > Date.now()) return cached.ids;
    const ongoing = this.#membershipRequests.get(trackId);
    if (ongoing) return ongoing;
    const request = (async () => {
      const playlists = await this.#getCreatedPlaylists();
      const memberships: string[] = [];
      let nextIndex = 0;
      const worker = async () => {
        for (;;) {
          const index = nextIndex++;
          const playlist = playlists[index];
          if (!playlist) return;
          let cursor: string | null = null;
          do {
            const page = await this.getPlaylistSongs(playlist.id, playlist.dirId, cursor, 100);
            if (page.items.some((track) => track.id === trackId)) {
              memberships.push(playlist.id);
              break;
            }
            cursor = page.nextCursor;
          } while (cursor);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, playlists.length) }, worker));
      const ids = memberships.sort();
      this.#membershipCache.set(trackId, { ids, expiresAt: Date.now() + 30_000 });
      return ids;
    })();
    this.#membershipRequests.set(trackId, request);
    try { return await request; }
    finally { this.#membershipRequests.delete(trackId); }
  }

  async createPlaylist(name: string): Promise<PlaylistSummary> {
    const dirName = name.trim();
    if (!dirName || dirName.length > 40) throw new Error("歌单名称不能为空，且不能超过 40 个字符");
    const data = await this.#requestMusicu("music.musicasset.PlaylistBaseWrite", {
      module: "music.musicasset.PlaylistBaseWrite",
      method: "AddPlaylist",
      param: { dirName },
    });
    const result = asRecord(data.result ?? data);
    const retCode = Number(result.retCode ?? result.retcode ?? data.retCode ?? 0);
    if (retCode !== 0) throw new Error(`QQMusic create playlist failed with code ${retCode}`);
    const playlist = this.#toPlaylist(result, "created", dirName);
    if (!playlist) throw new Error("QQMusic did not return the created playlist id");
    this.#createdPlaylistsCache = null;
    return playlist;
  }

  async addTrackToPlaylist(trackId: string, playlist: PlaylistSummary): Promise<void> {
    if (playlist.kind === "collected") throw new Error("不能向收藏的歌单添加歌曲");
    const cached = this.#tracks.get(trackId);
    const songId = Number(trackId);
    if (!cached?.mid || !Number.isSafeInteger(songId) || songId <= 0) throw new Error("歌曲信息不完整，无法添加到歌单");
    const data = await this.#requestMusicu("music.musicasset.PlaylistDetailWrite", {
      module: "music.musicasset.PlaylistDetailWrite",
      method: "AddSonglist",
      param: {
        dirId: playlist.kind === "liked" ? 201 : Number(playlist.dirId ?? 0),
        v_songInfo: [{ songId, songType: cached.songType }],
      },
    }, true);
    const result = asRecord(data.result ?? data);
    const codeValue = result.retCode ?? result.retcode ?? result.code ?? result.errCode ?? result.errcode ?? data.retCode ?? data.retcode;
    if (codeValue !== undefined) {
      const code = Number(codeValue);
      if (!Number.isFinite(code) || code !== 0) throw new Error(`QQMusic add to playlist failed with code ${String(codeValue)}`);
    } else if (!((typeof result.updateTime === "number" && Number.isFinite(result.updateTime))
      || (typeof result.updateTime === "string" && result.updateTime.trim() !== "" && Number.isFinite(Number(result.updateTime))))) {
      throw new Error("QQMusic did not confirm that the track was added to the playlist");
    }

    if (!await this.#containsTrack(playlist, trackId)) {
      throw new Error("QQMusic accepted the add request but the track was not found in the playlist afterward");
    }
    this.#membershipCache.delete(trackId);
  }

  async #containsTrack(playlist: PlaylistSummary, trackId: string): Promise<boolean> {
    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    do {
      if (cursor !== null && seenCursors.has(cursor)) throw new Error("QQ Music returned a repeated playlist cursor while verifying the add");
      if (cursor !== null) seenCursors.add(cursor);
      const page: Page<Track> = playlist.kind === "liked"
        ? await this.getLikedSongs(cursor, 100)
        : await this.getPlaylistSongs(playlist.id, playlist.dirId, cursor, 100);
      if (page.items.some((track) => track.id === trackId)) return true;
      cursor = page.nextCursor;
    } while (cursor);
    return false;
  }

  async resolveStream(
    trackId: string,
    quality: AudioQuality,
  ): Promise<StreamResolution | UnplayableResolution> {
    const cached = this.#tracks.get(trackId);
    if (!cached?.mid) {
      return { trackId, reason: "unavailable", message: "This legacy QQMusic entry has no playable song MID." };
    }
    const format = this.#formatFor(quality, cached?.file ?? {});
    if (!format) {
      return { trackId, reason: "unavailable", message: `No ${quality} audio is available for this track.` };
    }

    const filename = `${format.prefix}${cached.mid}${cached.mid}.${format.extension}`;
    const response = await this.#requestMusicu("stream", {
      module: "vkey.GetVkeyServer",
      method: "CgiGetVkey",
      param: {
        guid: "1000000000",
        songmid: [cached.mid],
        songtype: [cached?.songType ?? 0],
        uin: this.#credentials.accountId,
        loginflag: 1,
        platform: "20",
        filename: [filename],
      },
    });

    const info = Array.isArray(response.midurlinfo) ? asRecord(response.midurlinfo[0]) : {};
    const sip = Array.isArray(response.sip) ? response.sip.find((item): item is string => typeof item === "string") : null;
    const purl = typeof info.purl === "string" ? info.purl : "";
    if (!sip || !purl) {
      return { trackId, reason: "rights", message: "QQMusic did not authorize this audio representation." };
    }

    const expiration = typeof response.expiration === "number" ? response.expiration : null;
    return {
      trackId,
      quality,
      url: new URL(purl, sip).toString(),
      expiresAt: expiration ? new Date(Date.now() + expiration * 1_000).toISOString() : null,
      mimeType: format.mimeType,
    };
  }

  async getLyrics(trackId: string): Promise<TrackLyrics> {
    const cached = this.#tracks.get(trackId);
    if (!cached?.mid) throw new Error("Load the track from a playlist before requesting lyrics");
    const url = new URL("https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg");
    for (const [key, value] of Object.entries({ songmid: cached.mid, format: "json", nobase64: "1", platform: "yqq.json", loginUin: this.#credentials.accountId, hostUin: "0", needNewCode: "0" })) url.searchParams.set(key, value);
    const response = await this.#fetch(url, { headers: this.#headers() });
    if (!response.ok) throw new Error(`QQMusic lyric request failed with HTTP ${response.status}`);
    const payload = asRecord(await response.json());
    if (payload.code !== 0) throw new Error(`QQMusic rejected lyrics with code ${String(payload.code)}`);
    return {
      trackId,
      lyric: firstLrc(payload.lyric, payload.lyricText),
      translation: firstLrc(payload.trans, payload.trans_v2, payload.transText, payload.translation, payload.translationLyric),
    };
  }

  async #getFavoritePlaylistId(): Promise<number> {
    if (this.#favoritePlaylistId !== null) return this.#favoritePlaylistId;

    const data = await this.#getProfile();
    const music = Array.isArray(data.mymusic) ? data.mymusic.map(asRecord) : [];
    const favorite = music.find((item) => item.type === 1);
    const playlistId = Number(favorite?.id);
    if (!Number.isSafeInteger(playlistId) || playlistId <= 0) throw new Error("QQMusic profile did not return a liked-song collection; sign in again.");
    this.#favoritePlaylistId = playlistId;
    return playlistId;
  }

  async #getProfile(): Promise<Record<string, unknown>> {
    if (this.#profile) return this.#profile;
    const url = new URL(profileUrl);
    for (const [key, value] of Object.entries({
      cid: "205360838",
      ct: "24",
      userid: "0",
      reqfrom: "1",
      reqtype: "0",
      hostUin: "0",
      loginUin: this.#credentials.accountId,
      needNewCode: "0",
      format: "json",
      ...(this.#credentials.pSkey ? { g_tk: String(hash33(this.#credentials.pSkey, 5381)) } : {}),
    })) url.searchParams.set(key, value);

    const response = await this.#fetch(url, { headers: this.#headers() });
    if (!response.ok) throw new Error(`QQMusic profile request failed with HTTP ${response.status}`);
    const payload = asRecord(await response.json());
    if (payload.code === 1000) throw new QQMusicSessionRejectedError();
    if (payload.code !== 0) throw new Error(`QQMusic profile request failed with code ${String(payload.code)}`);
    this.#profile = asRecord(payload.data);
    return this.#profile;
  }

  async #requestMusicu(key: string, request: Record<string, unknown>, allowMissingCodes = false): Promise<Record<string, unknown>> {
    const response = await this.#fetch(musicuUrl, {
      method: "POST",
      headers: { ...this.#headers(), "content-type": "application/json" },
      body: JSON.stringify({ comm: this.#comm(), [key]: request }),
    });
    if (!response.ok) throw new Error(`QQMusic request failed with HTTP ${response.status}`);

    const payload = asRecord(await response.json());
    const result = asRecord(payload[key]);
    const hasPayloadCode = payload.code !== undefined;
    const hasModuleCode = result.code !== undefined;
    if ((hasPayloadCode && payload.code !== 0) || (hasModuleCode && result.code !== 0)
      || (!allowMissingCodes && (!hasPayloadCode || !hasModuleCode))) {
      throw new Error(`QQMusic rejected ${key} with code ${String(result.code ?? payload.code)}`);
    }
    return asRecord(result.data);
  }

  #comm(): Record<string, unknown> {
    return {
      cv: 4_747_474,
      ct: 24,
      format: "json",
      inCharset: "utf-8",
      outCharset: "utf-8",
      notice: 0,
      platform: "yqq.json",
      needNewCode: 1,
      uin: this.#credentials.accountId,
      authst: this.#credentials.musicKey,
      tmeLoginType: 2,
    };
  }

  #headers(): Record<string, string> {
    const { accountId, musicKey, pSkey } = this.#credentials;
    return {
      accept: "application/json",
      cookie: `uin=o${accountId}; qqmusic_key=${musicKey}; qm_keyst=${musicKey}${pSkey ? `; p_skey=${pSkey}` : ""}`,
      origin: "https://y.qq.com",
      referer: "https://y.qq.com/",
      "user-agent": "Mozilla/5.0 QQMusic-Web-Player/0.1",
    };
  }

  #toTrack(song: RawSong): Track | null {
    const idValue = song.id ?? song.songid ?? song.song_id ?? song.mid ?? song.songmid;
    const id = idValue === undefined ? undefined : String(idValue);
    if (!id) return null;
    const file = asRecord(song.file);
    const mid = song.mid ?? song.songmid ?? "";
    this.#tracks.set(id, { mid, songType: song.type ?? song.songtype ?? 0, file });
    const albumMid = song.album?.mid ?? "";

    return {
      id,
      mid,
      title: song.title ?? song.name ?? "Unknown track",
      artists: (song.singer ?? []).map((artist) => ({
        id: artist.mid ?? String(artist.id ?? ""),
        name: artist.name ?? "Unknown artist",
      })),
      album: song.album
        ? {
            id: albumMid || String(song.album.id ?? ""),
            name: song.album.title ?? song.album.name ?? "",
            coverUrl: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : null,
          }
        : null,
      durationMs: Math.max(0, song.interval ?? 0) * 1_000,
      playable: Boolean(mid) && song.action?.play !== 0 && Object.values(file).some((value) => typeof value === "number" && value > 0),
    };
  }

  #toPlaylist(value: Record<string, unknown>, kind: PlaylistSummary["kind"], fallbackTitle = ""): PlaylistSummary | null {
    const idValue = value.id ?? value.tid ?? value.dissid;
    const id = typeof idValue === "number" || typeof idValue === "string" ? String(idValue) : "";
    if (!id) return null;
    const dirValue = value.dirId ?? value.dirid;
    const countValue = value.songNum ?? value.songnum ?? value.song_cnt;
    const coverValue = value.picurl ?? value.picUrl ?? value.logo ?? value.cover;
    const titleValue = value.dirName ?? value.title ?? value.dissname ?? value.name;
    return {
      id,
      dirId: typeof dirValue === "number" || typeof dirValue === "string" ? String(dirValue) : null,
      title: typeof titleValue === "string" && titleValue ? titleValue : fallbackTitle,
      coverUrl: typeof coverValue === "string" && coverValue ? coverValue : null,
      trackCount: typeof countValue === "number" ? countValue : null,
      kind,
    };
  }

  #formatFor(quality: AudioQuality, file: Record<string, unknown>) {
    const formats = {
      standard: { prefix: "M500", extension: "mp3", size: "size_128mp3", mimeType: "audio/mpeg" },
      high: { prefix: "M800", extension: "mp3", size: "size_320mp3", mimeType: "audio/mpeg" },
      lossless: { prefix: "F000", extension: "flac", size: "size_flac", mimeType: "audio/flac" },
      hires: { prefix: "RS01", extension: "flac", size: "size_hires", mimeType: "audio/flac" },
    } as const;
    const format = formats[quality];
    const size = file[format.size];
    return typeof size === "number" && size > 0 ? format : null;
  }
}

export class QQMusicSessionRejectedError extends Error {
  readonly code = 1000;

  constructor() {
    super("QQMusic profile rejected the session with code 1000; please sign in again.");
    this.name = "QQMusicSessionRejectedError";
  }
}

function hash33(value: string, initial = 0): number {
  let hash = initial;
  for (const character of value) hash = ((hash << 5) + hash + character.charCodeAt(0)) & 0x7fffffff;
  return hash;
}
