import { randomUUID } from "node:crypto";

import type { PersistentQQMusicCredentials } from "./session-store.js";

export type QRLoginStatus = "waiting" | "scanned" | "expired" | "refused" | "complete";

interface PendingLogin {
  readonly qrsig: string;
  readonly expiresAt: number;
}

interface LoginResponse {
  readonly status: QRLoginStatus;
  readonly credentials?: PersistentQQMusicCredentials;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function hash33(value: string, initial = 0): number {
  let hash = initial;
  for (const character of value) hash = ((hash << 5) + hash + character.charCodeAt(0)) & 0x7fffffff;
  return hash;
}

export function parsePtuiCallback(value: string): { code: number; redirect: string } {
  const match = /ptuiCB\((.*)\)/.exec(value);
  const args = match?.[1]?.match(/'((?:\\.|[^'])*)'/g)?.map((item) => item.slice(1, -1)) ?? [];
  const code = Number.parseInt(args[0] ?? "", 10);
  if (!Number.isSafeInteger(code)) throw new Error("QQ returned an invalid QR login status");
  return { code, redirect: args[2] ?? "" };
}

function setCookies(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  return extended.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
}

function cookieMap(values: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const value of values) {
    const pair = value.split(";", 1)[0];
    const separator = pair?.indexOf("=") ?? -1;
    if (pair && separator > 0) result.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return result;
}

function cookieHeader(cookies: ReadonlyMap<string, string>): string {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

function statusFor(code: number): QRLoginStatus {
  if (code === 66) return "waiting";
  if (code === 67) return "scanned";
  if (code === 65) return "expired";
  if (code === 68) return "refused";
  if (code === 0) return "complete";
  throw new Error(`Unknown QQ QR status ${code}`);
}

export class QQQrLoginService {
  readonly #fetch: typeof globalThis.fetch;
  readonly #pending = new Map<string, PendingLogin>();

  constructor(fetchImplementation: typeof globalThis.fetch = globalThis.fetch) {
    this.#fetch = fetchImplementation;
  }

  async create(): Promise<{ id: string; imageDataUrl: string; expiresAt: string }> {
    const url = new URL("https://ssl.ptlogin2.qq.com/ptqrshow");
    for (const [key, value] of Object.entries({ appid: "716027609", e: "2", l: "M", s: "3", d: "72", v: "4", t: String(Math.random()), daid: "383", pt_3rd_aid: "100497308" })) url.searchParams.set(key, value);
    const response = await this.#fetch(url, { headers: { referer: "https://xui.ptlogin2.qq.com/" }, redirect: "manual" });
    if (!response.ok) throw new Error(`QQ QR request failed with HTTP ${response.status}`);
    const qrsig = cookieMap(setCookies(response.headers)).get("qrsig");
    if (!qrsig) throw new Error("QQ QR response did not include qrsig");
    const id = randomUUID();
    const expiresAt = Date.now() + 120_000;
    this.#pending.set(id, { qrsig, expiresAt });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { id, imageDataUrl: `data:image/png;base64,${bytes.toString("base64")}`, expiresAt: new Date(expiresAt).toISOString() };
  }

  async poll(id: string): Promise<LoginResponse> {
    const pending = this.#pending.get(id);
    if (!pending || Date.now() >= pending.expiresAt) {
      this.#pending.delete(id);
      return { status: "expired" };
    }
    const url = new URL("https://ssl.ptlogin2.qq.com/ptqrlogin");
    const params = {
      u1: "https://graph.qq.com/oauth2.0/login_jump", ptqrtoken: String(hash33(pending.qrsig)), ptredirect: "0",
      h: "1", t: "1", g: "1", from_ui: "1", ptlang: "2052", action: `0-0-${Date.now()}`,
      js_ver: "20102616", js_type: "1", pt_uistyle: "40", aid: "716027609", daid: "383",
      pt_3rd_aid: "100497308", has_onekey: "1",
    };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await this.#fetch(url, { headers: { cookie: `qrsig=${pending.qrsig}`, referer: "https://xui.ptlogin2.qq.com/" } });
    if (!response.ok) throw new Error(`QQ QR polling failed with HTTP ${response.status}`);
    const parsed = parsePtuiCallback(await response.text());
    const status = statusFor(parsed.code);
    if (status !== "complete") {
      if (status === "expired" || status === "refused") this.#pending.delete(id);
      return { status };
    }
    this.#pending.delete(id);
    return { status, credentials: await this.#authorize(parsed.redirect) };
  }

  async #authorize(redirect: string): Promise<PersistentQQMusicCredentials> {
    const redirectUrl = new URL(redirect);
    const uin = redirectUrl.searchParams.get("uin");
    const sigx = redirectUrl.searchParams.get("ptsigx");
    if (!uin || !sigx) throw new Error("QQ login redirect omitted uin or ptsigx");

    const checkUrl = new URL("https://ssl.ptlogin2.graph.qq.com/check_sig");
    const checkParams = { uin, pttype: "1", service: "ptqrlogin", nodirect: "0", ptsigx: sigx, s_url: "https://graph.qq.com/oauth2.0/login_jump", ptlang: "2052", ptredirect: "100", aid: "716027609", daid: "383", j_later: "0", low_login_hour: "0", regmaster: "0", pt_login_type: "3", pt_aid: "0", pt_aaid: "16", pt_light: "0", pt_3rd_aid: "100497308" };
    for (const [key, value] of Object.entries(checkParams)) checkUrl.searchParams.set(key, value);
    const checked = await this.#fetch(checkUrl, { headers: { referer: "https://xui.ptlogin2.qq.com/" }, redirect: "manual" });
    const cookies = cookieMap(setCookies(checked.headers));
    const pSkey = cookies.get("p_skey");
    if (!pSkey) throw new Error("QQ authorization did not provide p_skey");

    const form = new URLSearchParams({ response_type: "code", client_id: "100497308", redirect_uri: "https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/", scope: "get_user_info,get_app_friends", state: "state", switch: "", from_ptlogin: "1", src: "1", update_auth: "1", openapi: "1010_1030", g_tk: String(hash33(pSkey, 5381)), auth_time: String(Date.now()), ui: randomUUID() });
    const authorized = await this.#fetch("https://graph.qq.com/oauth2.0/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader(cookies) }, body: form, redirect: "manual" });
    const code = new URL(authorized.headers.get("location") ?? "", "https://y.qq.com/").searchParams.get("code");
    if (!code) throw new Error("QQ authorization did not return an OAuth code");

    const musicResponse = await this.#fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://y.qq.com", referer: "https://y.qq.com/" },
      body: JSON.stringify({ comm: { ct: 24, cv: 0, format: "json", tmeLoginType: 2 }, login: { module: "QQConnectLogin.LoginServer", method: "QQLogin", param: { code } } }),
    });
    if (!musicResponse.ok) throw new Error(`QQMusic credential exchange failed with HTTP ${musicResponse.status}`);
    const payload = record(await musicResponse.json());
    const login = record(payload.login);
    if (payload.code !== 0 || login.code !== 0) throw new Error(`QQMusic rejected login with code ${String(login.code ?? payload.code)}`);
    const data = record(login.data);
    const accountId = String(data.musicid ?? data.str_musicid ?? "");
    const musicKey = typeof data.musickey === "string" ? data.musickey : "";
    if (!accountId || !musicKey) throw new Error("QQMusic login response omitted credentials");
    const createdAt = typeof data.musickeyCreateTime === "number" ? data.musickeyCreateTime : Math.floor(Date.now() / 1000);
    const lifetime = typeof data.keyExpiresIn === "number" ? data.keyExpiresIn : 90 * 24 * 60 * 60;
    return {
      accountId, accountType: "qq", musicKey, expiresAt: new Date((createdAt + lifetime) * 1000),
      ...(typeof data.refresh_key === "string" && data.refresh_key ? { refreshKey: data.refresh_key } : {}),
      ...(typeof data.refresh_token === "string" && data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      ...(typeof data.access_token === "string" && data.access_token ? { accessToken: data.access_token } : {}),
      ...(typeof data.openid === "string" && data.openid ? { openId: data.openid } : {}),
      ...(typeof data.unionid === "string" && data.unionid ? { unionId: data.unionid } : {}),
      ...(typeof data.str_musicid === "string" && data.str_musicid ? { strMusicId: data.str_musicid } : {}),
    };
  }
}
