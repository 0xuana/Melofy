import { inspectInstalledProfile } from "@qqmusic-web/installed-profile-adapter";
import type { AudioQuality, QQMusicProvider } from "@qqmusic-web/provider";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { QQQrLoginService } from "./qq-qr-login.js";
import type { SessionManager } from "./session-manager.js";

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

interface AuthenticationServices {
  readonly qrLogin: QQQrLoginService;
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
        if (result.credentials) authentication.sessions.setCredentials(result.credentials);
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
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Unknown API error" });
    }
  };
}
