# opencode-loamlog

OpenCode plugin for Loamlog — automatically captures sessions on idle and archives them as structured JSON snapshots via the Loamlog daemon.

## Features

- **Automatic Capture**: Listens for `session.idle` events and forwards them to the local Loamlog daemon.
- **Local File Buffering**: If the daemon is unavailable, payloads are buffered locally in `~/.loamlog/buffer/` (up to 50 files).
- **Late-start Sync**: Automatically flushes buffered data once the daemon becomes available again.
- **Robustness**: Isolated error handling ensures the plugin never crashes the OpenCode host.

## Installation

The plugin should be installed globally so that OpenCode can discover it:

```bash
npm install -g opencode-loamlog
```

After installation, ensure the plugin is enabled in your global OpenCode configuration (`~/.config/opencode/opencode.json`):

```json
{
  "plugins": ["opencode-loamlog@latest"]
}
```

## Configuration

The plugin uses the following environment variables if set:

- `LOAM_DAEMON_URL`: URL of the Loamlog daemon (default: `http://127.0.0.1:37468`).
- `LOAM_DEBUG_LOG`: Path to debug log file (default: `/tmp/loamlog-debug.log`).

---

## Development & Publishing

### Build
```bash
pnpm install
pnpm run build
```

### Test
```bash
pnpm run test
```

### Publishing to NPM

This plugin is published to NPM as `opencode-loamlog`.

#### 1. Automated Release (Recommended)
Publishing is handled via GitHub Actions:

- **Via Tag**: Push a tag matching `opencode-loamlog@v*` (e.g., `opencode-loamlog@v0.2.2`).
  ```bash
  git tag opencode-loamlog@v0.2.2
  git push origin opencode-loamlog@v0.2.2
  ```
- **Manual**: Go to GitHub Actions -> "Publish OpenCode Plugin" -> "Run workflow". Select the version bump type (patch/minor/major).

#### 2. Local publishing is forbidden

Do not run `npm publish` or `pnpm publish` locally for this plugin.

- All plugin releases must go through GitHub Actions
- Tag-based releases use the `opencode-loamlog@v*` convention
- Manual releases, if needed, should be triggered from the "Publish OpenCode Plugin" workflow

**Note**: Ensure `NPM_TOKEN` is configured in GitHub repository secrets for the automated workflow to work.
