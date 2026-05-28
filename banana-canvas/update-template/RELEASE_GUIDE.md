# 香蕉画布 — 自动更新发布指南

## 工作原理

```
应用点击"更新" → 请求 GitHub Releases 的 latest.json
  → 比对版本号 → 有新版本 → 下载安装包 → 验证签名 → 重启安装
```

更新文件托管在 GitHub Releases：
- 仓库：https://github.com/felix1709/banana-felix
- 更新清单：`https://github.com/felix1709/banana-felix/releases/latest/download/latest.json`

## 密钥文件

| 文件 | 路径 | 说明 |
|------|------|------|
| 私钥 | `~/.tauri/banana-canvas.key` | 签名更新包（**绝不能提交到 Git**） |
| 公钥 | `~/.tauri/banana-canvas.key.pub` | 已配置在 tauri.conf.json |

## 发布新版本步骤

### 1. 更新版本号

三个文件中的版本号需要同步修改（如 `0.1.0` → `0.2.0`）：

| 文件 | 字段 |
|------|------|
| `src-tauri/Cargo.toml` | `version = "0.2.0"` |
| `src-tauri/tauri.conf.json` | `"version": "0.2.0"` |
| `package.json` | `"version": "0.2.0"` |

### 2. 构建签名版本

```powershell
# PowerShell — 设置签名密钥环境变量
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\banana-canvas.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""   # 密钥未设密码

# 构建
npm run tauri build
```

构建完成后，在 `src-tauri/target/release/bundle/nsis/` 目录下会生成：
- `banana-canvas_0.2.0_x64-setup.nsis.exe` — 安装包
- `banana-canvas_0.2.0_x64-setup.nsis.exe.sig` — 签名文件

### 3. 读取签名

```powershell
# 读取签名文件内容
$sig = Get-Content "src-tauri\target\release\bundle\nsis\banana-canvas_0.2.0_x64-setup.nsis.exe.sig" -Raw
Write-Host $sig
```

### 4. 创建 GitHub Release

方式一：使用 gh CLI（推荐）

```powershell
# 创建 Release 并上传文件
gh release create v0.2.0 `
  "src-tauri/target/release/bundle/nsis/banana-canvas_0.2.0_x64-setup.nsis.exe" `
  --title "v0.2.0" `
  --notes "更新说明：`n- 新增拖拽导入素材功能`n- 新增画布框选与按键自定义`n- 优化智能体按钮视觉效果`n- 新增自动更新功能"

# 然后创建 latest.json 并上传
# 先把签名填入 latest.json
$sig = (Get-Content "src-tauri\target\release\bundle\nsis\banana-canvas_0.2.0_x64-setup.nsis.exe.sig" -Raw).Trim()
$json = @"
{
  "version": "0.2.0",
  "notes": "更新说明：`n- 新增拖拽导入素材功能`n- 新增画布框选与按键自定义`n- 优化智能体按钮视觉效果`n- 新增自动更新功能",
  "pub_date": "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')",
  "platforms": {
    "windows-x86_64": {
      "url": "https://github.com/felix1709/banana-felix/releases/download/v0.2.0/banana-canvas_0.2.0_x64-setup.nsis.exe",
      "signature": "$sig"
    }
  }
}
"@
$json | Out-File -Encoding utf8 latest.json
gh release upload v0.2.0 latest.json
```

方式二：手动在 GitHub 网页操作

1. 打开 https://github.com/felix1709/banana-felix/releases/new
2. Tag 填 `v0.2.0`
3. 上传 `.nsis.exe` 安装包
4. 发布后，编辑 `update-template/latest.json` 填入签名，再上传为 Release Asset

### 5. 验证更新

打开应用 → 顶栏点击 "🔄 更新" → 应检测到新版本

## latest.json 格式

```json
{
  "version": "0.2.0",
  "notes": "更新说明",
  "pub_date": "2026-05-28T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://github.com/felix1709/banana-felix/releases/download/v0.2.0/banana-canvas_0.2.0_x64-setup.nsis.exe",
      "signature": "签名内容（来自 .sig 文件）"
    }
  }
}
```

## 注意事项

- **私钥安全**：`~/.tauri/banana-canvas.key` 绝不能提交到 Git 或泄露
- **版本号规则**：新版本号必须大于当前版本（语义化版本比较）
- **GitHub 国内访问**：如果用户在国内，GitHub 下载可能较慢。后续可考虑加国内 CDN 镜像
- **签名必填**：`latest.json` 中的 `signature` 字段不能为空，否则更新验证失败
