import assert from "node:assert/strict";
import test from "node:test";

import { hash33, parsePtuiCallback, QQQrLoginService } from "./qq-qr-login.js";

test("hash33 matches the QQ ptqrtoken algorithm", () => {
  assert.equal(hash33("abc"), 108966);
  assert.equal(hash33("abc", 5381), 193485963);
});

test("parses QQ QR callback states and redirect", () => {
  assert.deepEqual(parsePtuiCallback("ptuiCB('66','0','','0','二维码未失效。','')"), { code: 66, redirect: "" });
  assert.deepEqual(parsePtuiCallback("ptuiCB('0','0','https://example.test/?uin=1&ptsigx=sig&s_url=x','0','登录成功！','nick')"), {
    code: 0,
    redirect: "https://example.test/?uin=1&ptsigx=sig&s_url=x",
  });
});

test("creates an opaque QR session and reports a waiting poll", async () => {
  const calls: string[] = [];
  const fetchMock: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("ptqrshow")) {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "set-cookie": "qrsig=private-value; Path=/; HttpOnly" } });
    }
    return new Response("ptuiCB('66','0','','0','二维码未失效。','')", { status: 200 });
  };
  const service = new QQQrLoginService(fetchMock);
  const qr = await service.create();
  assert.match(qr.id, /^[0-9a-f-]{36}$/);
  assert.equal(qr.imageDataUrl, "data:image/png;base64,AQID");
  assert.equal((await service.poll(qr.id)).status, "waiting");
  assert.equal(calls.length, 2);
  assert.doesNotMatch(JSON.stringify(qr), /private-value/);
});

test("follows QQ authorization redirects and carries cookies until p_skey is issued", async () => {
  const requests: Array<{ url: string; cookie: string }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const cookie = new Headers(init?.headers).get("cookie") ?? "";
    requests.push({ url, cookie });
    if (path.includes("ptqrshow")) {
      return new Response(new Uint8Array([1]), { status: 200, headers: { "set-cookie": "qrsig=qr-cookie; Path=/" } });
    }
    if (path.includes("ptqrlogin")) {
      return new Response("ptuiCB('0','0','https://ssl.ptlogin2.graph.qq.com/check_sig?uin=123&ptsigx=sig','0','登录成功','')", { status: 200 });
    }
    if (path.endsWith("/check_sig")) {
      return new Response(null, { status: 302, headers: { location: "https://graph.qq.com/oauth2.0/login_jump" } });
    }
    if (path.endsWith("/login_jump")) {
      return new Response(null, { status: 302, headers: {
        location: "https://y.qq.com/portal/wx_redirect.html?login_type=1",
        "set-cookie": "p_skey=redirect-cookie; Path=/; Secure",
      } });
    }
    if (path.endsWith("/authorize")) {
      return new Response(null, { status: 302, headers: { location: "https://y.qq.com/portal/wx_redirect.html?code=oauth-code" } });
    }
    if (path.endsWith("/musicu.fcg")) {
      return Response.json({ code: 0, login: { code: 0, data: {
        musicid: "12345", musickey: "test-key", musickeyCreateTime: 1_800_000_000, keyExpiresIn: 7_776_000,
      } } });
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  };
  const service = new QQQrLoginService(fetchMock);
  const qr = await service.create();

  const result = await service.poll(qr.id);

  assert.equal(result.status, "complete");
  assert.equal(result.credentials?.accountId, "12345");
  assert.ok(requests.some((request) => request.url.includes("oauth2.0/authorize") && request.cookie.includes("p_skey=redirect-cookie")));
});
