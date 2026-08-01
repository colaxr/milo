import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Milo application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Milo 私信<\/title>/i);
  assert.match(html, /正在准备 Milo/);
  assert.match(html, /class="session-loading"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("keeps local security wiring and a deployment-only public README", async () => {
  const [chatApp, secureStorage, localAuth, dockerfile, readme] = await Promise.all([
    readFile(new URL("../app/chat-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/secure-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/local-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(secureStorage, /AES-GCM/);
  assert.match(secureStorage, /extractable|false,/);
  assert.match(secureStorage, /additionalData/);
  assert.match(localAuth, /PBKDF2/);
  assert.match(localAuth, /SHA-256/);
  assert.match(chatApp, /conversations:\$\{currentUser\.username\}/);
  assert.match(chatApp, /currentUser\?\.role === "admin"/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /--hostname", "0\.0\.0\.0"/);
  assert.match(readme, /docker build -t milo:latest/);
  assert.match(readme, /docker run -d/);
  assert.match(readme, /docker logs -f milo/);
  assert.doesNotMatch(readme, /当前能力|功能|私信|端到端加密|管理员账户/);
});
