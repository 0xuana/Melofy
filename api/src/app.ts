import { inspectInstalledProfile } from "@qqmusic-web/installed-profile-adapter";
import { QQMusicSessionRejectedError } from "@qqmusic-web/provider";
import type { AudioQuality, QQMusicProvider } from "@qqmusic-web/provider";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { QQQrLoginService } from "./qq-qr-login.js";
import type { SessionManager } from "./session-manager.js";
import type { WeChatQrLoginService } from "./wechat-qr-login.js";

const qualities = new Set<AudioQuality>(["standard", "high", "lossless", "hires"]);

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "access-control-allow-origin": "http://127.0.0.1:5173",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function pageSize(value: string | null): number {
  const parsed = value === null ? 100 : Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? Math.max(1, Math.min(parsed, 100)) : 100;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid JSON request body");
  return value as Record<string, unknown>;
}

interface AuthenticationServices {
  readonly qrLogin: QQQrLoginService;
  readonly wechatQrLogin: WeChatQrLoginService;
  readonly sessions: SessionManager;
}

export function createRequestHandler(
  providerSource: QQMusicProvider | (() => QQMusicProvider | null),
  profilePath?: string,
  authentication?: AuthenticationServices,
) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const provider = typeof providerSource === "function" ? providerSource() : providerSource;
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok" });
      } else if (request.method === "POST" && url.pathname === "/api/auth/qq/qr") {
        if (!authentication) { sendJson(response, 501, { error: "QQ QR login is not configured" }); return; }
        sendJson(response, 201, await authentication.qrLogin.create());
      } else if (request.method === "GET" && /^\/api\/auth\/qq\/qr\/[^/]+$/.test(url.pathname)) {
        if (!authentication) { sendJson(response, 501, { error: "QQ QR login is not configured" }); return; }
        const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
        const result = await authentication.qrLogin.poll(id);
        if (result.credentials) await authentication.sessions.setCredentials(result.credentials);
        sendJson(response, 200, { status: result.status });
      } else if (request.method === "POST" && url.pathname === "/api/auth/wechat/qr") {
        if (!authentication) { sendJson(response, 501, { error: "WeChat QR login is not configured" }); return; }
        sendJson(response, 201, await authentication.wechatQrLogin.create());
      } else if (request.method === "GET" && /^\/api\/auth\/wechat\/qr\/[^/]+$/.test(url.pathname)) {
        if (!authentication) { sendJson(response, 501, { error: "WeChat QR login is not configured" }); return; }
        const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
        const result = await authentication.wechatQrLogin.poll(id);
        if (result.credentials) await authentication.sessions.setCredentials(result.credentials);
        sendJson(response, 200, { status: result.status });
      } else if (request.method === "GET" && url.pathname === "/api/session") {
        sendJson(response, 200, { session: provider ? await provider.getSession() : null });
      } else if (request.method === "DELETE" && url.pathname === "/api/session") {
        if (!authentication) { sendJson(response, 501, { error: "Session management is not configured" }); return; }
        authentication.sessions.clear();
        sendJson(response, 200, { session: null });
      } else if (request.method === "GET" && url.pathname === "/api/profile") {
        sendJson(response, profilePath ? 200 : 404, profilePath
          ? { profile: inspectInstalledProfile(profilePath) }
          : { error: "Installed profile inspection is not configured" });
      } else if (request.method === "GET" && url.pathname === "/api/account/profile") {
        if (!provider) { sendJson(response, 401, { error: "QQMusic login is required" }); return; }
        sendJson(response, 200, { profile: await provider.getAccountProfile() });
      } else if (request.method === "GET" && url.pathname === "/api/search") {
        if (!provider) { sendJson(response, 401, { error: "QQMusic login is required" }); return; }
        const query = (url.searchParams.get("query") ?? "").trim();
        if (!query || query.length > 100) { sendJson(response, 400, { error: "搜索内容不能为空且不能超过 100 个字符" }); return; }
        const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
        sendJson(response, 200, await provider.searchTracks(query, page, pageSize(url.searchParams.get("limit"))));
      } else if (request.method === "GET" && /^\/api\/tracks\/[^/]+\/playlists$/.test(url.pathname)) {
        if (!provider) { sendJson(response, 401, { error: "QQMusic login is required" }); return; }
        const trackId = decodeURIComponent(url.pathname.split("/").at(-2) ?? "");
        sendJson(response, 200, { playlistIds: await provider.getTrackPlaylistMembership(trackId) });
      } else if (request.method === "POST" && url.pathname === "/api/playlists") {
        if (!provider) { sendJson(response, 401, { error: "QQMusic login is required" }); return; }
        const body = await readJson(request);
        if (typeof body.name !== "string") { sendJson(response, 400, { error: "缺少歌单名称" }); return; }
        sendJson(response, 201, { playlist: await provider.createPlaylist(body.name) });
      } else if (request.method === "POST" && /^\/api\/playlists\/[^/]+\/tracks$/.test(url.pathname)) {
        if (!provider) { sendJson(response, 401, { error: "QQMusic login is required" }); return; }
        const playlistId = decodeURIComponent(url.pathname.split("/").at(-2) ?? "");
        const body = await readJson(request);
        if (typeof body.trackId !== "string") { sendJson(response, 400, { error: "缺少歌曲 ID" }); return; }
        const playlist = (await provider.getPlaylists()).find((item) => item.id === playlistId && (item.kind === "created" || item.kind === "liked"));
        if (!playlist) { sendJson(response, 404, { error: "找不到可编辑的歌单" }); return; }
        await provider.addTrackToPlaylist(body.trackId, playlist);
        sendJson(response, 200, { added: true, verified: true });
      } else if (request.method === "GET" && url.pathname === "/api/playlists") {
        if (!provider) { sendJson(response, 401, { error: "QQMusic login is required" }); return; }
        sendJson(response, 200, { playlists: await provider.getPlaylists() });
      } else if (request.method === "GET" && url.pathname === "/api/playlists/liked/tracks") {
        if (!provider) { sendJson(response, 401, { error: "QQMusic login is required" }); return; }
        sendJson(response, 200, await provider.getLikedSongs(url.searchParams.get("cursor"), pageSize(url.searchParams.get("limit"))));
      } else {
        const playlistMatch = /^\/api\/playlists\/([^/]+)\/tracks$/.exec(url.pathname);
        if (request.method === "GET" && playlistMatch?.[1]) {
          if (!provider) { sendJson(response, 401, { error: "QQMusic login is required" }); return; }
          sendJson(response, 200, await provider.getPlaylistSongs(decodeURIComponent(playlistMatch[1]), url.searchParams.get("dirId"), url.searchParams.get("cursor"), pageSize(url.searchParams.get("limit"))));
          return;
        }
        const lyricMatch = /^\/api\/tracks\/([^/]+)\/lyrics$/.exec(url.pathname);
        if (request.method === "GET" && lyricMatch?.[1]) {
          if (!provider) { sendJson(response, 401, { error: "QQMusic login is required" }); return; }
          sendJson(response, 200, await provider.getLyrics(decodeURIComponent(lyricMatch[1])));
          return;
        }
        const match = /^\/api\/tracks\/([^/]+)\/stream$/.exec(url.pathname);
        if (request.method !== "GET" || !match?.[1]) {
          sendJson(response, 404, { error: "Not found" });
          return;
        }
        if (!provider) { sendJson(response, 401, { error: "QQMusic login is required" }); return; }
        const quality = url.searchParams.get("quality") ?? "high";
        if (!qualities.has(quality as AudioQuality)) {
          sendJson(response, 400, { error: "Unsupported audio quality" });
          return;
        }
        const result = await provider.resolveStream(decodeURIComponent(match[1]), quality as AudioQuality);
        sendJson(response, "url" in result ? 200 : 403, result);
      }
    } catch (error) {
      if (error instanceof QQMusicSessionRejectedError) {
        sendJson(response, 401, { error: error.message, code: error.code });
      } else {
        sendJson(response, 500, { error: error instanceof Error ? error.message : "Unknown API error" });
      }
    }
  };
}
