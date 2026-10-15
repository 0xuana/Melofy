# Melofy

一个仅在本机运行的小企鹅音乐 Web 播放器，用来替代体验较差的 Linux 小企鹅音乐客户端。Melofy 通过小企鹅音乐服务读取账号歌单并播放音乐。

目前支持 QQ 和微信扫码登录、“我喜欢”、自建/收藏歌单、歌单内过滤、多音质播放、同步歌词，以及立即播放、下一首播放、追加、排序、移除和清空播放队列。

## 环境要求

- Linux
- Node.js 24
- npm 12
- 可以正常访问小企鹅音乐服务

项目通过 `.nvmrc` 固定使用 Node.js `24.20.0`。推荐使用 nvm：

```bash
nvm install 24.20.0
nvm use
node --version
npm --version
```

`node --version` 应显示 `v24.20.0`，npm 应为 12.x。

## 第一次运行

在仓库根目录执行：

```bash
cd /path/to/melofy
nvm use
npm ci
npm run dev
```

启动成功后会看到两个地址：

- Web 播放器：<http://127.0.0.1:5173>
- 本地 API：<http://127.0.0.1:8787>

用浏览器打开 <http://127.0.0.1:5173>。第一次使用时：

1. 选择 QQ 或微信扫码登录。
2. 使用手机 QQ 或微信扫描对应二维码。
3. 在手机上确认登录。
4. 登录完成后等待歌单分页加载。
5. 点击歌单中的“播放”“下一首”或“加入队列”。

按 `Ctrl+C` 可以同时停止 Web 和 API 服务。

## 日常启动

依赖已经安装后，日常只需要：

```bash
cd /path/to/melofy
nvm use
npm run dev
```

锁屏、关闭浏览器、停止服务或重启电脑不会清除登录状态，通常不需要重新扫码。

## 使用 Docker 部署

需要 Docker Engine 和 Docker Compose。容器版包含生产构建的 Web 页面和 API；网页默认只允许本机访问：<http://127.0.0.1:8080>。第一次启动会构建镜像：

```bash
docker compose up -d --build
```

打开页面后使用 QQ 或微信扫码登录。登录信息保存在名为 `melofy-data` 的 Docker 命名卷中，容器重建或执行 `docker compose down` 不会清除。查看状态和日志：

Docker 版使用应用内扫码登录；不会自动导入宿主机 Linux QQ 音乐客户端的登录配置。

```bash
docker compose ps
docker compose logs -f
```

停止服务但保留登录信息：

```bash
docker compose down
```

如需换用本机其他端口，可在启动时设置 `MELOFY_PORT`，例如 `MELOFY_PORT=8780 docker compose up -d --build`。该端口仍只绑定 `127.0.0.1`。

登录凭据备份可通过临时容器导出数据卷：

```bash
docker run --rm -v qqmusic_melofy-data:/data -v "$PWD":/backup alpine \
  tar -czf /backup/melofy-data-backup.tar.gz -C /data .
```

Compose 项目名会影响卷名；先用 `docker volume ls` 确认实际名称。备份文件含敏感登录凭据，请妥善保管，不要上传或提交。**不要使用 `docker compose down -v`**，该命令会删除凭据卷并导致需要重新扫码。

## 登录信息保存位置

登录凭据只保存在 API 服务端，不会发送给浏览器。

默认文件位置：

```text
~/.local/share/qqmusic-web/session.json
```

如果设置了 `XDG_DATA_HOME`，则保存到：

```text
$XDG_DATA_HOME/qqmusic-web/session.json
```

目录权限为 `0700`，凭据文件权限为 `0600`，写入时使用原子替换。文件可能包含 `musicKey` 和刷新令牌，不要上传、提交或发送给其他人。

可以自定义保存位置：

```bash
QQMUSIC_SESSION_PATH=/安全目录/qqmusic-session.json npm run dev
```

若以前登录过 Linux 官方小企鹅音乐客户端，API 还会尝试从 `~/.config/qqmusic/settings.json` 一次性导入可用会话。可以覆盖该目录：

```bash
QQMUSIC_PROFILE_PATH=/其他/profile/目录 npm run dev
```

## 退出当前账号

点击页面右上角的账号图标，再选择“退出登录”。播放器会停止并清空当前队列，API 会删除本机保存的登录凭据，页面随后返回扫码登录界面。QQ 和微信登录都使用相同的本机凭据存储文件与权限保护；微信登录直接交换为 QQ 音乐会话，不会把微信登录令牌发送到浏览器。

如果希望保留当前会话作为备份以便之后恢复，先停止服务，再把会话文件移到备份目录：

```bash
mkdir -p ~/.local/share/qqmusic-web/session-backup
mv ~/.local/share/qqmusic-web/session.json ~/.local/share/qqmusic-web/session-backup/session.json
npm run dev
```

确认新账号登录正常后，可以自行删除备份。若要恢复旧账号，将备份移回原位置即可。

## 分别调试 Web 和 API

Web 和 API 是两个独立 workspace，可以在两个终端中分别运行。

终端一：

```bash
cd /path/to/melofy
nvm use
npm run dev --workspace @qqmusic-web/api
```

终端二：

```bash
cd /path/to/melofy
nvm use
npm run dev --workspace @qqmusic-web/web
```

Vite 会把浏览器中的 `/api` 请求代理到 `http://127.0.0.1:8787`。

API 健康检查：

```bash
curl http://127.0.0.1:8787/api/health
```

正常响应：

```json
{"status":"ok"}
```

## 验证和构建

运行全部测试：

```bash
npm test
```

运行 TypeScript 类型检查：

```bash
npm run typecheck
```

构建 Web 生产文件：

```bash
npm run build --workspace @qqmusic-web/web
```

构建结果位于 `web/dist/`。也可使用 Docker Compose 部署生产前端与本地 API，详见上文。

## 常见问题

### `nvm use` 提示 Node.js 未安装

```bash
nvm install 24.20.0
nvm use
```

### `vite`、`tsx` 或其他依赖找不到

确认位于仓库根目录并重新安装锁定依赖：

```bash
npm ci
```

### 5173 或 8787 端口被占用

检查占用进程：

```bash
ss -ltnp | rg ':5173|:8787'
```

关闭旧的开发服务后重新运行 `npm run dev`。API 端口也可以临时覆盖：

```bash
PORT=8790 npm run dev --workspace @qqmusic-web/api
```

若修改 API 端口，还需要同步修改 `web/vite.config.js` 中的代理端口。

### 页面要求重新扫码

检查持久会话是否存在且权限正确：

```bash
ls -l ~/.local/share/qqmusic-web/session.json
```

若文件存在但凭据已经自然过期，目前仍可能需要重新扫码。自动刷新过期凭据尚在开发中，详见 `TODO.md`。

### 歌曲无法播放

小企鹅音乐可能因为会员等级、版权、地区限制或该音质不可用而不返回播放地址。先尝试切换到“标准”或“高品质”。播放器会显示 API 返回的具体不可用原因。

## 项目结构

```text
web/                                Vue、Vite、Pinia 播放器
api/                                本地 HTTP API、QQ 扫码及会话存储
packages/qqmusic-provider/          小企鹅音乐请求与规范化数据模型
packages/installed-profile-adapter/ Linux 官方客户端会话导入
reports/                            逆向分析和协议证据
```

本项目面向单台电脑上的个人使用。开发 API 默认只监听 `127.0.0.1`；Docker 部署通过 Nginx 提供页面和 API 代理，并将宿主机端口绑定到 `127.0.0.1`，不作为公网多用户服务使用。
