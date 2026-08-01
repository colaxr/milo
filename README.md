# Docker 部署

## 环境要求

- Docker 24 或更高版本
- OpenSSL
- 建议至少 2 GB 内存和 20 GB 可用磁盘
- 已配置 HTTPS 反向代理，可转发到 `127.0.0.1:3000`

## 创建部署目录

```bash
mkdir -p ~/milo
cd ~/milo
umask 077
```

## 生成配置

```bash
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

数据库首次初始化后，不要直接修改 `MONGO_APP_PASSWORD` 或 `MONGO_PASSWORD`。两个文件中的应用数据库密码必须始终相同。

## 拉取镜像

```bash
docker pull ghcr.io/colaxr/milo:latest
docker pull ghcr.io/colaxr/milo-mongo:8.0.28
```

## 创建网络和数据卷

```bash
docker network create milo-network
docker volume create milo-mongo-data
```

如果网络已经存在，可以忽略 `already exists` 提示。`docker volume create` 可以重复执行，不会清空已有数据。

## 启动数据库

```bash
docker run -d \
  --name milo-mongo \
  --restart unless-stopped \
  --network milo-network \
  --env-file .env.mongo \
  -v milo-mongo-data:/data/db \
  ghcr.io/colaxr/milo-mongo:8.0.28
```

等待数据库状态变为 `healthy`：

```bash
docker inspect --format '{{.State.Health.Status}}' milo-mongo
```

## 启动应用

```bash
docker run -d \
  --name milo-app \
  --restart unless-stopped \
  --network milo-network \
  --env-file .env.app \
  -p 127.0.0.1:3000:3000 \
  ghcr.io/colaxr/milo:latest
```

反向代理上游地址：

```text
http://127.0.0.1:3000
```

## 检查运行状态

```bash
docker ps --filter name=milo
docker inspect --format '{{.State.Health.Status}}' milo-mongo
docker inspect --format '{{.State.Health.Status}}' milo-app
```

```bash
docker exec milo-app node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
```

## 查看日志

```bash
docker logs --tail 100 milo-mongo
docker logs --tail 100 milo-app
```

持续查看日志：

```bash
docker logs -f milo-app
```

## 更新应用

```bash
cd ~/milo
docker pull ghcr.io/colaxr/milo:latest
docker rm -f milo-app
docker run -d \
  --name milo-app \
  --restart unless-stopped \
  --network milo-network \
  --env-file .env.app \
  -p 127.0.0.1:3000:3000 \
  ghcr.io/colaxr/milo:latest
```

## 备份数据库

```bash
cd ~/milo
mkdir -p backups
docker exec milo-mongo sh -c 'mongodump --archive --gzip --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' > "backups/milo-$(date +%F-%H%M%S).archive.gz"
```

检查备份文件：

```bash
ls -lh backups/
```

将 `backups` 目录定期复制到 VPS 之外的存储位置。

## 恢复数据库

先停止应用，再恢复指定备份：

```bash
cd ~/milo
docker stop milo-app
BACKUP_FILE='backups/milo-YYYY-MM-DD-HHMMSS.archive.gz'
docker exec -i milo-mongo sh -c 'mongorestore --archive --gzip --drop --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' < "$BACKUP_FILE"
docker start milo-app
```

## 更新数据库镜像

先完成数据库备份，再执行：

```bash
cd ~/milo
docker pull ghcr.io/colaxr/milo-mongo:8.0.28
docker rm -f milo-mongo
docker run -d \
  --name milo-mongo \
  --restart unless-stopped \
  --network milo-network \
  --env-file .env.mongo \
  -v milo-mongo-data:/data/db \
  ghcr.io/colaxr/milo-mongo:8.0.28
```

## 回退应用镜像

从 GitHub Packages 选择之前的 `sha-` 标签，然后执行：

```bash
cd ~/milo
IMAGE_TAG='sha-xxxxxxx'
docker pull "ghcr.io/colaxr/milo:$IMAGE_TAG"
docker rm -f milo-app
docker run -d \
  --name milo-app \
  --restart unless-stopped \
  --network milo-network \
  --env-file .env.app \
  -p 127.0.0.1:3000:3000 \
  "ghcr.io/colaxr/milo:$IMAGE_TAG"
```

## 停止和重新启动

```bash
docker stop milo-app milo-mongo
docker start milo-mongo
docker start milo-app
```

## 删除容器

```bash
docker rm -f milo-app milo-mongo
```

删除容器不会删除数据库数据卷。

仅在确定不再需要数据库并且已有有效备份时，才删除数据卷：

```bash
docker volume rm milo-mongo-data
```
