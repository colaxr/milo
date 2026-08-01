# Docker 部署

## 环境要求

- Docker 24 或更高版本
- 已配置可转发到 `127.0.0.1:3000` 的反向代理
- 建议至少 2 GB 内存和 20 GB 可用磁盘

## 获取代码

```bash
git clone https://github.com/colaxr/milo.git
cd milo
```

## 创建配置

```bash
cp .env.mongo.example .env.mongo
cp .env.app.example .env.app
chmod 600 .env.mongo .env.app
```

编辑 `.env.mongo` 和 `.env.app`：

- 为三个密码分别设置长度至少 24 位的随机值
- `.env.mongo` 的 `MONGO_APP_PASSWORD` 必须与 `.env.app` 的 `MONGO_PASSWORD` 相同

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

重复执行时，如果网络或数据卷已经存在，可以忽略对应的已存在提示。

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

## 检查状态和日志

```bash
docker ps --filter name=milo
docker logs --tail 100 milo-mongo
docker logs --tail 100 milo-app
```

```bash
docker exec milo-app node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
```

## 备份数据库

```bash
mkdir -p backups
docker exec milo-mongo sh -c 'mongodump --archive --gzip --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' > "backups/milo-$(date +%F-%H%M%S).archive.gz"
```

将 `backups` 目录定期复制到 VPS 之外的存储位置。

## 恢复数据库

先停止应用，再恢复指定备份：

```bash
docker stop milo-app
docker exec -i milo-mongo sh -c 'mongorestore --archive --gzip --drop --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' < backups/<backup-file>.archive.gz
docker start milo-app
```

## 更新应用

```bash
git pull
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

## 更新数据库镜像

先完成数据库备份，再执行：

```bash
git pull
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

## 停止容器

```bash
docker stop milo-app milo-mongo
```

## 删除容器

```bash
docker rm -f milo-app milo-mongo
```

删除容器不会删除 `milo-mongo-data` 数据卷。不要在没有有效备份时删除数据库数据卷。
