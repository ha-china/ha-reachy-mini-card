# HACS 安装说明 (HACS Installation Guide)

## HACS 自动下载的文件

当用户通过 HACS 安装 "Reachy Mini 3D Card" 时，HACS 会自动下载以下文件到 Home Assistant 的 `config/www/community/ha-reachy-mini/` 目录：

### 文件结构

```
config/www/community/ha-reachy-mini/
├── ha-reachy-mini-card.js          # 主 JavaScript 文件（已打包所有依赖）
├── assets/                          # 3D 资源文件夹
│   └── robot-3d/
│       ├── reachy-mini.urdf        # 机器人 URDF 模型文件
│       └── meshes/                  # STL 网格文件（42 个文件）
│           ├── head_front_3dprint.stl
│           ├── head_back_3dprint.stl
│           ├── body_top_3dprint.stl
│           ├── stewart_main_plate_3dprint.stl
│           └── ... (其他 38 个 STL 文件)
├── hacs.json                        # HACS 配置（不会被下载到用户端）
├── info.md                          # HACS 商店简介（不会被下载到用户端）
└── README.md                        # 项目说明（不会被下载到用户端）
```

### 总文件数量

- **1 个** JavaScript 文件（约 1-2 MB，包含所有依赖）
- **1 个** URDF 文件（约 50 KB）
- **42 个** STL 网格文件（总计约 5-10 MB）
- **总计：44 个文件**

## HACS 配置说明

### `hacs.json` 配置

```json
{
  "name": "Reachy Mini 3D Card",
  "render_readme": true,
  "homeassistant": "2024.11.0",
  "filename": "ha-reachy-mini-card.js",
  "content_in_root": true
}
```

#### 字段说明：

- **`name`**: 在 HACS 商店中显示的名称
- **`render_readme`**: 在 HACS 中显示 README.md
- **`homeassistant`**: 最低支持的 Home Assistant 版本
- **`filename`**: 主 JavaScript 文件名
- **`content_in_root: true`**: 
  - HACS 会下载**根目录**下的所有文件
  - 包括 `ha-reachy-mini-card.js` 和 `assets/` 文件夹
  - 不包括 `ha-reachy-mini/` 源代码目录

## 用户安装流程

### 1. 通过 HACS 安装

用户在 HACS 中安装时，HACS 会：

1. **下载文件**：
   - 从 GitHub 仓库下载根目录的所有文件
   - 保存到 `config/www/community/ha-reachy-mini/`

2. **自动注册资源**：
   - HACS 会自动在 Lovelace 中注册资源
   - 资源 URL：`/hacsfiles/ha-reachy-mini/ha-reachy-mini-card.js`

3. **完成安装**：
   - 用户无需手动复制文件
   - 无需手动添加资源引用

### 2. 用户需要做的

安装完成后，用户只需要：

1. **清除浏览器缓存**（重要！）
   ```
   Chrome/Edge: Ctrl+Shift+Delete
   Firefox: Ctrl+Shift+Delete
   Safari: Cmd+Option+E
   ```

2. **刷新页面**
   ```
   Ctrl+F5 (Windows)
   Cmd+Shift+R (Mac)
   ```

3. **添加卡片到仪表板**
   ```yaml
   type: custom:ha-reachy-mini-card
   daemon_host: 192.168.1.100
   daemon_port: 8000
   ```

## 资源路径自动检测

卡片代码会自动检测资源路径，支持以下安装方式：

### HACS 安装（推荐）
```
脚本位置：/hacsfiles/ha-reachy-mini/ha-reachy-mini-card.js
资源路径：/hacsfiles/ha-reachy-mini/assets/robot-3d/...
```

### 手动安装
```
脚本位置：/local/ha-reachy-mini/ha-reachy-mini-card.js
资源路径：/local/ha-reachy-mini/assets/robot-3d/...
```

### 路径检测逻辑

```javascript
function getAssetBasePath() {
  // 1. 查找当前页面中的脚本标签
  const scripts = document.querySelectorAll('script[src*="ha-reachy-mini-card"]');
  
  // 2. 提取脚本的基础路径
  const scriptSrc = scripts[scripts.length - 1].src;
  const url = new URL(scriptSrc);
  const pathParts = url.pathname.split('/');
  pathParts.pop(); // 移除文件名
  
  // 3. 构建资源路径
  const basePath = pathParts.join('/');
  return basePath + '/assets';
}
```

## 验证安装

### 检查文件是否存在

用户可以通过以下方式验证安装：

1. **检查文件系统**：
   ```bash
   ls -la config/www/community/ha-reachy-mini/
   ```

2. **检查浏览器控制台**（F12）：
   ```
   [Reachy Mini 3D] Loading robot from: /hacsfiles/ha-reachy-mini/assets/robot-3d/reachy-mini.urdf
   [Reachy Mini 3D] All assets loaded successfully
   ```

3. **直接访问资源**：
   ```
   http://homeassistant.local:8123/hacsfiles/ha-reachy-mini/ha-reachy-mini-card.js
   http://homeassistant.local:8123/hacsfiles/ha-reachy-mini/assets/robot-3d/reachy-mini.urdf
   ```

## 更新流程

### 用户更新时

1. **HACS 自动下载新文件**：
   - 覆盖旧的 `ha-reachy-mini-card.js`
   - 更新 `assets/` 文件夹中的文件

2. **用户必须清除缓存**：
   - 浏览器会缓存旧的 JS 文件
   - 必须清除缓存才能加载新版本

3. **版本号自动更新**：
   - 新版本的 JS 文件包含新的版本号
   - 资源 URL 会自动添加版本参数：`?v=1.0.1`

## 常见问题

### Q: HACS 会下载 `ha-reachy-mini/` 源代码目录吗？

**A**: 不会。`content_in_root: true` 意味着 HACS 只下载根目录下的文件，不包括子目录中的源代码。

### Q: 用户需要手动下载 STL 文件吗？

**A**: 不需要。HACS 会自动下载 `assets/` 文件夹中的所有文件，包括 42 个 STL 网格文件。

### Q: 如果用户之前手动安装过，会有冲突吗？

**A**: 可能会。建议用户：
1. 删除手动安装的文件
2. 通过 HACS 重新安装
3. 清除浏览器缓存

### Q: 资源文件很大，会影响安装速度吗？

**A**: 
- 总大小约 6-12 MB（取决于 STL 文件压缩）
- HACS 会在后台下载，不会阻塞 UI
- 首次安装可能需要 10-30 秒（取决于网络速度）

### Q: 如何确认所有文件都下载成功？

**A**: 
1. 检查 HACS 安装日志
2. 查看浏览器控制台的加载日志
3. 尝试直接访问资源 URL

## 开发者注意事项

### 发布新版本时

1. **更新版本号**：
   ```javascript
   // ha-reachy-mini/src/ha-reachy-mini-card.js
   const CARD_VERSION = '1.0.1';
   ```

2. **构建并复制**：
   ```bash
   cd ha-reachy-mini
   npm run build
   cp dist/ha-reachy-mini-card.js ../ha-reachy-mini-card.js
   ```

3. **提交并打标签**：
   ```bash
   git add .
   git commit -m "chore: release v1.0.1"
   git tag v1.0.1
   git push origin main --tags
   ```

4. **GitHub Actions 自动发布**：
   - 创建 GitHub Release
   - 用户可以通过 HACS 更新

### 确保文件同步

根目录的文件应该与 `ha-reachy-mini/dist/` 保持同步：

```bash
# 自动同步脚本
cp ha-reachy-mini/dist/ha-reachy-mini-card.js ./
cp ha-reachy-mini/dist/ha-reachy-mini-card.js dist/
```

## 总结

✅ **HACS 会自动下载**：
- `ha-reachy-mini-card.js`（主文件）
- `assets/robot-3d/reachy-mini.urdf`（URDF 文件）
- `assets/robot-3d/meshes/*.stl`（42 个 STL 文件）

✅ **用户无需手动操作**：
- 无需手动复制文件
- 无需手动添加资源引用
- 只需清除缓存并刷新

✅ **路径自动检测**：
- 卡片会自动找到正确的资源路径
- 支持 HACS 和手动安装

✅ **更新简单**：
- HACS 一键更新
- 清除缓存即可使用新版本
