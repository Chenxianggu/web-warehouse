# 域名与 HTTPS 运维

生产访问地址为 `https://yinfengsuliao.com`，同时支持 `https://www.yinfengsuliao.com`。Ubuntu 主机上的 Nginx 负责 HTTPS，转发至 Docker 映射的 `127.0.0.1:3000`。

以下命令均在生产服务器执行。涉及仓库文件的命令从 `/opt/warehouse` 执行；首次部署前也可使用仓库检出目录。广州服务器对外开通网站服务前需完成 ICP 备案，参见[腾讯云备案说明](https://cloud.tencent.com/document/product/243/18910)。

## 配置文件与发布边界

| 文件 | 用途 |
| --- | --- |
| `ops/nginx/warehouse.http.conf` | 首次申请证书前的 HTTP 配置，不依赖证书文件 |
| `ops/nginx/warehouse.https.conf` | 已有证书时的 HTTPS 参考配置，包含 HTTP 跳转与代理请求头 |
| `/etc/nginx/sites-enabled/warehouse` | 服务器实际启用的站点配置，可能是指向 `sites-available` 的符号链接 |
| `/etc/letsencrypt/` | Certbot 管理的证书、私钥及续期配置，仅保存在服务器 |
| `/opt/warehouse/.env.prod` | 生产环境变量，仅保存在服务器 |

两份模板用于不同阶段，不要同时启用。当前已有 HTTPS 的服务器无需重新安装 HTTP 模板。模板记录了可恢复的配置，不是服务器完整配置的自动备份。

GitHub 发布流程会将 `ops/` 下的模板复制到服务器，但不会自动安装到 `/etc/nginx/`，也不会修改 `.env.prod`、证书或续期任务。应用发布与 Nginx 配置变更分别执行。

## DNS 与端口

在 DNSPod 管理以下记录。服务器公网 IP 变化后更新记录值。

| 主机记录 | 类型 | 线路 | 当前记录值 |
| --- | --- | --- | --- |
| `@` | A | 默认 | `134.175.141.138` |
| `www` | A | 默认 | `134.175.141.138` |

腾讯云安全组或轻量应用服务器防火墙需允许公网入站 TCP `80`、`443`；Ubuntu UFW 启用时也需允许这两个端口：

```bash
sudo ufw status
# 仅在 UFW 已启用时添加规则；保留现有 SSH 规则。
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

应用端口保持 `127.0.0.1:3000`，数据库保持私有。HTTP 80 端口供跳转及 Certbot 的 HTTP 验证、自动续期使用。

## 新服务器首次配置

先完成应用部署，确认后端已就绪：

```bash
curl -I http://127.0.0.1:3000/login
```

安装 Nginx，启用 HTTP 模板。下面的安装命令用于尚未配置 `warehouse` 站点的新服务器；已有配置请先备份，并使用后面的恢复步骤。

```bash
sudo apt update
sudo apt install -y nginx snapd
sudo install -m 644 ops/nginx/warehouse.http.conf /etc/nginx/sites-available/warehouse
sudo ln -s /etc/nginx/sites-available/warehouse /etc/nginx/sites-enabled/warehouse
sudo nginx -t && sudo systemctl reload nginx
```

使用 Certbot 的 snap 版本。如果系统已通过 apt 等渠道安装 Certbot，先按[官方安装指南](https://certbot.eff.org/instructions?os=snap&tab=standard&ws=nginx)处理旧版本，避免混用。

```bash
sudo snap install --classic certbot
sudo /snap/bin/certbot --nginx \
  -d yinfengsuliao.com \
  -d www.yinfengsuliao.com \
  --redirect
```

按提示填写邮箱、同意证书服务条款；分享邮箱及推广邮件选项可拒绝。Certbot 自动申请证书、更新已启用的站点、配置 HTTP 到 HTTPS 的跳转，并安排自动续期。正常完成后无需再复制 HTTPS 模板。

如果域名未生效、HTTP 验证被拦截或后端未就绪，先按错误信息排查，避免反复申请。更换服务器需要重新签发证书或通过受保护的备份恢复证书；仓库不包含私钥。

## 已有证书时恢复 Nginx 配置

仅在实际需要修复或恢复站点时执行。先检查当前配置及证书路径：

```bash
sudo nginx -T
sudo /snap/bin/certbot certificates
```

确认模板中的 `fullchain.pem`、`privkey.pem` 路径与实际证书一致，且证书覆盖两个域名；若证书名称含 `-0001` 等后缀，先调整模板的部署副本。

保留原配置备份，复制 HTTPS 模板到已有站点文件。`cp` 会沿用站点符号链接的目标文件；备份放到不会自动加载的目录中。

```bash
sudo test -f /etc/letsencrypt/live/yinfengsuliao.com/fullchain.pem
sudo test -f /etc/letsencrypt/live/yinfengsuliao.com/privkey.pem
sudo mkdir -p /etc/nginx/backups
sudo cp -Lp /etc/nginx/sites-enabled/warehouse "/etc/nginx/backups/warehouse.$(date +%Y%m%d-%H%M%S).conf"
sudo cp ops/nginx/warehouse.https.conf /etc/nginx/sites-enabled/warehouse
sudo nginx -t && sudo systemctl reload nginx
```

若任一命令报错，先停止后续操作。语法检查失败时不要 reload，使用刚保存的备份恢复站点文件，再执行 `sudo nginx -t && sudo systemctl reload nginx`。修改模板副本的证书路径时，也应相应调整上面的文件检查命令。

模板传递 `Host`、`X-Forwarded-Host`、`X-Forwarded-Proto` 等请求头，让应用识别外部域名和 HTTPS；关闭响应缓冲以支持 Next.js 流式响应。配置依据：[Nginx 代理模块](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)、[Nginx HTTPS](https://nginx.org/en/docs/http/configuring_https_servers.html)。

## 登录地址与容器重建

服务器 `/opt/warehouse/.env.prod` 中应只有一个生效的 `AUTH_URL` 定义：

```dotenv
AUTH_URL=https://yinfengsuliao.com
```

保持数据库密码、`AUTH_SECRET` 等现有值。不要提交真实 `.env.prod`。GitHub Settings → Environments → production 中的 `PROD_URL` 也设置为 `https://yinfengsuliao.com`；该变量只影响部署链接，不能代替服务器的 `AUTH_URL`。

修改环境文件后，查看当前应用的镜像版本：

```bash
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

使用当前镜像重新创建应用容器。下面的 `v1.1.1` 是操作示例，执行前替换为上一步 `warehouse-app-1` 的实际版本，仓库名也需与当前镜像一致：

```bash
cd /opt/warehouse
sudo env IMAGE_REPOSITORY=warehouse-app IMAGE_TAG=v1.1.1 \
  docker compose --env-file .env.prod -f docker-compose.prod.yml \
  up -d --no-deps --force-recreate app
sudo docker exec warehouse-app-1 printenv AUTH_URL
```

最后应输出 `https://yinfengsuliao.com`。仅执行 `docker restart` 或重启 Nginx 不会重新读取 Compose 环境值。容器启动时先运行数据库迁移，再启动 Next.js，期间可能短暂返回 502。

## 验证与排查

```bash
curl -I http://yinfengsuliao.com
curl -I http://www.yinfengsuliao.com
curl -I https://yinfengsuliao.com/login
curl -I https://www.yinfengsuliao.com/login
curl -fsS https://yinfengsuliao.com/api/auth/providers
sudo /snap/bin/certbot renew --dry-run
```

预期 HTTP 返回 `301` 并跳转 HTTPS，两个 HTTPS 登录页返回 `200`，认证接口的 `signinUrl`、`callbackUrl` 使用 `https://yinfengsuliao.com`，续期测试成功。然后用无痕窗口从主域名测试登录、进入首页和退出；HTTP 可访问并不代表认证流程已验证。

如果登录跳回公网 IP，检查 `.env.prod` 的 `AUTH_URL`、容器内的实际值及 Nginx 代理请求头，重建容器后重新登录。

如果 502 持续出现，依次查看容器状态、启动日志、后端响应和 Nginx 错误日志：

```bash
sudo docker ps -a --filter name=warehouse-app-1
sudo docker logs --tail 100 warehouse-app-1
curl -I --connect-timeout 5 --max-time 10 http://127.0.0.1:3000/login
sudo tail -n 50 /var/log/nginx/error.log
```

检查应用启动或数据库迁移报错、是否仍绑定 `127.0.0.1:3000`、是否持续重启。无需通过重新申请证书处理应用启动故障。
