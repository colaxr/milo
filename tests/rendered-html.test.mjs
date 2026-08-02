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
  assert.match(html, /<title>Milo/);
  assert.match(html, /class="session-loading"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("keeps SQLite, encrypted storage, auth, and single-container deployment wiring", async () => {
  const [chatApp, secureStorage, auth, sqlite, recordsRoute, setupRoute, usersRoute, usersItemRoute, apiClient, dockerfile, workflow, readme, packageJson, layout] = await Promise.all([
    readFile(new URL("../app/chat-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/secure-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/sqlite.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/records/[name]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/setup/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/users/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/users/[username]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/publish-images.yml", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(secureStorage, /AES-GCM/);
  assert.match(secureStorage, /PBKDF2/);
  assert.match(secureStorage, /window\.isSecureContext/);
  assert.match(secureStorage, /remoteAdditionalData/);
  assert.match(auth, /scrypt/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /HttpOnly; SameSite=Strict/);
  assert.match(auth, /x-forwarded-proto/);
  assert.match(auth, /new URL\(request\.url\)\.protocol/);
  assert.match(auth, /BEGIN IMMEDIATE/);
  assert.match(sqlite, /DatabaseSync/);
  assert.match(sqlite, /PRAGMA journal_mode = WAL/);
  assert.match(sqlite, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(sqlite, /CREATE TABLE IF NOT EXISTS sessions/);
  assert.match(sqlite, /CREATE TABLE IF NOT EXISTS records/);
  assert.match(sqlite, /idx_sessions_expires_at/);
  assert.match(sqlite, /PRAGMA optimize/);
  assert.match(recordsRoute, /ciphertext/);
  assert.match(recordsRoute, /ON CONFLICT\(username, name\) DO UPDATE/);
  assert.match(setupRoute, /createFirstAdmin/);
  assert.match(setupRoute, /sessionCookie/);
  assert.match(usersRoute, /searchUsers/);
  assert.match(usersRoute, /searchParams\.get\("q"\)/);
  assert.match(usersItemRoute, /export async function PATCH/);
  assert.match(usersItemRoute, /export async function DELETE/);
  assert.match(apiClient, /searchRemoteUsers/);
  assert.match(apiClient, /updateRemoteUser/);
  assert.match(apiClient, /deleteRemoteUser/);
  assert.match(chatApp, /fetchInitializationStatus/);
  assert.match(chatApp, /setupRemote/);
  assert.match(chatApp, /HTTP 测试模式：已登录/);
  assert.match(chatApp, /conversations:\$\{currentUser\.username\}/);
  assert.match(chatApp, /currentUser\?\.role === "admin"/);
  assert.match(chatApp, /const initialConversations: Conversation\[\] = \[\];/);
  assert.match(chatApp, /removeLegacyDemoConversations/);
  assert.match(chatApp, /暂无对话/);
  assert.match(chatApp, /暂无联系人/);
  assert.doesNotMatch(chatApp, /林知夏|周予安|陈默|唐小满|陆屿|@zhixia|@xiaoman/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /\/api\/health/);
  assert.match(dockerfile, /--hostname", "0\.0\.0\.0"/);
  assert.match(dockerfile, /SQLITE_PATH=\/app\/data\/milo\.db/);
  assert.match(dockerfile, /VOLUME \["\/app\/data"\]/);
  assert.match(dockerfile, /USER node/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /linux\/amd64,linux\/arm64/);
  assert.match(workflow, /ghcr\.io\/\$\{\{ github\.repository \}\}/);
  assert.doesNotMatch(workflow, /milo-mongo|Dockerfile\.mongo/);
  assert.match(readme, /ghcr\.io\/colaxr\/milo:latest/);
  assert.match(readme, /-p 3000:3000/);
  assert.match(readme, /http:\/\/<VPS-IP>:3000/);
  assert.doesNotMatch(readme, /127\.0\.0\.1:3000/);
  assert.match(readme, /docker run -d/);
  assert.match(readme, /--pull=always/);
  assert.match(readme, /docker rm -f milo/);
  assert.match(readme, /milo-data:\/app\/data/);
  assert.match(readme, /创建首个管理员账户/);
  assert.doesNotMatch(readme, /MongoDB|milo-mongo|MONGO_|openssl/);
  assert.doesNotMatch(packageJson, /"mongodb"/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(layout, /userScalable: false/);
  assert.doesNotMatch(readme, /Caddy|milo-proxy|chat\.example\.com/);
  assert.doesNotMatch(readme, /git clone|git pull|docker build|docker pull/);
});
