# Reachy Mini 3D Card for Home Assistant

[![HACS Badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A custom Lovelace card that provides real-time 3D visualization of the Reachy Mini robot. The card connects directly to the Reachy Mini daemon via WebSocket to display the robot's current state (head pose, antenna positions, body rotation) in an interactive 3D view.

![Reachy Mini 3D Card Preview](preview.png)

## Features

- Real-time 3D visualization of Reachy Mini robot at 20Hz
- WebSocket connection with HTTP polling fallback
- Interactive camera controls (rotate, zoom)
- Connection status indicator (connected/reconnecting/offline)
- Local kinematics calculation for passive joints
- Visual configuration editor
- Configurable appearance and behavior
- HACS compatible for easy installation

## Requirements

- Home Assistant 2023.1.0 or newer
- Reachy Mini daemon running and accessible from your Home Assistant instance
- HACS (Home Assistant Community Store) for easy installation

## Installation

## Known Issues

### HACS Installation
Due to limitations with HACS plugin structure, automatic installation may have issues:

1. **Resource path incorrect**: HACS may add the resource as `/hacsfiles/ha-reachy-mini/ha-reachy-mini-card.js` instead of `/hacsfiles/ha-reachy-mini/dist/ha-reachy-mini-card.js`
   - **Fix**: Manually edit the resource URL in Lovelace configuration to include `/dist/`

2. **Assets not downloaded**: HACS may only download the JS file without the `dist/assets/` folder containing URDF and mesh files
   - **Fix**: Manually download the `dist/` folder from GitHub and copy to `config/www/community/ha-reachy-mini/`

I am working on improving HACS compatibility.

### Manual Installation (Recommended)

1. Download the `dist/` folder from this repository
2. Copy to `config/www/community/ha-reachy-mini/`:
   ```
   config/www/community/ha-reachy-mini/
   └── dist/
       ├── ha-reachy-mini-card.js
       └── assets/
           └── robot-3d/
               ├── reachy-mini.urdf
               └── meshes/
                   └── *.stl
   ```
3. Add the resource in your dashboard resources:

```yaml
resources:
  - url: /hacsfiles/ha-reachy-mini/dist/ha-reachy-mini-card.js
    type: module
```

4. Restart Home Assistant and clear your browser cache

## Configuration

Add the card to your dashboard using the UI editor or YAML:

### Basic Configuration

```yaml
type: custom:ha-reachy-mini-card
daemon_host: 192.168.1.100
daemon_port: 8000
```

### Full Configuration

```yaml
type: custom:ha-reachy-mini-card
daemon_host: 192.168.1.100
daemon_port: 8000
height: 400
background_color: "#f5f5f5"
camera_distance: 0.5
enable_passive_joints: true
enable_grid: true
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `daemon_host` | string | `localhost` | Hostname or IP address of the Reachy Mini daemon |
| `daemon_port` | number | `8000` | Port of the Reachy Mini daemon |
| `height` | number | `400` | Card height in pixels |
| `background_color` | string | `#f5f5f5` | Background color of the 3D view |
| `camera_distance` | number | `0.5` | Initial camera distance (0.2-1.5) |
| `enable_passive_joints` | boolean | `true` | Show Stewart platform passive joints |
| `enable_grid` | boolean | `true` | Show floor grid |

## Connection Status

| Status | Color | Description |
|--------|-------|-------------|
| Connected | 🟢 Green | Successfully connected, receiving data |
| Reconnecting | 🟠 Orange | Connection lost, attempting to reconnect |
| Offline | 🔴 Red | Unable to connect after multiple attempts |

## API

The card connects to the Reachy Mini daemon:

**Primary (WebSocket):**
```
ws://{host}:{port}/api/state/ws/full?frequency=20&with_head_pose=true&use_pose_matrix=true&with_head_joints=true&with_antenna_positions=true&with_passive_joints=true
```

**Fallback (HTTP polling):**
```
http://{host}:{port}/api/state/full?with_control_mode=true&with_head_joints=true&with_body_yaw=true&with_antenna_positions=true
```



## Troubleshooting

### Card not showing
- Clear browser cache (Ctrl+Shift+R)
- Check browser console for errors (F12)

### Connection issues
- Verify daemon is running: `curl http://<host>:<port>/api/state/full`
- Check firewall settings

### 3D model not loading
- Check browser console for 404 errors
- Ensure `dist/assets/` folder is present

## License

MIT License

## Credits

- [Three.js](https://threejs.org/)
- [urdf-loader](https://github.com/gkjohnson/urdf-loaders)
- [Pollen Robotics](https://www.pollen-robotics.com/)
