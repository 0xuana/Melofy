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
    if (url.includes("/cgi-bin/xlogin")) {
      return new Response("xlogin", { status: 200, headers: { "set-cookie": "pt_login_sig=login-context; Path=/" } });
    }
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
  assert.equal(calls.length, 3);
  assert.match(calls[0]!, /cgi-bin\/xlogin\?/);
  const qrUrl = new URL(calls[1]!);
  assert.equal(qrUrl.searchParams.get("e"), "2");
  assert.equal(qrUrl.searchParams.get("l"), "M");
  assert.equal(qrUrl.searchParams.get("s"), "3");
  assert.equal(qrUrl.searchParams.get("d"), "72");
  assert.equal(qrUrl.searchParams.get("v"), "4");
  assert.equal(qrUrl.searchParams.get("u1"), "https://graph.qq.com/oauth2.0/login_jump");
  assert.match(calls[2]!, /login_sig=login-context/);
  assert.doesNotMatch(JSON.stringify(qr), /private-value/);
});

test("follows QQ authorization redirects and carries cookies until p_skey is issued", async () => {
  const requests: Array<{ url: string; cookie: string }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const cookie = new Headers(init?.headers).get("cookie") ?? "";
    requests.push({ url, cookie });
    if (path === "/cgi-bin/xlogin") {
      return new Response("xlogin", { status: 200, headers: { "set-cookie": "pt_login_sig=login-context; Path=/" } });
    }
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
        "set-cookie": "pt2gguin=o123; Path=/, p_uin=o123; Path=/, pt4_token=ticket; Path=/, p_skey_forbid=0; Path=/, p_skey=redirect-cookie; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/; Secure, p_skey=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure, pt_oauth_token=oauth; Path=/, pt_login_type=2; Path=/",
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
  assert.equal(result.credentials?.pSkey, "redirect-cookie");
  assert.ok(requests.some((request) => request.url.includes("ptqrlogin") && request.cookie.includes("pt_login_sig=login-context")));
  const checkSig = new URL(requests.find((request) => request.url.includes("/check_sig"))!.url);
  assert.equal(checkSig.searchParams.get("service"), "ptqrlogin");
  assert.equal(checkSig.searchParams.get("uin"), "123");
  assert.equal(checkSig.searchParams.get("ptsigx"), "sig");
  assert.equal(checkSig.searchParams.get("pt_3rd_aid"), "100497308");
  assert.equal(checkSig.searchParams.get("s_url"), "https://graph.qq.com/oauth2.0/login_jump");
  const authorizationRequest = requests.find((request) => request.url.includes("oauth2.0/authorize"));
  assert.ok(authorizationRequest?.cookie.includes("p_skey=redirect-cookie"));
  assert.ok(authorizationRequest?.cookie.includes("p_uin=o123"));
});

test("does not attempt OAuth when QQ does not issue a usable p_skey", async () => {
  const requests: Array<{ url: string; cookie: string; body: string }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const request = {
      url,
      cookie: new Headers(init?.headers).get("cookie") ?? "",
      body: typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "",
    };
    requests.push(request);
    if (path === "/cgi-bin/xlogin") {
      return new Response("xlogin", { status: 200, headers: { "set-cookie": "pt_login_sig=login-context; Path=/" } });
    }
    if (path.includes("ptqrshow")) {
      return new Response(new Uint8Array([1]), { status: 200, headers: { "set-cookie": "qrsig=qr-cookie; Path=/" } });
    }
    if (path.includes("ptqrlogin")) {
      return new Response("ptuiCB('0','0','https://ssl.ptlogin2.graph.qq.com/check_sig?uin=123&ptsigx=sig','0','登录成功','')", { status: 200 });
    }
    if (path.endsWith("/check_sig")) {
      return new Response(null, { status: 302, headers: {
        location: "https://graph.qq.com/oauth2.0/login_jump",
        "set-cookie": "uin=o123; Path=/, p_skey=; Path=/, pt_oauth_token=oauth-cookie; Path=/",
      } });
    }
    if (path.endsWith("/login_jump")) return new Response("login jump", { status: 200 });
    throw new Error(`Unexpected URL in test: ${url}`);
  };
  const service = new QQQrLoginService(fetchMock);
  const qr = await service.create();

  await assert.rejects(service.poll(qr.id), /QQ authorization did not provide a usable p_skey/);
  assert.equal(requests.some((request) => request.url.includes("oauth2.0/authorize")), false);
});

test("continues without p_skey and reports redacted authorization context if OAuth returns no code", async () => {
  const fetchMock: typeof fetch = async (input) => {
    const url = String(input);
    const path = new URL(url).pathname;
    if (path === "/cgi-bin/xlogin") {
      return new Response("xlogin", { status: 200, headers: { "set-cookie": "pt_login_sig=login-context; Path=/" } });
    }
    if (path.includes("ptqrshow")) {
      return new Response(new Uint8Array([1]), { status: 200, headers: { "set-cookie": "qrsig=qr-cookie; Path=/" } });
    }
    if (path.includes("ptqrlogin")) {
      return new Response("ptuiCB('0','0','https://ssl.ptlogin2.graph.qq.com/check_sig?uin=private-uin&ptsigx=private-signature','0','登录成功','')", { status: 200 });
    }
    if (path.endsWith("/check_sig")) {
      return new Response(null, { status: 302, headers: {
        location: "https://graph.qq.com/oauth2.0/login_jump",
        "set-cookie": "pt2gguin=private-account; Path=/, p_uin=private-account; Path=/, pt4_token=private-ticket; Path=/, p_skey_forbid=1; Path=/, p_skey=usable-private-skey; Path=/, pt_oauth_token=private-oauth; Path=/, pt_login_type=2; Path=/",
      } });
    }
    if (path.endsWith("/login_jump")) {
      return new Response("login jump", { status: 200 });
    }
    if (path.endsWith("/authorize")) return new Response(null, { status: 302, headers: {
      location: "https://graph.qq.com/oauth2.0/authorize?error=100010&state=private-state&error_description=private-description",
    } });
    throw new Error(`Unexpected URL in test: ${url}`);
  };
  const service = new QQQrLoginService(fetchMock);
  const qr = await service.create();

  await assert.rejects(service.poll(qr.id), (reason: unknown) => {
    assert.ok(reason instanceof Error);
    assert.match(reason.message, /QQ authorization did not return an OAuth code \(status=302, redirect=host=graph\.qq\.com,path=\/oauth2\.0\/authorize,query-keys=error,state,error_description,error-code=100010, code=missing/);
    assert.doesNotMatch(reason.message, /usable-private-skey|private-account|private-ticket|private-oauth|private-uin|private-signature|private-state|private-description/);
    return true;
  });
});
