export type LoginProvider = "qq" | "wechat";

export interface AccountSession {
  readonly accountId: string;
  readonly provider: LoginProvider;
  readonly expiresAt: string | null;
  readonly avatarUrl: string | null;
}

export interface Artist {
  readonly id: string;
  readonly name: string;
}

export interface AlbumSummary {
  readonly id: string;
  readonly name: string;
  readonly coverUrl: string | null;
}

export interface Track {
  readonly id: string;
  readonly mid: string;
  readonly title: string;
  readonly artists: readonly Artist[];
  readonly album: AlbumSummary | null;
  readonly durationMs: number;
  readonly playable: boolean;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly total: number | null;
}

export type PlaylistKind = "liked" | "created" | "collected";

export interface PlaylistSummary {
  readonly id: string;
  readonly dirId: string | null;
  readonly title: string;
  readonly coverUrl: string | null;
  readonly trackCount: number | null;
  readonly kind: PlaylistKind;
}

export type AudioQuality = "standard" | "high" | "lossless" | "hires";

export interface StreamResolution {
  readonly trackId: string;
  readonly quality: AudioQuality;
  readonly url: string;
  readonly expiresAt: string | null;
  readonly mimeType: string | null;
}

export interface UnplayableResolution {
  readonly trackId: string;
  readonly reason: "account" | "region" | "rights" | "subscription" | "unavailable";
  readonly message: string;
}

export interface TrackLyrics {
  readonly trackId: string;
  readonly lyric: string;
  readonly translation: string;
}

export interface QQMusicProvider {
  getSession(): Promise<AccountSession | null>;
  getLikedSongs(cursor: string | null, pageSize: number): Promise<Page<Track>>;
  getPlaylists(): Promise<readonly PlaylistSummary[]>;
  getPlaylistSongs(playlistId: string, dirId: string | null, cursor: string | null, pageSize: number): Promise<Page<Track>>;
  getLyrics(trackId: string): Promise<TrackLyrics>;
  resolveStream(
    trackId: string,
    quality: AudioQuality,
  ): Promise<StreamResolution | UnplayableResolution>;
}

