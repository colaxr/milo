# Docker 部署

## 环境要求

- Docker 24 或更高版本
- 可用端口 `3000`

## 获取代码

```bash
git clone https://github.com/<owner>/<repository>.git
cd <repository>
```

## 构建镜像

```bash
docker build -t milo:latest .
```

## 启动容器

```bash
docker run -d \
  --name milo \
  --restart unless-stopped \
  -p 3000:3000 \
  milo:latest
```

部署完成后访问：

```text
http://<VPS-IP>:3000
```

## 查看状态和日志

```bash
docker ps --filter name=milo
docker logs -f milo
docker inspect --format '{{json .State.Health}}' milo
```

## 更新部署

```bash
git pull
docker build -t milo:latest .
docker rm -f milo
docker run -d \
  --name milo \
  --restart unless-stopped \
  -p 3000:3000 \
  milo:latest
```

## 停止并删除容器

```bash
docker rm -f milo
```
