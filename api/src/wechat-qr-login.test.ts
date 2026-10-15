import assert from "node:assert/strict";
import test from "node:test";

import { WeChatQrLoginService } from "./wechat-qr-login.js";

test("creates an opaque WeChat QR session and returns the image data URL", async () => {
  const calls: string[] = [];
  const fetchMock: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/connect/qrconnect?")) {
      assert.match(url, /scope=snsapi_login/);
      assert.match(url, /login_type%3D2/);
      return new Response('<img class="qrcode lightBorder" src="/connect/qrcode/wx-uuid-1" />', { status: 200 });
    }
    if (url === "https://open.weixin.qq.com/connect/qrcode/wx-uuid-1") {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    return new Response("window.wx_errcode=408;window.wx_code='';", { status: 200 });
  };

  const service = new WeChatQrLoginService(fetchMock);
  const qr = await service.create();
  assert.match(qr.id, /^[0-9a-f-]{36}$/);
  assert.equal(qr.imageDataUrl, "data:image/jpeg;base64,AQID");
  assert.equal((await service.poll(qr.id)).status, "waiting");
  assert.equal(calls.length, 3);
  assert.doesNotMatch(JSON.stringify(qr), /wx-uuid-1/);
});

test("reports scan state and exchanges confirmed WeChat code for QQ Music credentials", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let pollCount = 0;
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(init ? { url, init } : { url });
    if (url.includes("/connect/qrconnect?")) return new Response('<img src="/connect/qrcode/wx-uuid-2" />', { status: 200 });
    if (url.includes("/connect/qrcode/")) return new Response(new Uint8Array([7]), { status: 200, headers: { "content-type": "image/jpeg" } });
    if (url.includes("lp.open.weixin.qq.com")) {
      pollCount++;
      if (pollCount === 1) return new Response("window.wx_errcode=404;window.wx_code='';", { status: 200 });
      return new Response("window.wx_errcode=405;window.wx_code='confirmed-code';", { status: 200 });
    }
    return Response.json({ "music.login.LoginServer.Login": { code: 0, data: {
      str_musicid: "123456",
      musickey: "W_X_example",
      refresh_key: "refresh-key",
      refresh_token: "refresh-token",
      nick: "Demo User",
    } } });
  };

  const service = new WeChatQrLoginService(fetchMock);
  const qr = await service.create();
  assert.equal((await service.poll(qr.id)).status, "scanned");
  const result = await service.poll(qr.id);
  assert.equal(result.status, "complete");
  assert.deepEqual(result.credentials, {
    accountId: "123456",
    accountType: "wx",
    musicKey: "W_X_example",
    expiresAt: result.credentials?.expiresAt,
    refreshKey: "refresh-key",
    refreshToken: "refresh-token",
    strMusicId: "123456",
  });
  assert.ok(result.credentials?.expiresAt instanceof Date);

  const pollCall = calls.filter((call) => call.url.includes("lp.open.weixin.qq.com")).at(-1);
  assert.match(pollCall?.url ?? "", /last=404/);
  const exchange = calls.find((call) => call.url.includes("musicu.fcg"));
  const body = JSON.parse(String(exchange?.init?.body));
  assert.equal(body.comm.tmeLoginType, "1");
  assert.equal(body["music.login.LoginServer.Login"].param.code, "confirmed-code");
  assert.equal(body["music.login.LoginServer.Login"].param.strAppid, "wx48db31d50e334801");
});

test("returns expired and refused WeChat QR states", async () => {
  const statuses = [402, 403];
  const fetchMock: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("/connect/qrconnect?")) return new Response('<img src="/connect/qrcode/wx-uuid-3" />', { status: 200 });
    if (url.includes("/connect/qrcode/")) return new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/jpeg" } });
    return new Response(`window.wx_errcode=${statuses.shift()};window.wx_code='';`, { status: 200 });
  };
  const service = new WeChatQrLoginService(fetchMock);
  const expired = await service.create();
  assert.equal((await service.poll(expired.id)).status, "expired");
  const refused = await service.create();
  assert.equal((await service.poll(refused.id)).status, "refused");
});
