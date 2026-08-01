# Docker Run 部署

## 环境要求

- Docker 24 或更高版本
- OpenSSL
- 建议至少 2 GB 内存和 20 GB 可用磁盘
- 已配置 HTTPS 反向代理，可转发到 `127.0.0.1:3000`

## 生成配置

```bash
mkdir -p ~/milo
cd ~/milo
umask 077

MONGO_ROOT_PASSWORD="$(openssl rand -hex 32)"
MONGO_APP_PASSWORD="$(openssl rand -hex 32)"
ADMIN_PASSWORD="$(openssl rand -hex 32)"

printf '%s\n' \
  'MONGO_INITDB_ROOT_USERNAME=milo_root' \
  "MONGO_INITDB_ROOT_PASSWORD=$MONGO_ROOT_PASSWORD" \
  'MONGO_INITDB_DATABASE=milo' \
  'MONGO_APP_USERNAME=milo_app' \
  "MONGO_APP_PASSWORD=$MONGO_APP_PASSWORD" \
  > .env.mongo

printf '%s\n' \
  'MONGO_HOST=milo-mongo' \
  'MONGO_PORT=27017' \
  'MONGO_DATABASE=milo' \
  'MONGO_USERNAME=milo_app' \
  "MONGO_PASSWORD=$MONGO_APP_PASSWORD" \
  'ADMIN_USERNAME=admin' \
  'ADMIN_DISPLAY_NAME=ADMIN' \
  "ADMIN_PASSWORD=$ADMIN_PASSWORD" \
  'SESSION_TTL_DAYS=30' \
  'SESSION_COOKIE_SECURE=true' \
  > .env.app

chmod 600 .env.mongo .env.app
unset MONGO_ROOT_PASSWORD MONGO_APP_PASSWORD ADMIN_PASSWORD
```

查看首次登录密码：

```bash
grep '^ADMIN_PASSWORD=' .env.app
```

## 创建 Docker 网络和数据卷

```bash
docker network create milo-network
docker volume create milo-mongo-data
```

## Docker Run 数据库

```bash
docker run -d \
  --pull=always \
  --name milo-mongo \
  --restart unless-stopped \
  --network milo-network \
  --env-file ~/milo/.env.mongo \
  -v milo-mongo-data:/data/db \
  ghcr.io/colaxr/milo-mongo:8.0.28
```

## Docker Run 应用

```bash
docker run -d \
  --pull=always \
  --name milo-app \
  --restart unless-stopped \
  --network milo-network \
  --env-file ~/milo/.env.app \
  -p 127.0.0.1:3000:3000 \
  ghcr.io/colaxr/milo:latest
```

反向代理上游地址：

```text
http://127.0.0.1:3000
```

## 后续更新 Docker Run

GitHub 最新镜像生成完成后，执行：

```bash
docker rm -f milo-app

docker run -d \
  --pull=always \
  --name milo-app \
  --restart unless-stopped \
  --network milo-network \
  --env-file ~/milo/.env.app \
  -p 127.0.0.1:3000:3000 \
  ghcr.io/colaxr/milo:latest
```

数据库容器和 `milo-mongo-data` 数据卷不需要删除。
