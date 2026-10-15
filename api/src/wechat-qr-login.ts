import { randomUUID } from "node:crypto";

import type { QRLoginStatus } from "./qq-qr-login.js";
import type { PersistentQQMusicCredentials } from "./session-store.js";

interface PendingLogin {
  readonly uuid: string;
  readonly expiresAt: number;
  scanned: boolean;
}

interface LoginResponse {
  readonly status: QRLoginStatus;
  readonly credentials?: PersistentQQMusicCredentials;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function responseCode(value: string): number {
  const match = /window\.wx_errcode\s*=\s*(\d+)\s*;/.exec(value);
  const code = Number.parseInt(match?.[1] ?? "", 10);
  if (!Number.isSafeInteger(code)) throw new Error("WeChat returned an invalid QR login status");
  return code;
}

function responseWxCode(value: string): string {
  return /window\.wx_code\s*=\s*'([^']*)'\s*;/.exec(value)?.[1] ?? "";
}

function statusFor(code: number): QRLoginStatus {
  if (code === 408) return "waiting";
  if (code === 404) return "scanned";
  if (code === 402) return "expired";
  if (code === 403) return "refused";
  if (code === 405) return "complete";
  throw new Error(`Unknown WeChat QR status ${code}`);
}

export class WeChatQrLoginService {
  readonly #fetch: typeof globalThis.fetch;
  readonly #pending = new Map<string, PendingLogin>();

  constructor(fetchImplementation: typeof globalThis.fetch = globalThis.fetch) {
    this.#fetch = fetchImplementation;
  }

  async create(): Promise<{ id: string; imageDataUrl: string; expiresAt: string }> {
    const loginPage = new URL("https://open.weixin.qq.com/connect/qrconnect");
    const loginState = randomUUID().replaceAll("-", "");
    const loginParams = {
      appid: "wx48db31d50e334801",
      redirect_uri: "https://y.qq.com/portal/wx_redirect.html?login_type=2&surl=https://y.qq.com/",
      response_type: "code",
      scope: "snsapi_login",
      state: loginState,
      href: "https://y.qq.com/mediastyle/music_v17/src/css/popup_wechat.css#wechat_redirect",
    };
    for (const [key, value] of Object.entries(loginParams)) loginPage.searchParams.set(key, value);

    const pageResponse = await this.#fetch(loginPage, { headers: this.#headers("https://y.qq.com/") });
    if (!pageResponse.ok) throw new Error(`WeChat QR request failed with HTTP ${pageResponse.status}`);
    const page = await pageResponse.text();
    const uuid = /\/connect\/qrcode\/([^"'<>\s]+)/.exec(page)?.[1]
      ?? /(?:[?&]|\b)uuid=([^&"'<>\s]+)/.exec(page)?.[1];
    if (!uuid) throw new Error("WeChat QR response did not contain an identifier");

    const imageResponse = await this.#fetch(`https://open.weixin.qq.com/connect/qrcode/${encodeURIComponent(uuid)}`, {
      headers: this.#headers("https://open.weixin.qq.com/connect/qrconnect"),
    });
    if (!imageResponse.ok) throw new Error(`WeChat QR image request failed with HTTP ${imageResponse.status}`);
    const imageType = imageResponse.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    if (!imageType.startsWith("image/")) throw new Error("WeChat QR response was not an image");

    const id = randomUUID();
    const expiresAt = Date.now() + 180_000;
    this.#pending.set(id, { uuid, expiresAt, scanned: false });
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    return { id, imageDataUrl: `data:${imageType};base64,${bytes.toString("base64")}`, expiresAt: new Date(expiresAt).toISOString() };
  }

  async poll(id: string): Promise<LoginResponse> {
    const pending = this.#pending.get(id);
    if (!pending || Date.now() >= pending.expiresAt) {
      this.#pending.delete(id);
      return { status: "expired" };
    }

    const url = new URL("https://lp.open.weixin.qq.com/connect/l/qrconnect");
    url.searchParams.set("uuid", pending.uuid);
    url.searchParams.set("_", String(Date.now()));
    if (pending.scanned) url.searchParams.set("last", "404");
    const response = await this.#fetch(url, { headers: this.#headers("https://open.weixin.qq.com/") });
    if (!response.ok) throw new Error(`WeChat QR polling failed with HTTP ${response.status}`);

    const body = await response.text();
    const status = statusFor(responseCode(body));
    if (status === "scanned") {
      pending.scanned = true;
      return { status };
    }
    if (status === "waiting") return { status };
    this.#pending.delete(id);
    if (status !== "complete") return { status };

    const code = responseWxCode(body);
    if (!code) throw new Error("WeChat confirmed QR login without an authorization code");
    return { status, credentials: await this.#exchangeCode(code) };
  }

  async #exchangeCode(code: string): Promise<PersistentQQMusicCredentials> {
    const response = await this.#fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
      method: "POST",
      headers: { ...this.#headers("https://y.qq.com/"), "content-type": "application/json" },
      body: JSON.stringify({
        comm: {
          cv: 13020508,
          v: 13020508,
          ct: "11",
          tmeAppID: "qqmusic",
          format: "json",
          inCharset: "utf-8",
          outCharset: "utf-8",
          uid: "0",
          tmeLoginType: "1",
        },
        "music.login.LoginServer.Login": {
          module: "music.login.LoginServer",
          method: "Login",
          param: { code, strAppid: "wx48db31d50e334801" },
        },
      }),
    });
    if (!response.ok) throw new Error(`QQMusic WeChat credential exchange failed with HTTP ${response.status}`);

    const payload = record(await response.json());
    const login = record(payload["music.login.LoginServer.Login"]);
    if (payload.code !== undefined && payload.code !== 0) throw new Error(`QQMusic rejected WeChat login with code ${String(payload.code)}`);
    if (login.code !== undefined && login.code !== 0) throw new Error(`QQMusic rejected WeChat login with code ${String(login.code)}`);
    const data = record(login.data);
    const accountId = String(data.str_musicid ?? data.musicid ?? data.uin ?? "");
    const musicKey = typeof data.musickey === "string" ? data.musickey : typeof data.music_key === "string" ? data.music_key : "";
    if (!accountId || !musicKey) throw new Error("QQMusic WeChat login response omitted credentials");
    const createdAt = typeof data.musickeyCreateTime === "number" ? data.musickeyCreateTime : Math.floor(Date.now() / 1000);
    const lifetime = typeof data.keyExpiresIn === "number" ? data.keyExpiresIn : 90 * 24 * 60 * 60;

    return {
      accountId,
      accountType: "wx",
      musicKey,
      expiresAt: new Date((createdAt + lifetime) * 1000),
      ...(typeof data.refresh_key === "string" && data.refresh_key ? { refreshKey: data.refresh_key } : {}),
      ...(typeof data.refresh_token === "string" && data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      ...(typeof data.access_token === "string" && data.access_token ? { accessToken: data.access_token } : {}),
      ...(typeof data.openid === "string" && data.openid ? { openId: data.openid } : {}),
      ...(typeof data.unionid === "string" && data.unionid ? { unionId: data.unionid } : {}),
      ...(typeof data.str_musicid === "string" && data.str_musicid ? { strMusicId: data.str_musicid } : {}),
    };
  }

  #headers(referer: string): Record<string, string> {
    return {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
      origin: "https://y.qq.com",
      referer,
    };
  }
}
