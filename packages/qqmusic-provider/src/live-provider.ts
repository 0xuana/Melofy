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
  readonly expiresAt: Date;
}

interface RawSong {
  readonly id?: number;
  readonly type?: number;
  readonly songtype?: number;
  readonly mid?: string;
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
  if (typeof value !== "string" || value.includes("[")) return typeof value === "string" ? value : "";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return value;
  const decoded = Buffer.from(value, "base64").toString("utf8");
  return /\[\d{1,3}:\d{2}(?:\.\d+)?\]/.test(decoded) ? decoded : value;
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
  #favoritePlaylistId: number | null = null;
  #profile: Record<string, unknown> | null = null;

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

    const createdData = await this.#requestMusicu("created", {
      module: "music.musicasset.PlaylistBaseRead",
      method: "GetPlaylistByUin",
      param: { uin: this.#credentials.accountId },
    });
    const created = (Array.isArray(createdData.v_playlist) ? createdData.v_playlist : [])
      .map(asRecord).map((item) => this.#toPlaylist(item, "created"))
      .filter((item): item is PlaylistSummary => item !== null && item.id !== liked?.id);

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
      lyric: decodeLrc(payload.lyric),
      translation: decodeLrc(payload.trans ?? payload.translation),
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
    })) url.searchParams.set(key, value);

    const response = await this.#fetch(url, { headers: this.#headers() });
    if (!response.ok) throw new Error(`QQMusic profile request failed with HTTP ${response.status}`);
    const payload = asRecord(await response.json());
    if (payload.code !== 0) throw new Error(`QQMusic profile rejected the session with code ${String(payload.code)}`);
    this.#profile = asRecord(payload.data);
    return this.#profile;
  }

  async #requestMusicu(key: string, request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.#fetch(musicuUrl, {
      method: "POST",
      headers: { ...this.#headers(), "content-type": "application/json" },
      body: JSON.stringify({ comm: this.#comm(), [key]: request }),
    });
    if (!response.ok) throw new Error(`QQMusic request failed with HTTP ${response.status}`);

    const payload = asRecord(await response.json());
    const result = asRecord(payload[key]);
    if (payload.code !== 0 || result.code !== 0) {
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
    const { accountId, musicKey } = this.#credentials;
    return {
      accept: "application/json",
      cookie: `uin=o${accountId}; qqmusic_key=${musicKey}; qm_keyst=${musicKey}`,
      origin: "https://y.qq.com",
      referer: "https://y.qq.com/",
      "user-agent": "Mozilla/5.0 QQMusic-Web-Player/0.1",
    };
  }

  #toTrack(song: RawSong): Track | null {
    const id = song.id === undefined ? song.mid : String(song.id);
    if (!id) return null;
    const file = asRecord(song.file);
    const mid = song.mid ?? "";
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
