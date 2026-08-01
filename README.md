# Docker Run 部署

## 环境要求

- Docker 24 或更高版本
- 可用端口 `3000`
- 已配置 HTTPS 反向代理，可转发到 `127.0.0.1:3000`

## 首次部署

```bash
docker run -d \
  --pull=always \
  --name milo \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v milo-data:/app/data \
  ghcr.io/colaxr/milo:latest
```

部署完成后，通过 HTTPS 打开页面并创建首个管理员账户。

反向代理上游地址：

```text
http://127.0.0.1:3000
```

## 后续更新

```bash
docker rm -f milo

docker run -d \
  --pull=always \
  --name milo \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v milo-data:/app/data \
  ghcr.io/colaxr/milo:latest
```

不要删除 `milo-data` 数据卷；账户和记录会继续保留。
