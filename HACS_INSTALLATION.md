# HACS 安装说明 (HACS Installation Guide)

## 当前发布方式

本项目现在采用适合 HACS Dashboard/Plugin 的发布方式：

- 主卡片文件位于 `dist/ha-reachy-mini-card.js`
- 3D 资源位于 `dist/assets/robot-3d/...`
- GitHub Release 不再只上传单独的 `ha-reachy-mini-card.js` 资产文件

这可以避免“只下载脚本、缺少 assets”的问题。

## 用户安装后预期结构

HACS 安装完成后，Home Assistant 中应可访问如下路径：

```
/hacsfiles/ha-reachy-mini/dist/ha-reachy-mini-card.js
/hacsfiles/ha-reachy-mini/dist/assets/robot-3d/reachy-mini.urdf
/hacsfiles/ha-reachy-mini/dist/assets/robot-3d/meshes/*.stl
```

## Lovelace 资源路径

推荐使用以下资源 URL：

```yaml
resources:
  - url: /hacsfiles/ha-reachy-mini/dist/ha-reachy-mini-card.js
    type: module
```

## 安装后校验

1. 清除浏览器缓存并强制刷新。
2. 浏览器直接打开：
   - `http://homeassistant.local:8123/hacsfiles/ha-reachy-mini/dist/ha-reachy-mini-card.js`
   - `http://homeassistant.local:8123/hacsfiles/ha-reachy-mini/dist/assets/robot-3d/reachy-mini.urdf`
3. 打开控制台确认没有 `404` 资源错误。

## 常见问题

### Q: 为什么我只下载到了 JS 文件？

A: 这通常是旧版本发布方式导致的（release 中只上传了单个 JS 资产）。请更新到最新 release 并清除缓存。

### Q: 资源路径应该是 `/dist/...` 还是根目录？

A: 统一使用 `/hacsfiles/ha-reachy-mini/dist/...`。

### Q: 更新后仍然显示旧内容？

A: 大多数是浏览器缓存问题。请清除缓存后再硬刷新页面。

## 开发者发布检查清单

发布新版本前请确认：

1. `dist/ha-reachy-mini-card.js` 存在且为最新构建。
2. `dist/assets/robot-3d/` 完整存在。
3. Release 不上传单个 JS 资产文件。
4. 打 tag 后，可通过 source code 包获取完整 `dist/`。
