# opencode-loamlog

适用于 Loamlog 的 OpenCode 插件 —— 在会话空闲时自动捕获会话，并通过 Loamlog 守护进程将其存档为结构化的 JSON 快照。

## 功能特性

- **自动捕获 (Automatic Capture)**：监听 `session.idle` 事件并转发至本地 Loamlog 守护进程。
- **本地文件缓冲 (Local File Buffering)**：当守护进程不可用时，payload 将暂时保存在本地 `~/.loamlog/buffer/` 目录中（最多保留 50 个文件）。
- **延迟同步 (Late-start Sync)**：一旦守护进程恢复可用，插件将在下一次成功上报后自动冲刷并同步缓冲区内的旧数据。
- **鲁棒性 (Robustness)**：隔离的错误处理确保插件永远不会导致 OpenCode 宿主程序崩溃。

## 安装 (Installation)

该插件已发布为 NPM 包，你可以使用你偏好的包管理器进行安装：

```bash
pnpm add opencode-loamlog
# 或
npm install opencode-loamlog
```

安装完成后，请确保在 OpenCode 配置文件（`~/.config/opencode/opencode.json`）中启用了该插件：

```json
{
  "plugin": ["opencode-loamlog@latest"]
}
```

## 配置

插件支持以下环境变量：

- `LOAM_DAEMON_URL`: Loamlog 守护进程地址（默认：`http://127.0.0.1:37468`）。
- `LOAM_DEBUG_LOG`: 调试日志路径（默认：`/tmp/loamlog-debug.log`）。

---

## 开发与发布 (Development & Publishing)

### 构建
```bash
pnpm install
pnpm run build
```

### 测试
```bash
pnpm run test
```

### 发布到 NPM

该插件作为 `opencode-loamlog` 发布到 NPM。

#### 1. 自动发布（推荐）
通过 GitHub Actions 处理发布流程：

- **通过标签触发**：推送符合 `opencode-loamlog@v*` 格式的标签（例如 `opencode-loamlog@v0.2.2`）。
  ```bash
  git tag opencode-loamlog@v0.2.2
  git push origin opencode-loamlog@v0.2.2
  ```
- **手动触发**：前往 GitHub Actions -> "Publish OpenCode Plugin" -> "Run workflow"。选择版本升级类型（patch/minor/major）。

#### 2. 手动发布
如果你拥有相应权限且本地配置了 `NPM_TOKEN`：
```bash
cd plugins/opencode
npm publish --access public
```

**注意**：必须在 GitHub 仓库的 Secrets 中配置 `NPM_TOKEN` 才能使自动工作流生效。
