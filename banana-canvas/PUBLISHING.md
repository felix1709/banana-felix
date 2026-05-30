# Banana Canvas 发布流程

本项目发布到 `https://github.com/felix1709/banana-felix` 时按以下规则执行。

## 关键规则

- 发布版本必须高于用户本地已安装版本。例如本地是 `0.3.1`，Release 必须是 `0.3.2` 或更高。
- 发布前同步修改版本号：
  - `package.json`
  - `package-lock.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- `src-tauri/tauri.conf.json` 的 `bundle.createUpdaterArtifacts` 必须为 `true`，否则可能不会生成 updater 需要的 `.sig` 签名文件。
- 上传到 GitHub Release 的文件名必须使用英文，不使用中文文件名。
- 私钥只用于本机签名环境变量，禁止提交到 Git。
- 私钥路径：`C:\Users\admin\.tauri\banana-canvas.key`
- 公钥路径：`C:\Users\admin\.tauri\banana-canvas.key.pub`

## 构建签名安装包

```powershell
cd "C:\Users\admin\Documents\New project\banana-canvas"

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath "C:\Users\admin\.tauri\banana-canvas.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

npm run tauri build
```

构建完成后检查 `src-tauri\target\release\bundle\nsis`，必须同时有：

```text
*.exe
*.exe.sig
```

如果没有 `.sig`，自动更新一定会失败。

## 生成 latest.json

示例以 `0.3.2` 为例：

```powershell
$version = "0.3.2"
$tag = "v$version"
$assetDir = "release-assets"
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null

$installer = Get-ChildItem "src-tauri\target\release\bundle\nsis" -Filter "*.exe" |
  Where-Object { $_.Name -like "*$version*" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$sigFile = Get-ChildItem "src-tauri\target\release\bundle\nsis" -Filter "*.sig" |
  Where-Object { $_.Name -like "*$version*" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) { throw "未找到 $version 安装包" }
if (-not $sigFile) { throw "未找到 $version 签名文件 .sig" }

$englishInstaller = "$assetDir\banana-canvas_${version}_x64-setup.nsis.exe"
Copy-Item -LiteralPath $installer.FullName -Destination $englishInstaller -Force

$sig = (Get-Content -LiteralPath $sigFile.FullName -Raw).Trim()
$pubDate = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
$url = "https://github.com/felix1709/banana-felix/releases/download/$tag/banana-canvas_${version}_x64-setup.nsis.exe"

$json = @{
  version = $version
  notes = "更新说明：修复智能体交互、图片模型列表、视频生成输出流程。"
  pub_date = $pubDate
  platforms = @{
    "windows-x86_64" = @{
      url = $url
      signature = $sig
    }
  }
} | ConvertTo-Json -Depth 5

$json | Out-File -Encoding utf8 "$assetDir\latest.json"
```

## 创建 GitHub Release

```powershell
gh release create $tag `
  "$englishInstaller#banana-canvas_${version}_x64-setup.nsis.exe" `
  "$assetDir\latest.json#latest.json" `
  --repo felix1709/banana-felix `
  --title $tag `
  --notes "更新说明：修复智能体交互、图片模型列表、视频生成输出流程。"
```

如果 `gh` 提示未登录，先执行：

```powershell
gh auth login
```

## 常见失败原因

- Release 版本没有高于本地版本。
- `latest.json` 没上传到 latest release。
- `latest.json` 中的安装包 URL 和实际上传文件名不一致。
- `latest.json` 的 `signature` 为空，或不是同一个安装包对应的 `.sig`。
- 构建时没有启用 `createUpdaterArtifacts`，导致没有 `.sig`。
