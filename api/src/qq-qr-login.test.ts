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
