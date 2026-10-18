async function json(path) {
  const response = await fetch(path);
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || body.message || `请求失败 (${response.status})`);
    error.status = response.status;
    if (typeof body.code === "number") error.code = body.code;
    if (typeof body.reason === "string") error.reason = body.reason;
    if (typeof body.trackId === "string") error.trackId = body.trackId;
    throw error;
  }
  return body;
}

export async function loadLikedTracks() {
  const tracks = new Map();
  const cursors = new Set();
  let cursor = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page = await json(`/api/playlists/liked/tracks?${query}`);
    page.items.forEach((track) => tracks.set(track.id, track));
    if (page.nextCursor && cursors.has(page.nextCursor)) throw new Error("QQ 音乐返回了重复分页游标");
    cursor = page.nextCursor;
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...tracks.values()];
}

export async function loadPlaylists() {
  return (await json("/api/playlists")).playlists;
}

export async function loadPlaylistTracks(playlist) {
  if (playlist.kind === "liked") return loadLikedTracks();
  const tracks = new Map();
  const cursors = new Set();
  let cursor = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (playlist.dirId) query.set("dirId", playlist.dirId);
    if (cursor) query.set("cursor", cursor);
    const page = await json(`/api/playlists/${encodeURIComponent(playlist.id)}/tracks?${query}`);
    page.items.forEach((track) => tracks.set(track.id, track));
    if (page.nextCursor && cursors.has(page.nextCursor)) throw new Error("QQ 音乐返回了重复分页游标");
    cursor = page.nextCursor;
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...tracks.values()];
}

export function resolveStream(trackId, quality) {
  return json(`/api/tracks/${encodeURIComponent(trackId)}/stream?quality=${quality}`);
}

export function loadLyrics(trackId) {
  return json(`/api/tracks/${encodeURIComponent(trackId)}/lyrics`);
}

export async function loadSession() {
  return (await json("/api/session")).session;
}

export async function loadAccountProfile() {
  return (await json("/api/account/profile")).profile;
}

export function endSession() {
  return fetch("/api/session", { method: "DELETE" }).then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "退出登录失败");
    return body;
  });
}

export function createLoginQR(provider = "qq") {
  return fetch(`/api/auth/${encodeURIComponent(provider)}/qr`, { method: "POST" }).then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `无法获取${provider === "wechat" ? "微信" : "QQ"}登录二维码`);
    return body;
  });
}

export function pollLoginQR(provider, id) {
  return json(`/api/auth/${encodeURIComponent(provider)}/qr/${encodeURIComponent(id)}`);
}
