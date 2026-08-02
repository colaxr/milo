# Docker Run 部署

## 环境要求

- Docker 24 或更高版本
- 可用端口 `3000`
- VPS 防火墙和云服务器安全组已放行 TCP `3000`

## 首次部署

```bash
docker run -d \
  --pull=always \
  --name milo \
  --restart unless-stopped \
  -p 3000:3000 \
  -v milo-data:/app/data \
  ghcr.io/colaxr/milo:latest
```

部署完成后打开以下地址，并创建首个管理员账户：

```text
http://<VPS-IP>:3000
```

HTTP 可用于初始化和登录测试。正式使用时请配置 HTTPS；聊天记录加密只会在 HTTPS 或 `localhost` 安全环境中启用。

## 后续更新

```bash
docker pull ghcr.io/colaxr/milo:latest

docker rm -f milo 2>/dev/null || true

docker run -d \
  --name milo \
  --restart unless-stopped \
  -p 3000:3000 \
  -v milo-data:/app/data \
  ghcr.io/colaxr/milo:latest

docker image prune -f
```

先拉取镜像再替换容器，拉取失败时不会提前中断正在运行的服务。`docker image prune -f` 只清理未被容器使用的悬空镜像，不会删除 `milo-data` 数据卷；账户和记录会继续保留。
