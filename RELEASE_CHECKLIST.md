# 发布检查清单 (Release Checklist)

## 发布前检查

### 1. 文件结构检查

确保以下文件存在于**根目录**：

- [ ] `ha-reachy-mini-card.js` - 主 JavaScript 文件
- [ ] `assets/robot-3d/reachy-mini.urdf` - URDF 模型文件
- [ ] `assets/robot-3d/meshes/*.stl` - STL 网格文件（42 个）
- [ ] `hacs.json` - HACS 配置文件
- [ ] `info.md` - HACS 商店简介
- [ ] `README.md` - 项目说明
- [ ] `HACS_INSTALLATION.md` - 安装说明
- [ ] `TROUBLESHOOTING.md` - 故障排除指南

### 2. 版本号检查

确保版本号一致：

- [ ] `ha-reachy-mini/src/ha-reachy-mini-card.js` 中的 `CARD_VERSION`
- [ ] `ha-reachy-mini/package.json` 中的 `version`
- [ ] Git tag（例如 `v1.0.1`）

### 3. 构建检查

```bash
cd ha-reachy-mini
npm install
npm test
npm run build
```

- [ ] 测试通过
- [ ] 构建成功
- [ ] 生成 `ha-reachy-mini/dist/ha-reachy-mini-card.js`

### 4. 文件同步

```bash
# 复制构建文件到根目录
cp ha-reachy-mini/dist/ha-reachy-mini-card.js ./
cp ha-reachy-mini/dist/ha-reachy-mini-card.js dist/
```

- [ ] 根目录的 `ha-reachy-mini-card.js` 已更新
- [ ] `dist/ha-reachy-mini-card.js` 已更新

### 5. HACS 配置检查

`hacs.json` 内容：

```json
{
  "name": "Reachy Mini 3D Card",
  "render_readme": true,
  "homeassistant": "2024.11.0",
  "filename": "ha-reachy-mini-card.js",
  "content_in_root": true
}
```

- [ ] `filename` 与实际文件名匹配
- [ ] `content_in_root: true`
- [ ] `homeassistant` 版本正确

### 6. 文档检查

- [ ] `README.md` 包含最新的安装说明
- [ ] `info.md` 包含简洁的功能介绍
- [ ] `TROUBLESHOOTING.md` 包含常见问题解决方案
- [ ] 所有文档中的版本号已更新

### 7. Git 检查

```bash
git status
```

- [ ] 所有更改已提交
- [ ] 没有未跟踪的重要文件
- [ ] `.gitignore` 正确配置

## 发布流程

### 1. 提交更改

```bash
git add .
git commit -m "chore: release v1.0.1"
git push origin main
```

### 2. 创建 Git Tag

```bash
git tag v1.0.1
git push origin v1.0.1
```

### 3. GitHub Actions 自动发布

推送 tag 后，GitHub Actions 会自动：
- 运行测试
- 构建 JS 文件
- 创建 GitHub Release
- 上传 `ha-reachy-mini-card.zip`

### 4. 验证 Release

检查 GitHub Release 页面：
- [ ] Release 已创建
- [ ] 包含 `ha-reachy-mini-card.zip`
- [ ] Release 说明正确
- [ ] 文件可以下载

### 5. HACS 验证

等待 GitHub Actions 完成：
- [ ] HACS 验证通过
- [ ] 没有结构错误

## 发布后检查

### 1. 测试 HACS 安装

在测试环境中：
1. 添加自定义仓库
2. 安装卡片
3. 检查文件是否正确下载
4. 清除浏览器缓存
5. 测试卡片功能

### 2. 验证文件下载

检查以下文件是否存在：
```
config/www/community/ha-reachy-mini/
├── ha-reachy-mini-card.js
└── assets/
    └── robot-3d/
        ├── reachy-mini.urdf
        └── meshes/
            └── *.stl (42 个文件)
```

### 3. 验证资源加载

打开浏览器控制台（F12），检查日志：
```
[Reachy Mini 3D] Loading robot from: /hacsfiles/ha-reachy-mini/assets/robot-3d/reachy-mini.urdf
[Reachy Mini 3D] All assets loaded successfully
```

### 4. 功能测试

- [ ] 3D 模型正确加载
- [ ] 可以旋转和缩放
- [ ] WebSocket 连接正常
- [ ] 关节位置更新正常
- [ ] 没有 404 错误

## 常见问题处理

### HACS 验证失败

**错误**: "Repository structure is not compliant"

**检查**:
1. `hacs.json` 配置正确
2. `ha-reachy-mini-card.js` 在根目录
3. `filename` 字段与文件名匹配
4. `content_in_root: true`

### 资源 404 错误

**原因**: 浏览器缓存

**解决**:
1. 清除浏览器缓存
2. 硬刷新页面（Ctrl+F5）
3. 重启浏览器

### 文件未下载

**检查**:
1. GitHub Release 包含所有文件
2. HACS 安装日志
3. 文件权限

## 版本号规范

使用语义化版本号：`MAJOR.MINOR.PATCH`

- **MAJOR**: 不兼容的 API 更改
- **MINOR**: 向后兼容的功能添加
- **PATCH**: 向后兼容的错误修复

示例：
- `1.0.0` - 首次发布
- `1.0.1` - 修复缓存问题
- `1.1.0` - 添加新配置选项
- `2.0.0` - 重大架构变更

## 发布说明模板

```markdown
# Reachy Mini 3D Card v1.0.1

## 🐛 Bug Fixes
- 修复浏览器缓存导致的 404 错误
- 添加自动路径检测

## ✨ Improvements
- 添加详细的诊断日志
- 改进错误处理

## 📝 Documentation
- 添加故障排除指南
- 更新安装说明

## ⚠️ Important
更新后请清除浏览器缓存：
- Chrome/Edge: Ctrl+Shift+Delete
- Firefox: Ctrl+Shift+Delete
- Safari: Cmd+Option+E

然后硬刷新页面：Ctrl+F5 (Windows) 或 Cmd+Shift+R (Mac)
```

## 回滚流程

如果发布有问题：

1. **删除 Git Tag**:
   ```bash
   git tag -d v1.0.1
   git push origin :refs/tags/v1.0.1
   ```

2. **删除 GitHub Release**:
   - 在 GitHub 上手动删除

3. **修复问题并重新发布**:
   ```bash
   # 修复代码
   git add .
   git commit -m "fix: 修复问题"
   git push
   
   # 重新打标签
   git tag v1.0.1
   git push origin v1.0.1
   ```

## 联系方式

如果遇到问题：
- 提交 GitHub Issue
- 查看 TROUBLESHOOTING.md
- 检查 GitHub Actions 日志
