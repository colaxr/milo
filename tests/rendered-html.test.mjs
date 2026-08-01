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

test("keeps database, encrypted storage, auth, and deployment wiring", async () => {
  const [chatApp, secureStorage, auth, mongo, recordsRoute, dockerfile, mongoDockerfile, workflow, readme] = await Promise.all([
    readFile(new URL("../app/chat-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/secure-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/mongodb.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/records/[name]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile.mongo", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/publish-images.yml", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(secureStorage, /AES-GCM/);
  assert.match(secureStorage, /PBKDF2/);
  assert.match(secureStorage, /remoteAdditionalData/);
  assert.match(auth, /scrypt/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /HttpOnly; SameSite=Strict/);
  assert.match(mongo, /MongoClient/);
  assert.match(mongo, /retryWrites: true/);
  assert.match(mongo, /expireAfterSeconds: 0/);
  assert.match(recordsRoute, /ciphertext/);
  assert.match(recordsRoute, /username: user\.username/);
  assert.match(chatApp, /conversations:\$\{currentUser\.username\}/);
  assert.match(chatApp, /currentUser\?\.role === "admin"/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /\/api\/health/);
  assert.match(dockerfile, /--hostname", "0\.0\.0\.0"/);
  assert.match(mongoDockerfile, /mongo:8\.0\.28-noble/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /linux\/amd64,linux\/arm64/);
  assert.match(workflow, /ghcr\.io\/\$\{\{ github\.repository \}\}/);
  assert.match(workflow, /ghcr\.io\/\$\{\{ github\.repository_owner \}\}\/milo-mongo/);
  assert.match(readme, /docker pull ghcr\.io\/colaxr\/milo:latest/);
  assert.match(readme, /docker pull ghcr\.io\/colaxr\/milo-mongo:8\.0\.28/);
  assert.match(readme, /openssl rand -hex 32/);
  assert.match(readme, /MONGO_APP_PASSWORD=\$MONGO_APP_PASSWORD/);
  assert.match(readme, /-p 127\.0\.0\.1:3000:3000/);
  assert.match(readme, /docker run -d/);
  assert.match(readme, /milo-mongo-data:\/data\/db/);
  assert.match(readme, /mongodump --archive --gzip/);
  assert.match(readme, /BACKUP_FILE=/);
  assert.match(readme, /IMAGE_TAG='sha-/);
  assert.doesNotMatch(readme, /Caddy|milo-proxy|chat\.example\.com/);
  assert.doesNotMatch(readme, /git clone|git pull|docker build/);
  assert.doesNotMatch(readme, /当前能力|功能|私信|端到端加密|管理员账户/);
});
