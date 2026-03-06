/**
 * Reachy Mini 3D Card for Home Assistant
 * 
 * A custom Lovelace card that displays a real-time 3D visualization
 * of the Reachy Mini robot by connecting to the daemon via WebSocket.
 */

// Import Three.js and related libraries
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import URDFLoader from 'urdf-loader';

// Card version
const CARD_VERSION = '0.9.3';

/**
 * WebSocket configuration constants
 */
const WEBSOCKET_CONFIG = {
  // Data frequency in Hz (Requirement 2.3)
  frequency: 20,
  // Maximum reconnection attempts before giving up (Requirement 2.7)
  maxReconnectAttempts: 3,
  // Base delay for exponential backoff in ms
  baseReconnectDelay: 1000,
  // Maximum delay between reconnection attempts in ms
  maxReconnectDelay: 10000
};

/**
 * Robot joint name constants (from URDF model)
 */
const ROBOT_JOINTS = {
  // Stewart platform active joints (controlled by motors)
  STEWART: ['stewart_1', 'stewart_2', 'stewart_3', 'stewart_4', 'stewart_5', 'stewart_6'],
  // Stewart platform passive joints (calculated from kinematics)
  PASSIVE: [
    'passive_1_x', 'passive_1_y', 'passive_1_z',
    'passive_2_x', 'passive_2_y', 'passive_2_z',
    'passive_3_x', 'passive_3_y', 'passive_3_z',
    'passive_4_x', 'passive_4_y', 'passive_4_z',
    'passive_5_x', 'passive_5_y', 'passive_5_z',
    'passive_6_x', 'passive_6_y', 'passive_6_z',
    'passive_7_x', 'passive_7_y', 'passive_7_z'
  ],
  // Antenna joints
  ANTENNAS: ['left_antenna', 'right_antenna'],
  // Body rotation
  YAW_BODY: 'yaw_body'
};

/**
 * Asset paths configuration
 * 
 * Note: Supports both HACS installation methods:
 * 1. content_in_root: true  -> /hacsfiles/ha-reachy-mini/assets/...
 * 2. content_in_root: false -> /hacsfiles/ha-reachy-mini/dist/assets/...
 */
const ASSET_PATHS = {
  // Base path for assets (HACS installation path)
  BASE: '/hacsfiles/ha-reachy-mini/dist/assets',
  // URDF file path
  URDF: '/hacsfiles/ha-reachy-mini/dist/assets/robot-3d/reachy-mini.urdf',
  // Meshes directory
  MESHES: '/hacsfiles/ha-reachy-mini/dist/assets/robot-3d/meshes'
};

/**
 * Get the base path for assets, with automatic detection
 * This function tries to detect the correct path based on where the card is loaded from
 * @returns {string} - The base path for assets
 */
function getAssetBasePath() {
  // Try to detect the path from the current script location
  const scripts = document.querySelectorAll('script[src*="ha-reachy-mini-card"]');
  if (scripts.length > 0) {
    const scriptSrc = scripts[scripts.length - 1].src;
    const url = new URL(scriptSrc);
    // Extract the base path (remove the filename)
    const pathParts = url.pathname.split('/');
    pathParts.pop(); // Remove filename (ha-reachy-mini-card.js)
    
    // Check if we're in a dist/ subdirectory
    const basePath = pathParts.join('/');
    
    // If path ends with /dist, assets are in /dist/assets
    // If path doesn't end with /dist, assets are in /assets (content_in_root: true)
    if (basePath.endsWith('/dist')) {
      return basePath + '/assets';
    } else {
      return basePath + '/assets';
    }
  }
  
  // Fallback to default HACS path
  return ASSET_PATHS.BASE;
}

/**
 * Get asset paths with automatic path detection
 * @returns {Object} - Asset paths object
 */
function getAssetPaths() {
  const basePath = getAssetBasePath();
  return {
    BASE: basePath,
    URDF: `${basePath}/robot-3d/reachy-mini.urdf`,
    MESHES: `${basePath}/robot-3d/meshes`
  };
}

/**
 * Three.js scene configuration constants
 */
const SCENE_CONFIG = {
  // Camera settings
  camera: {
    fov: 50,
    near: 0.01,
    far: 100,
    defaultTarget: [0, 0.15, 0], // Look at robot center
  },
  // Lighting settings (three-point lighting)
  lighting: {
    ambient: {
      color: 0xffffff,
      intensity: 0.4
    },
    key: {
      color: 0xffffff,
      intensity: 1.5,
      position: [2, 4, 2]
    },
    fill: {
      color: 0xffffff,
      intensity: 0.4,
      position: [-2, 2, 1.5]
    },
    rim: {
      color: 0xffb366, // Warm orange for rim light
      intensity: 0.6,
      position: [0, 3, -2]
    }
  },
  // Grid settings
  grid: {
    size: 1,
    divisions: 10,
    majorColor: '#999999',
    minorColor: '#cccccc',
    opacity: 0.5
  },
  // OrbitControls settings
  controls: {
    enableDamping: true,
    dampingFactor: 0.05,
    enablePan: false,
    minDistance: 0.2,
    maxDistance: 1.5,
    enableRotate: true,
    enableZoom: true
  },
  // Renderer settings
  renderer: {
    antialias: true,
    alpha: true,
    maxPixelRatio: 2, // Limit to 2x to prevent GPU overload (Requirement 5.3)
    powerPreference: 'high-performance'
  }
};

/**
 * Kinematics constants for passive joint calculation
 * Ported from Rust WASM module (kinematics-wasm/src/lib.rs)
 */
const KINEMATICS_CONFIG = {
  // Head Z offset (from kinematics_data.json)
  HEAD_Z_OFFSET: 0.177,
  // Motor arm length (from kinematics_data.json)
  MOTOR_ARM_LENGTH: 0.04,
  // XL330 frame pose in head frame (from URDF)
  T_HEAD_XL_330: [
    [0.4822, -0.7068, -0.5177, 0.0206],
    [0.1766, -0.5003, 0.8476, -0.0218],
    [-0.8581, -0.5001, -0.1164, 0.0],
    [0.0, 0.0, 0.0, 1.0]
  ],
  // Passive joint orientation offsets (from URDF)
  PASSIVE_ORIENTATION_OFFSET: [
    [-0.13754, -0.0882156, 2.10349],
    [-Math.PI, 5.37396e-16, -Math.PI],
    [0.373569, 0.0882156, -1.0381],
    [-0.0860846, 0.0882156, 1.0381],
    [0.123977, 0.0882156, -1.0381],
    [3.0613, 0.0882156, 1.0381],
    [Math.PI, 2.10388e-17, 4.15523e-17]
  ],
  // Stewart rod direction in passive frame (from URDF)
  STEWART_ROD_DIR_IN_PASSIVE_FRAME: [
    [1.0, 0.0, 0.0],
    [0.50606941, -0.85796418, -0.08826792],
    [-1.0, 0.0, 0.0],
    [-1.0, 0.0, 0.0],
    [-1.0, 0.0, 0.0],
    [-1.0, 0.0, 0.0]
  ],
  // Motor data from kinematics_data.json
  MOTORS: [
    // stewart_1
    {
      branchPosition: [0.020648178337122566, 0.021763723638894568, 1.0345743467476964e-07],
      tWorldMotor: [
        [0.8660247915798899, 0.0000044901959360, -0.5000010603477224, 0.0269905781109381],
        [-0.5000010603626028, 0.0000031810770988, -0.8660247915770969, 0.0267489144601032],
        [-0.0000022980790772, 0.9999999999848599, 0.0000049999943606, 0.0766332540902687],
        [0.0, 0.0, 0.0, 1.0]
      ]
    },
    // stewart_2
    {
      branchPosition: [0.00852381571767217, 0.028763668526131346, 1.183437210727778e-07],
      tWorldMotor: [
        [-0.8660211183436273, -0.0000044902196459, -0.5000074225075980, 0.0096699703080478],
        [0.5000074225224782, -0.0000031810634097, -0.8660211183408341, 0.0367490037948058],
        [0.0000022980697230, -0.9999999999848597, 0.0000050000112432, 0.0766333000521544],
        [0.0, 0.0, 0.0, 1.0]
      ]
    },
    // stewart_3
    {
      branchPosition: [-0.029172011376922807, 0.0069999429399361995, 4.0290270064691214e-08],
      tWorldMotor: [
        [0.0000063267948970, -0.0000010196153098, 0.9999999999794665, -0.0366606982562266],
        [0.9999999999799865, 0.0000000000135060, -0.0000063267948965, 0.0100001160862987],
        [-0.0000000000070551, 0.9999999999994809, 0.0000010196153103, 0.0766334229944826],
        [0.0, 0.0, 0.0, 1.0]
      ]
    },
    // stewart_4
    {
      branchPosition: [-0.029172040355214434, -0.0069999960097160766, -3.1608172912367394e-08],
      tWorldMotor: [
        [-0.0000036732050704, 0.0000010196153103, 0.9999999999927344, -0.0366607717202358],
        [-0.9999999999932538, -0.0000000000036776, -0.0000036732050700, -0.0099998653384376],
        [-0.0000000000000677, -0.9999999999994809, 0.0000010196153103, 0.0766334229944823],
        [0.0, 0.0, 0.0, 1.0]
      ]
    },
    // stewart_5
    {
      branchPosition: [0.008523809101930114, -0.028763713010385224, -1.4344916837716326e-07],
      tWorldMotor: [
        [-0.8660284647694136, 0.0000044901728834, -0.4999946981608615, 0.0096697448698383],
        [-0.4999946981757425, -0.0000031811099295, 0.8660284647666202, -0.0367490491228644],
        [0.0000022980794298, 0.9999999999848597, 0.0000049999943840, 0.0766333000520353],
        [0.0, 0.0, 0.0, 1.0]
      ]
    },
    // stewart_6
    {
      branchPosition: [0.020648186722822436, -0.02176369606185343, -8.957920105689965e-08],
      tWorldMotor: [
        [0.8660247915798903, -0.0000044901962204, -0.5000010603477218, 0.0269903370664035],
        [0.5000010603626028, 0.0000031810964559, 0.8660247915770964, -0.0267491384573748],
        [-0.0000022980696448, -0.9999999999848597, 0.0000050000112666, 0.0766332540903862],
        [0.0, 0.0, 0.0, 1.0]
      ]
    }
  ]
};

/**
 * Convert head pose from {x, y, z, roll, pitch, yaw} to 4x4 transformation matrix
 * @param {Object} pose - Head pose object with x, y, z, roll, pitch, yaw
 * @returns {number[]} - 16 element array (4x4 matrix, row-major)
 */
export function headPoseToMatrix(pose) {
  if (!pose || typeof pose !== 'object') {
    return null;
  }
  
  const { x = 0, y = 0, z = 0, roll = 0, pitch = 0, yaw = 0 } = pose;
  
  // Create rotation matrix from euler angles (XYZ extrinsic = ZYX intrinsic)
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  
  // Rotation matrix R = Rz(yaw) * Ry(pitch) * Rx(roll)
  const r00 = cy * cp;
  const r01 = cy * sp * sr - sy * cr;
  const r02 = cy * sp * cr + sy * sr;
  const r10 = sy * cp;
  const r11 = sy * sp * sr + cy * cr;
  const r12 = sy * sp * cr - cy * sr;
  const r20 = -sp;
  const r21 = cp * sr;
  const r22 = cp * cr;
  
  // Return 4x4 transformation matrix (row-major)
  return [
    r00, r01, r02, x,
    r10, r11, r12, y,
    r20, r21, r22, z,
    0, 0, 0, 1
  ];
}

/**
 * Create rotation matrix from euler angles (xyz intrinsic = Z * Y * X matrix order)
 * @param {number} x - X rotation angle
 * @param {number} y - Y rotation angle
 * @param {number} z - Z rotation angle
 * @returns {number[][]} - 3x3 rotation matrix
 */
function rotationFromEulerXYZ(x, y, z) {
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  
  return [
    [cy * cz, cz * sx * sy - cx * sz, cx * cz * sy + sx * sz],
    [cy * sz, cx * cz + sx * sy * sz, cx * sy * sz - cz * sx],
    [-sy, cy * sx, cx * cy]
  ];
}

/**
 * Extract euler angles (XYZ order) from rotation matrix
 * @param {number[][]} r - 3x3 rotation matrix
 * @returns {number[]} - [x, y, z] euler angles
 */
function eulerFromRotationXYZ(r) {
  const sy = r[0][2];
  
  if (Math.abs(sy) < 0.99999) {
    const x = Math.atan2(-r[1][2], r[2][2]);
    const y = Math.asin(sy);
    const z = Math.atan2(-r[0][1], r[0][0]);
    return [x, y, z];
  } else {
    // Gimbal lock
    const x = Math.atan2(r[2][1], r[1][1]);
    const y = sy > 0 ? Math.PI / 2 : -Math.PI / 2;
    const z = 0;
    return [x, y, z];
  }
}

/**
 * Multiply two 3x3 matrices
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix
 * @returns {number[][]} - Result matrix
 */
function multiplyMatrix3(a, b) {
  const result = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

/**
 * Transpose a 3x3 matrix
 * @param {number[][]} m - Matrix to transpose
 * @returns {number[][]} - Transposed matrix
 */
function transposeMatrix3(m) {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]]
  ];
}

/**
 * Multiply 3x3 matrix by 3D vector
 * @param {number[][]} m - 3x3 matrix
 * @param {number[]} v - 3D vector
 * @returns {number[]} - Result vector
 */
function multiplyMatrixVector3(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

/**
 * Normalize a 3D vector
 * @param {number[]} v - Vector to normalize
 * @returns {number[]} - Normalized vector
 */
function normalizeVector3(v) {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 0.00001) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Dot product of two 3D vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} - Dot product
 */
function dotVector3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Cross product of two 3D vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number[]} - Cross product
 */
function crossVector3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

/**
 * Align vectors: find rotation that aligns 'from' to 'to'
 * @param {number[]} from - Source vector
 * @param {number[]} to - Target vector
 * @returns {number[][]} - 3x3 rotation matrix
 */
function alignVectors(from, to) {
  const fromN = normalizeVector3(from);
  const toN = normalizeVector3(to);
  const dot = dotVector3(fromN, toN);
  
  // If vectors are nearly parallel
  if (dot > 0.99999) {
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }
  
  // If vectors are nearly opposite
  if (dot < -0.99999) {
    let perp = crossVector3([1, 0, 0], fromN);
    if (Math.sqrt(dotVector3(perp, perp)) < 0.001) {
      perp = crossVector3([0, 1, 0], fromN);
    }
    const axis = normalizeVector3(perp);
    const k = [
      [0, -axis[2], axis[1]],
      [axis[2], 0, -axis[0]],
      [-axis[1], axis[0], 0]
    ];
    const k2 = multiplyMatrix3(k, k);
    return [
      [1 + 2 * k2[0][0], 2 * k2[0][1], 2 * k2[0][2]],
      [2 * k2[1][0], 1 + 2 * k2[1][1], 2 * k2[1][2]],
      [2 * k2[2][0], 2 * k2[2][1], 1 + 2 * k2[2][2]]
    ];
  }
  
  // General case: Rodrigues' rotation formula
  const cross = crossVector3(fromN, toN);
  const s = Math.sqrt(dotVector3(cross, cross));
  const c = dot;
  
  const k = [
    [0, -cross[2], cross[1]],
    [cross[2], 0, -cross[0]],
    [-cross[1], cross[0], 0]
  ];
  const k2 = multiplyMatrix3(k, k);
  const factor = (1 - c) / (s * s);
  
  return [
    [1 + k[0][0] + k2[0][0] * factor, k[0][1] + k2[0][1] * factor, k[0][2] + k2[0][2] * factor],
    [k[1][0] + k2[1][0] * factor, 1 + k[1][1] + k2[1][1] * factor, k[1][2] + k2[1][2] * factor],
    [k[2][0] + k2[2][0] * factor, k[2][1] + k2[2][1] * factor, 1 + k[2][2] + k2[2][2] * factor]
  ];
}

/**
 * Calculate passive joint angles from head joints and head pose
 * Ported from Rust WASM module
 * 
 * @param {number[]} headJoints - Array of 7 floats: [yaw_body, stewart_1, ..., stewart_6]
 * @param {number[]} headPoseMatrix - 4x4 transformation matrix as 16 floats (row-major)
 * @returns {number[]} - Array of 21 floats: passive joint angles
 */
export function calculatePassiveJoints(headJoints, headPoseMatrix) {
  if (!headJoints || headJoints.length < 7 || !headPoseMatrix || headPoseMatrix.length < 16) {
    return new Array(21).fill(0);
  }
  
  const bodyYaw = headJoints[0];
  const motors = KINEMATICS_CONFIG.MOTORS;
  
  // Build pose matrix and add head Z offset
  const pose = [
    [headPoseMatrix[0], headPoseMatrix[1], headPoseMatrix[2], headPoseMatrix[3]],
    [headPoseMatrix[4], headPoseMatrix[5], headPoseMatrix[6], headPoseMatrix[7]],
    [headPoseMatrix[8], headPoseMatrix[9], headPoseMatrix[10], headPoseMatrix[11] + KINEMATICS_CONFIG.HEAD_Z_OFFSET],
    [0, 0, 0, 1]
  ];
  
  // Apply inverse body yaw rotation
  const cosYaw = Math.cos(bodyYaw);
  const sinYaw = Math.sin(bodyYaw);
  const rZInv = [
    [cosYaw, sinYaw, 0],
    [-sinYaw, cosYaw, 0],
    [0, 0, 1]
  ];
  
  // Rotate pose
  const poseRot = [
    [pose[0][0], pose[0][1], pose[0][2]],
    [pose[1][0], pose[1][1], pose[1][2]],
    [pose[2][0], pose[2][1], pose[2][2]]
  ];
  const poseTrans = [pose[0][3], pose[1][3], pose[2][3]];
  const rotatedPoseRot = multiplyMatrix3(rZInv, poseRot);
  const rotatedPoseTrans = multiplyMatrixVector3(rZInv, poseTrans);
  
  // Pre-compute passive correction rotations
  const passiveCorrections = KINEMATICS_CONFIG.PASSIVE_ORIENTATION_OFFSET.map(offset => 
    rotationFromEulerXYZ(offset[0], offset[1], offset[2])
  );
  
  const passiveJoints = new Array(21).fill(0);
  let lastRServoBranch = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let lastRWorldServo = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  
  // For each of the 6 stewart motors
  for (let i = 0; i < 6; i++) {
    const motor = motors[i];
    const stewartJoint = headJoints[i + 1];
    
    // Calculate branch position on platform in world frame
    const branchPos = motor.branchPosition;
    const branchPosWorld = [
      rotatedPoseRot[0][0] * branchPos[0] + rotatedPoseRot[0][1] * branchPos[1] + rotatedPoseRot[0][2] * branchPos[2] + rotatedPoseTrans[0],
      rotatedPoseRot[1][0] * branchPos[0] + rotatedPoseRot[1][1] * branchPos[1] + rotatedPoseRot[1][2] * branchPos[2] + rotatedPoseTrans[1],
      rotatedPoseRot[2][0] * branchPos[0] + rotatedPoseRot[2][1] * branchPos[1] + rotatedPoseRot[2][2] * branchPos[2] + rotatedPoseTrans[2]
    ];
    
    // Compute servo rotation (rotating around Z axis)
    const cosZ = Math.cos(stewartJoint);
    const sinZ = Math.sin(stewartJoint);
    const rServo = [
      [cosZ, -sinZ, 0],
      [sinZ, cosZ, 0],
      [0, 0, 1]
    ];
    
    // T_world_motor from motor data
    const tWorldMotor = motor.tWorldMotor;
    const tWorldMotorRot = [
      [tWorldMotor[0][0], tWorldMotor[0][1], tWorldMotor[0][2]],
      [tWorldMotor[1][0], tWorldMotor[1][1], tWorldMotor[1][2]],
      [tWorldMotor[2][0], tWorldMotor[2][1], tWorldMotor[2][2]]
    ];
    const tWorldMotorTrans = [tWorldMotor[0][3], tWorldMotor[1][3], tWorldMotor[2][3]];
    
    // Compute world servo arm position
    const servoArmLocal = [KINEMATICS_CONFIG.MOTOR_ARM_LENGTH, 0, 0];
    const servoPosLocal = multiplyMatrixVector3(rServo, servoArmLocal);
    const pWorldServoArm = [
      tWorldMotorRot[0][0] * servoPosLocal[0] + tWorldMotorRot[0][1] * servoPosLocal[1] + tWorldMotorRot[0][2] * servoPosLocal[2] + tWorldMotorTrans[0],
      tWorldMotorRot[1][0] * servoPosLocal[0] + tWorldMotorRot[1][1] * servoPosLocal[1] + tWorldMotorRot[1][2] * servoPosLocal[2] + tWorldMotorTrans[1],
      tWorldMotorRot[2][0] * servoPosLocal[0] + tWorldMotorRot[2][1] * servoPosLocal[1] + tWorldMotorRot[2][2] * servoPosLocal[2] + tWorldMotorTrans[2]
    ];
    
    // Apply passive correction to orientation
    const rWorldServo = multiplyMatrix3(multiplyMatrix3(tWorldMotorRot, rServo), passiveCorrections[i]);
    
    // Vector from servo arm to branch in world frame
    const vecServoToBranch = [
      branchPosWorld[0] - pWorldServoArm[0],
      branchPosWorld[1] - pWorldServoArm[1],
      branchPosWorld[2] - pWorldServoArm[2]
    ];
    
    // Transform to servo frame
    const rWorldServoT = transposeMatrix3(rWorldServo);
    const vecServoToBranchInServo = multiplyMatrixVector3(rWorldServoT, vecServoToBranch);
    
    // Rod direction in passive frame
    const rodDir = KINEMATICS_CONFIG.STEWART_ROD_DIR_IN_PASSIVE_FRAME[i];
    
    // Normalize and get straight line direction
    const straightLineDir = normalizeVector3(vecServoToBranchInServo);
    
    // Align rod direction to actual direction
    const rServoBranch = alignVectors(rodDir, straightLineDir);
    const euler = eulerFromRotationXYZ(rServoBranch);
    
    passiveJoints[i * 3] = euler[0];
    passiveJoints[i * 3 + 1] = euler[1];
    passiveJoints[i * 3 + 2] = euler[2];
    
    // Save for 7th passive joint calculation
    if (i === 5) {
      lastRServoBranch = rServoBranch;
      lastRWorldServo = rWorldServo;
    }
  }
  
  // 7th passive joint (XL330 on the head)
  const tHeadXl330Rot = [
    [KINEMATICS_CONFIG.T_HEAD_XL_330[0][0], KINEMATICS_CONFIG.T_HEAD_XL_330[0][1], KINEMATICS_CONFIG.T_HEAD_XL_330[0][2]],
    [KINEMATICS_CONFIG.T_HEAD_XL_330[1][0], KINEMATICS_CONFIG.T_HEAD_XL_330[1][1], KINEMATICS_CONFIG.T_HEAD_XL_330[1][2]],
    [KINEMATICS_CONFIG.T_HEAD_XL_330[2][0], KINEMATICS_CONFIG.T_HEAD_XL_330[2][1], KINEMATICS_CONFIG.T_HEAD_XL_330[2][2]]
  ];
  const rHeadXl330 = multiplyMatrix3(rotatedPoseRot, tHeadXl330Rot);
  
  // Current rod orientation with correction for 7th passive joint
  const rRodCurrent = multiplyMatrix3(multiplyMatrix3(lastRWorldServo, lastRServoBranch), passiveCorrections[6]);
  
  // Compute relative rotation
  const rDof = multiplyMatrix3(transposeMatrix3(rRodCurrent), rHeadXl330);
  const euler7 = eulerFromRotationXYZ(rDof);
  
  passiveJoints[18] = euler7[0];
  passiveJoints[19] = euler7[1];
  passiveJoints[20] = euler7[2];
  
  return passiveJoints;
}

// Log card info
console.info(
  `%c REACHY-MINI-3D-CARD %c v${CARD_VERSION} `,
  'color: white; background: #3498db; font-weight: bold;',
  'color: #3498db; background: white; font-weight: bold;'
);

/**
 * Default configuration values for the card
 */
export const DEFAULT_CONFIG = {
  daemon_host: 'localhost',
  daemon_port: 8000,
  height: 400,
  background_color: '#f5f5f5',
  camera_distance: 0.5,
  enable_passive_joints: true,
  enable_head_pose: true,
  enable_grid: true
};

/**
 * Configuration validation ranges
 */
const CONFIG_RANGES = {
  camera_distance: { min: 0.2, max: 1.5 },
  height: { min: 100, max: 2000 },
  daemon_port: { min: 1, max: 65535 }
};

/**
 * Validates and applies configuration with defaults
 * @param {Object} config - User provided configuration
 * @returns {Object} - Validated configuration with defaults applied
 */
export function validateConfig(config) {
  const result = { ...DEFAULT_CONFIG };
  
  if (!config || typeof config !== 'object') {
    return result;
  }

  // daemon_host - string validation
  if (typeof config.daemon_host === 'string' && config.daemon_host.trim() !== '') {
    result.daemon_host = config.daemon_host.trim();
  }

  // daemon_port - number validation with range clamping
  if (typeof config.daemon_port === 'number' && !isNaN(config.daemon_port)) {
    result.daemon_port = Math.max(
      CONFIG_RANGES.daemon_port.min,
      Math.min(CONFIG_RANGES.daemon_port.max, Math.floor(config.daemon_port))
    );
  } else if (typeof config.daemon_port === 'string') {
    const parsed = parseInt(config.daemon_port, 10);
    if (!isNaN(parsed)) {
      result.daemon_port = Math.max(
        CONFIG_RANGES.daemon_port.min,
        Math.min(CONFIG_RANGES.daemon_port.max, parsed)
      );
    }
  }

  // height - number validation with range clamping
  if (typeof config.height === 'number' && !isNaN(config.height)) {
    result.height = Math.max(
      CONFIG_RANGES.height.min,
      Math.min(CONFIG_RANGES.height.max, Math.floor(config.height))
    );
  } else if (typeof config.height === 'string') {
    const parsed = parseInt(config.height, 10);
    if (!isNaN(parsed)) {
      result.height = Math.max(
        CONFIG_RANGES.height.min,
        Math.min(CONFIG_RANGES.height.max, parsed)
      );
    }
  }

  // background_color - string validation (basic hex color check)
  if (typeof config.background_color === 'string' && config.background_color.trim() !== '') {
    result.background_color = config.background_color.trim();
  }

  // camera_distance - number validation with range clamping
  if (typeof config.camera_distance === 'number' && !isNaN(config.camera_distance)) {
    result.camera_distance = Math.max(
      CONFIG_RANGES.camera_distance.min,
      Math.min(CONFIG_RANGES.camera_distance.max, config.camera_distance)
    );
  } else if (typeof config.camera_distance === 'string') {
    const parsed = parseFloat(config.camera_distance);
    if (!isNaN(parsed)) {
      result.camera_distance = Math.max(
        CONFIG_RANGES.camera_distance.min,
        Math.min(CONFIG_RANGES.camera_distance.max, parsed)
      );
    }
  }

  // enable_passive_joints - boolean validation
  if (typeof config.enable_passive_joints === 'boolean') {
    result.enable_passive_joints = config.enable_passive_joints;
  }

  // enable_head_pose - boolean validation
  if (typeof config.enable_head_pose === 'boolean') {
    result.enable_head_pose = config.enable_head_pose;
  }

  // enable_grid - boolean validation
  if (typeof config.enable_grid === 'boolean') {
    result.enable_grid = config.enable_grid;
  }

  return result;
}

/**
 * Calculate card size in Home Assistant grid units
 * @param {number} height - Card height in pixels
 * @returns {number} - Card size in grid units
 */
export function calculateCardSize(height) {
  return Math.ceil(height / 50);
}

/**
 * Build HTTP API URL from configuration
 * URL format: http://{daemon_host}:{daemon_port}/api/state/full?with_control_mode=true&with_head_joints=true&with_body_yaw=true&with_antenna_positions=true
 * Requirements: 2.1, 2.2, 2.3
 * 
 * @param {string} daemonHost - The daemon host address
 * @param {number} daemonPort - The daemon port number
 * @returns {string} - The constructed HTTP URL
 */
export function buildApiUrl(daemonHost, daemonPort) {
  const host = daemonHost || DEFAULT_CONFIG.daemon_host;
  const port = daemonPort || DEFAULT_CONFIG.daemon_port;
  
  const baseUrl = `http://${host}:${port}/api/state/full`;
  const params = new URLSearchParams({
    with_control_mode: 'true',
    with_head_joints: 'true',
    with_body_yaw: 'true',
    with_antenna_positions: 'true'
  });
  
  return `${baseUrl}?${params.toString()}`;
}

// Keep old function name for backward compatibility with tests
export const buildWebSocketUrl = buildApiUrl;

/**
 * Parse robot state message from WebSocket
 * Handles different message formats (array vs object)
 * Requirement: 2.6
 * 
 * @param {Object} message - The raw message from WebSocket
 * @returns {Object} - Parsed robot state with headJoints, antennas, passiveJoints, headPose
 */
export function parseRobotStateMessage(message) {
  const result = {
    headJoints: null,
    antennas: null,
    passiveJoints: null,
    headPose: null
  };
  
  if (!message || typeof message !== 'object') {
    return result;
  }
  
  // Parse head_joints - array of 7 values [yaw_body, stewart_1, ..., stewart_6]
  if (message.head_joints) {
    if (Array.isArray(message.head_joints)) {
      result.headJoints = message.head_joints;
    } else if (typeof message.head_joints === 'object' && message.head_joints.values) {
      // Handle object format with values array
      result.headJoints = message.head_joints.values;
    }
  }
  
  // Parse antennas_position - array of 2 values [left, right]
  if (message.antennas_position) {
    if (Array.isArray(message.antennas_position)) {
      result.antennas = message.antennas_position;
    } else if (typeof message.antennas_position === 'object' && message.antennas_position.values) {
      result.antennas = message.antennas_position.values;
    }
  }
  
  // Parse passive_joints - array of 21 values
  if (message.passive_joints) {
    if (Array.isArray(message.passive_joints)) {
      result.passiveJoints = message.passive_joints;
    } else if (typeof message.passive_joints === 'object' && message.passive_joints.values) {
      result.passiveJoints = message.passive_joints.values;
    }
  }
  
  // Parse head_pose - 4x4 matrix (16 values)
  if (message.head_pose) {
    if (Array.isArray(message.head_pose)) {
      result.headPose = message.head_pose;
    } else if (typeof message.head_pose === 'object') {
      // Handle object format with 'm' array (common matrix format)
      if (message.head_pose.m && Array.isArray(message.head_pose.m)) {
        result.headPose = message.head_pose.m;
      } else if (message.head_pose.values && Array.isArray(message.head_pose.values)) {
        result.headPose = message.head_pose.values;
      }
    }
  }
  
  return result;
}

/**
 * Calculate reconnection delay with exponential backoff
 * Requirement: 2.5
 * 
 * @param {number} attempt - Current reconnection attempt number (0-based)
 * @returns {number} - Delay in milliseconds before next reconnection attempt
 */
export function calculateReconnectDelay(attempt) {
  // Exponential backoff: baseDelay * 2^attempt, capped at maxDelay
  const delay = WEBSOCKET_CONFIG.baseReconnectDelay * Math.pow(2, attempt);
  return Math.min(delay, WEBSOCKET_CONFIG.maxReconnectDelay);
}

/**
 * ReachyMini3DCard - Home Assistant custom card for 3D robot visualization
 */
class ReachyMini3DCard extends HTMLElement {
  constructor() {
    super();
    
    // Configuration
    this._config = null;
    
    // Three.js objects (will be initialized in later tasks)
    this._scene = null;
    this._camera = null;
    this._renderer = null;
    this._robot = null;
    this._controls = null;
    this._gridHelper = null;
    
    // WebSocket (will be initialized in later tasks)
    this._ws = null;
    this._reconnectAttempts = 0;
    this._reconnectTimeout = null;
    
    // Connection state
    this._connectionState = 'disconnected'; // 'connected' | 'disconnected' | 'reconnecting'
    
    // Robot state
    this._robotState = {
      headJoints: null,
      antennas: [0, 0],
      passiveJoints: null,
      headPose: null
    };
    
    // DOM references
    this._container = null;
    this._canvas = null;
    this._statusIndicator = null;
    
    // Animation frame ID for cleanup
    this._animationFrameId = null;
    
    // Visibility observer
    this._intersectionObserver = null;
    this._isVisible = true;
    
    // HTTP polling interval
    this._pollingInterval = null;
    
    // Render loop throttling (Requirement 5.1)
    // Target 20Hz to match WebSocket frequency
    this._targetFPS = WEBSOCKET_CONFIG.frequency;
    this._frameInterval = 1000 / this._targetFPS; // ~50ms per frame
    this._lastFrameTime = 0;
    
    // Robot loading state
    this._robotLoading = false;
    this._robotLoadError = null;
    this._failedAssets = [];
  }

  /**
   * Set card configuration from Lovelace YAML
   * @param {Object} config - Configuration object from Lovelace
   */
  setConfig(config) {
    this._config = validateConfig(config);
    
    // If already connected to DOM, update the view
    if (this.shadowRoot && this._container) {
      this._updateContainerHeight();
      this._updateStatusIndicator();
      this._updateBackgroundColor();
      this._updateGridVisibility();
      this._updateCameraDistance();
    }
  }

  /**
   * Get card size in Home Assistant grid units
   * @returns {number} - Card height in grid units (height / 50, rounded up)
   */
  getCardSize() {
    const height = this._config?.height ?? DEFAULT_CONFIG.height;
    return calculateCardSize(height);
  }

  /**
   * Return the configuration element for the card editor
   * This enables the visual configuration UI in Home Assistant
   */
  static getConfigElement() {
    return document.createElement('ha-reachy-mini-card-editor');
  }

  /**
   * Return stub config for the card picker
   */
  static getStubConfig() {
    return {
      daemon_host: 'localhost',
      daemon_port: 8000,
      height: 400
    };
  }

  /**
   * Called when element is added to the DOM
   */
  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    
    this._render();
    this._setupIntersectionObserver();
    
    // Initialize Three.js after DOM is ready
    // Use requestAnimationFrame to ensure container has dimensions
    requestAnimationFrame(() => {
      this._initThreeJS();
      // Connect to WebSocket after Three.js is initialized
      this._connectWebSocket();
    });
  }

  /**
   * Called when element is removed from the DOM
   */
  disconnectedCallback() {
    this._dispose();
  }

  /**
   * Render the card's shadow DOM structure
   */
  _render() {
    const height = this._config?.height ?? DEFAULT_CONFIG.height;
    const backgroundColor = this._config?.background_color ?? DEFAULT_CONFIG.background_color;
    
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        
        .card-container {
          position: relative;
          width: 100%;
          height: ${height}px;
          background: ${backgroundColor};
          border-radius: var(--ha-card-border-radius, 12px);
          overflow: hidden;
        }
        
        .canvas-container {
          width: 100%;
          height: 100%;
        }
        
        .canvas-container canvas {
          display: block;
          width: 100%;
          height: 100%;
        }
        
        .status-indicator {
          position: absolute;
          bottom: 8px;
          left: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 4px;
          font-size: 12px;
          color: white;
          font-family: var(--paper-font-common-base_-_font-family, 'Roboto', sans-serif);
        }
        
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        
        .status-dot.connected {
          background-color: #4caf50;
        }
        
        .status-dot.disconnected {
          background-color: #f44336;
        }
        
        .status-dot.reconnecting {
          background-color: #ff9800;
        }
        
        .error-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 16px;
          text-align: center;
        }
        
        .error-message {
          max-width: 80%;
        }
      </style>
      
      <ha-card>
        <div class="card-container">
          <div class="canvas-container" id="canvas-container">
            <!-- Three.js canvas will be inserted here -->
          </div>
          <div class="status-indicator">
            <div class="status-dot ${this._connectionState}"></div>
            <span class="status-label">${this._getStatusLabel()}</span>
          </div>
        </div>
      </ha-card>
    `;
    
    // Store DOM references
    this._container = this.shadowRoot.querySelector('.card-container');
    this._canvasContainer = this.shadowRoot.querySelector('#canvas-container');
    this._statusIndicator = this.shadowRoot.querySelector('.status-indicator');
  }

  /**
   * Get status label based on connection state
   * @returns {string} - Status label text
   */
  _getStatusLabel() {
    switch (this._connectionState) {
      case 'connected':
        return 'Connected';
      case 'reconnecting':
        return 'Reconnecting';
      case 'disconnected':
      default:
        return 'Offline';
    }
  }

  /**
   * Update the container height based on configuration
   */
  _updateContainerHeight() {
    if (this._container) {
      const height = this._config?.height ?? DEFAULT_CONFIG.height;
      this._container.style.height = `${height}px`;
    }
  }

  /**
   * Update the status indicator display
   */
  _updateStatusIndicator() {
    if (this._statusIndicator) {
      const dot = this._statusIndicator.querySelector('.status-dot');
      const label = this._statusIndicator.querySelector('.status-label');
      
      if (dot) {
        dot.className = `status-dot ${this._connectionState}`;
      }
      if (label) {
        label.textContent = this._getStatusLabel();
      }
    }
  }

  /**
   * Set up intersection observer for visibility-based rendering
   * Requirement: 5.5
   */
  _setupIntersectionObserver() {
    if (typeof IntersectionObserver !== 'undefined') {
      this._intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const wasVisible = this._isVisible;
            this._isVisible = entry.isIntersecting;
            
            // Pause/resume render loop based on visibility (Requirement 5.5)
            if (this._isVisible && !wasVisible) {
              // Card became visible - restart render loop
              if (!this._animationFrameId && this._renderer) {
                this._startRenderLoop();
              }
            } else if (!this._isVisible && wasVisible) {
              // Card became hidden - stop render loop to conserve resources
              this._stopRenderLoop();
            }
          });
        },
        { threshold: 0.1 }
      );
      
      this._intersectionObserver.observe(this);
    }
  }

  /**
   * Initialize Three.js scene, camera, renderer, lighting, controls, and grid
   * Requirements: 3.2, 3.6, 3.7, 3.8, 4.4, 5.3
   */
  _initThreeJS() {
    if (!this._canvasContainer) {
      console.error('Canvas container not found');
      return;
    }

    const width = this._canvasContainer.clientWidth;
    const height = this._canvasContainer.clientHeight;

    // Create scene
    this._scene = new THREE.Scene();

    // Apply background color from configuration (Requirement 3.8)
    const backgroundColor = this._config?.background_color ?? DEFAULT_CONFIG.background_color;
    this._scene.background = new THREE.Color(backgroundColor);

    // Create camera with configurable distance (Requirement 3.2)
    const cameraDistance = this._config?.camera_distance ?? DEFAULT_CONFIG.camera_distance;
    this._camera = new THREE.PerspectiveCamera(
      SCENE_CONFIG.camera.fov,
      width / height,
      SCENE_CONFIG.camera.near,
      SCENE_CONFIG.camera.far
    );
    // Position camera at configured distance, looking at robot
    this._camera.position.set(0, 0.25, cameraDistance);
    this._camera.lookAt(...SCENE_CONFIG.camera.defaultTarget);

    // Create renderer with proper settings (Requirement 5.3)
    this._renderer = new THREE.WebGLRenderer({
      antialias: SCENE_CONFIG.renderer.antialias,
      alpha: SCENE_CONFIG.renderer.alpha,
      powerPreference: SCENE_CONFIG.renderer.powerPreference
    });
    
    // Limit pixel ratio to prevent GPU overload (Requirement 5.3)
    const pixelRatio = Math.min(window.devicePixelRatio, SCENE_CONFIG.renderer.maxPixelRatio);
    this._renderer.setPixelRatio(pixelRatio);
    this._renderer.setSize(width, height);
    
    // Configure renderer for better quality
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.0;
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Append canvas to container
    this._canvasContainer.appendChild(this._renderer.domElement);

    // Set up lighting (Requirement 3.2)
    this._setupLighting();

    // Set up OrbitControls (Requirement 3.6)
    this._setupControls();

    // Set up grid helper (Requirement 3.7, 4.4)
    this._setupGrid();

    // Start render loop
    this._startRenderLoop();

    // Load robot model (Requirement 3.1)
    this._loadRobot();

    // Handle window resize
    this._handleResize = this._handleResize.bind(this);
    window.addEventListener('resize', this._handleResize);
  }

  /**
   * Set up three-point lighting (ambient, key, fill, rim)
   * Requirement: 3.2
   */
  _setupLighting() {
    if (!this._scene) return;

    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(
      SCENE_CONFIG.lighting.ambient.color,
      SCENE_CONFIG.lighting.ambient.intensity
    );
    this._scene.add(ambientLight);

    // Key light - main directional light (front-right, elevated)
    const keyLight = new THREE.DirectionalLight(
      SCENE_CONFIG.lighting.key.color,
      SCENE_CONFIG.lighting.key.intensity
    );
    keyLight.position.set(...SCENE_CONFIG.lighting.key.position);
    keyLight.castShadow = true;
    this._scene.add(keyLight);

    // Fill light - softer light from opposite side (front-left)
    const fillLight = new THREE.DirectionalLight(
      SCENE_CONFIG.lighting.fill.color,
      SCENE_CONFIG.lighting.fill.intensity
    );
    fillLight.position.set(...SCENE_CONFIG.lighting.fill.position);
    this._scene.add(fillLight);

    // Rim/back light - for separation from background
    const rimLight = new THREE.DirectionalLight(
      SCENE_CONFIG.lighting.rim.color,
      SCENE_CONFIG.lighting.rim.intensity
    );
    rimLight.position.set(...SCENE_CONFIG.lighting.rim.position);
    this._scene.add(rimLight);
  }

  /**
   * Set up OrbitControls for camera interaction
   * Requirement: 3.6
   */
  _setupControls() {
    if (!this._camera || !this._renderer) return;

    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    
    // Configure controls
    this._controls.enableDamping = SCENE_CONFIG.controls.enableDamping;
    this._controls.dampingFactor = SCENE_CONFIG.controls.dampingFactor;
    this._controls.enablePan = SCENE_CONFIG.controls.enablePan;
    this._controls.enableRotate = SCENE_CONFIG.controls.enableRotate;
    this._controls.enableZoom = SCENE_CONFIG.controls.enableZoom;
    
    // Set distance limits
    this._controls.minDistance = SCENE_CONFIG.controls.minDistance;
    this._controls.maxDistance = SCENE_CONFIG.controls.maxDistance;
    
    // Set target to robot center
    this._controls.target.set(...SCENE_CONFIG.camera.defaultTarget);
    this._controls.update();
  }

  /**
   * Set up floor grid helper (conditional on enable_grid)
   * Requirements: 3.7, 4.4
   */
  _setupGrid() {
    if (!this._scene) return;

    // Create grid helper
    this._gridHelper = new THREE.GridHelper(
      SCENE_CONFIG.grid.size,
      SCENE_CONFIG.grid.divisions,
      SCENE_CONFIG.grid.majorColor,
      SCENE_CONFIG.grid.minorColor
    );
    
    // Set grid opacity
    if (this._gridHelper.material) {
      this._gridHelper.material.opacity = SCENE_CONFIG.grid.opacity;
      this._gridHelper.material.transparent = true;
    }

    // Toggle visibility based on configuration (Requirement 4.4)
    const enableGrid = this._config?.enable_grid ?? DEFAULT_CONFIG.enable_grid;
    this._gridHelper.visible = enableGrid;

    this._scene.add(this._gridHelper);
  }

  /**
   * Update grid visibility based on configuration
   */
  _updateGridVisibility() {
    if (this._gridHelper) {
      const enableGrid = this._config?.enable_grid ?? DEFAULT_CONFIG.enable_grid;
      this._gridHelper.visible = enableGrid;
    }
  }

  /**
   * Load URDF robot model using URDFLoader
   * Requirements: 3.1, 7.4, 7.5, 7.6
   */
  async _loadRobot() {
    if (!this._scene) {
      console.error('Scene not initialized');
      return;
    }

    if (this._robotLoading) {
      return; // Already loading
    }

    this._robotLoading = true;
    this._robotLoadError = null;
    this._failedAssets = [];

    try {
      const loader = new URDFLoader();
      
      // Track failed assets for error reporting (Requirement 7.6)
      const failedAssets = [];
      
      // Configure the loading manager to track errors
      loader.manager.onError = (url) => {
        console.error(`Failed to load asset: ${url}`);
        failedAssets.push(url);
        this._failedAssets.push(url);
      };

      // Configure loader to load meshes from local assets (Requirement 7.4, 7.5)
      loader.manager.setURLModifier((url) => {
        // Extract filename from URL
        const filename = url.split('/').pop();
        // Return local path
        return `${ASSET_PATHS.MESHES}/${filename}`;
      });

      // Load the URDF model
      const robotModel = await new Promise((resolve, reject) => {
        // Fetch URDF file first
        fetch(ASSET_PATHS.URDF)
          .then(response => {
            if (!response.ok) {
              throw new Error(`Failed to load URDF: ${ASSET_PATHS.URDF} (${response.status})`);
            }
            return response.text();
          })
          .then(urdfContent => {
            try {
              const robot = loader.parse(urdfContent);
              resolve(robot);
            } catch (parseError) {
              reject(new Error(`Failed to parse URDF: ${parseError.message}`));
            }
          })
          .catch(error => {
            reject(error);
          });
      });

      // Wait a bit for async mesh loading to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if any assets failed to load
      if (failedAssets.length > 0) {
        const errorMsg = `Failed to load assets: ${failedAssets.join(', ')}`;
        console.warn(errorMsg);
        // Don't throw - continue with partial model
      }

      // Apply materials to the robot (will be implemented in 5.2)
      this._applyRobotMaterials(robotModel);

      // Initialize all joints to zero position
      this._initializeJoints(robotModel);

      // Position and orient the robot in the scene
      // Rotate to face camera and position at origin
      const robotGroup = new THREE.Group();
      robotGroup.add(robotModel);
      robotGroup.rotation.set(0, -Math.PI / 2, 0); // Face camera
      robotModel.rotation.set(-Math.PI / 2, 0, 0); // URDF Z-up to Three.js Y-up

      // Add to scene
      this._scene.add(robotGroup);
      this._robot = robotModel;
      this._robotGroup = robotGroup;

      this._robotLoading = false;
      console.info('Robot model loaded successfully');

    } catch (error) {
      this._robotLoading = false;
      this._robotLoadError = error.message;
      console.error('Failed to load robot model:', error);
      
      // Show error overlay (Requirement 7.6)
      this._showError(`Failed to load robot model: ${error.message}`);
    }
  }

  /**
   * Initialize all robot joints to zero position
   * @param {Object} robotModel - The URDF robot model
   */
  _initializeJoints(robotModel) {
    if (!robotModel || !robotModel.joints) return;

    // Initialize yaw_body
    if (robotModel.joints[ROBOT_JOINTS.YAW_BODY]) {
      robotModel.setJointValue(ROBOT_JOINTS.YAW_BODY, 0);
    }

    // Initialize stewart joints
    ROBOT_JOINTS.STEWART.forEach(jointName => {
      if (robotModel.joints[jointName]) {
        robotModel.setJointValue(jointName, 0);
      }
    });

    // Initialize passive joints
    ROBOT_JOINTS.PASSIVE.forEach(jointName => {
      if (robotModel.joints[jointName]) {
        robotModel.setJointValue(jointName, 0);
      }
    });

    // Initialize antenna joints
    ROBOT_JOINTS.ANTENNAS.forEach(jointName => {
      if (robotModel.joints[jointName]) {
        robotModel.setJointValue(jointName, 0);
      }
    });

    // Force matrix update
    robotModel.traverse((child) => {
      if (child.isObject3D) {
        child.updateMatrix();
        child.updateMatrixWorld(true);
      }
    });
  }

  /**
   * Apply materials to robot meshes
   * Requirements: 3.2
   * @param {Object} robotModel - The URDF robot model
   */
  _applyRobotMaterials(robotModel) {
    if (!robotModel) return;

    robotModel.traverse((child) => {
      if (!child.isMesh) return;

      // Get original color from URDF material
      let originalColor = 0xFF9500; // Default orange
      if (child.material && child.material.color) {
        originalColor = child.material.color.getHex();
      }
      
      // Store original color for later use
      child.userData.originalColor = originalColor;
      
      // Store material name for detection
      const materialName = (child.material?.name || '').toLowerCase();
      child.userData.materialName = materialName;
      
      // Get STL filename if available
      const stlFileName = this._getStlFileName(child);
      if (stlFileName) {
        child.userData.stlFileName = stlFileName;
      }
      
      // Detect special parts
      const isBigLens = materialName.includes('big_lens') || 
                        materialName.includes('small_lens') ||
                        materialName.includes('lens_d40') ||
                        materialName.includes('lens_d30');
      const isAntenna = originalColor === 0xFF9500 ||
                        materialName.includes('antenna') ||
                        (stlFileName && stlFileName.toLowerCase().includes('antenna'));
      const isArducam = materialName.includes('arducam') || 
                        (stlFileName && stlFileName.toLowerCase().includes('arducam'));
      
      child.userData.isAntenna = isAntenna;
      child.userData.isBigLens = isBigLens;
      child.userData.isArducam = isArducam;

      // Prepare geometry for flat shading
      if (child.geometry) {
        // Remove existing normals - Three.js will compute per-face normals with flatShading
        if (child.geometry.attributes.normal) {
          child.geometry.deleteAttribute('normal');
        }
        child.geometry.computeVertexNormals();
      }

      // Apply appropriate material based on part type
      if (isBigLens) {
        // Lens material - dark and slightly transparent
        child.material = new THREE.MeshStandardMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.75,
          flatShading: true,
        });
      } else if (isAntenna) {
        // Antenna material - dark with slight metallic look
        child.material = new THREE.MeshStandardMaterial({
          color: 0x000000,
          flatShading: true,
          roughness: 0.3,
          metalness: 0.2,
        });
      } else if (isArducam) {
        // Camera module material - dark gray
        child.material = new THREE.MeshStandardMaterial({
          color: 0x4D4D4D,
          flatShading: true,
          roughness: 0.7,
          metalness: 0.0,
        });
      } else {
        // Default material - use original color with flat shading
        child.material = new THREE.MeshStandardMaterial({
          color: originalColor,
          flatShading: true,
          roughness: 0.7,
          metalness: 0.0,
        });
      }
      
      child.material.needsUpdate = true;
    });
  }

  /**
   * Extract STL filename from mesh geometry userData
   * @param {THREE.Mesh} mesh - The mesh to get filename from
   * @returns {string|null} - The STL filename or null
   */
  _getStlFileName(mesh) {
    if (!mesh.geometry) return null;
    
    const possibleUrls = [
      mesh.geometry.userData?.url,
      mesh.geometry.userData?.sourceFile,
      mesh.geometry.userData?.filename,
      mesh.geometry.userData?.sourceURL,
    ].filter(Boolean);
    
    for (const url of possibleUrls) {
      const filename = url.split('/').pop();
      if (filename && filename.toLowerCase().endsWith('.stl')) {
        return filename;
      }
    }
    
    return null;
  }

  /**
   * Get the list of failed asset paths
   * @returns {string[]} - Array of failed asset paths
   */
  getFailedAssets() {
    return [...this._failedAssets];
  }

  /**
   * Get the robot load error message
   * @returns {string|null} - Error message or null if no error
   */
  getRobotLoadError() {
    return this._robotLoadError;
  }

  /**
   * Build WebSocket URL for robot state streaming
   * @param {string} host - Daemon host
   * @param {number} port - Daemon port
   * @returns {string} - WebSocket URL
   */
  _buildWebSocketUrl(host, port) {
    const params = new URLSearchParams({
      frequency: '20',
      with_head_pose: 'true',
      use_pose_matrix: 'true',
      with_head_joints: 'true',
      with_antenna_positions: 'true',
      with_passive_joints: 'true'
    });
    return `ws://${host}:${port}/api/state/ws/full?${params.toString()}`;
  }

  /**
   * Connect to the Reachy Mini daemon via WebSocket
   * Falls back to HTTP polling if WebSocket fails
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7
   */
  _connectWebSocket() {
    // Don't connect if already connected
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      return;
    }
    
    const host = this._config?.daemon_host ?? DEFAULT_CONFIG.daemon_host;
    const port = this._config?.daemon_port ?? DEFAULT_CONFIG.daemon_port;
    const wsUrl = this._buildWebSocketUrl(host, port);
    
    console.info(`[ReachyMini3DCard] Connecting to WebSocket: ${wsUrl}`);
    
    try {
      this._ws = new WebSocket(wsUrl);
      
      this._ws.onopen = () => {
        console.info('[ReachyMini3DCard] WebSocket connected');
        this._reconnectAttempts = 0;
        this._setConnectionState('connected');
        // Stop HTTP polling if it was running as fallback
        this._stopPolling();
      };
      
      this._ws.onmessage = (event) => {
        this._handleWebSocketMessage(event);
      };
      
      this._ws.onerror = (error) => {
        console.warn('[ReachyMini3DCard] WebSocket error:', error);
      };
      
      this._ws.onclose = () => {
        this._handleWebSocketClose();
      };
      
    } catch (error) {
      console.error('[ReachyMini3DCard] Failed to create WebSocket:', error);
      // Fall back to HTTP polling
      this._startPolling();
    }
  }

  /**
   * Start HTTP polling for robot state (fallback when WebSocket fails)
   * Polls at 20Hz (50ms interval) to match the WebSocket frequency
   */
  _startPolling() {
    // Don't start if already polling
    if (this._pollingInterval) {
      return;
    }
    
    const host = this._config?.daemon_host ?? DEFAULT_CONFIG.daemon_host;
    const port = this._config?.daemon_port ?? DEFAULT_CONFIG.daemon_port;
    const url = buildApiUrl(host, port);
    
    console.info(`[ReachyMini3DCard] Starting HTTP polling (fallback): ${url}`);
    
    // Poll immediately
    this._pollRobotState(url);
    
    // Then poll at 20Hz (50ms interval)
    this._pollingInterval = setInterval(() => {
      this._pollRobotState(url);
    }, 50);
  }

  /**
   * Poll robot state via HTTP
   * @param {string} url - The API URL to poll
   */
  async _pollRobotState(url) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Update connection state on success
      if (this._connectionState !== 'connected') {
        this._reconnectAttempts = 0;
        this._setConnectionState('connected');
      }
      
      // Parse and apply robot state (HTTP format)
      this._handleHttpResponse(data);
      
    } catch (error) {
      // Handle connection error
      if (this._connectionState === 'connected') {
        console.warn('[ReachyMini3DCard] Polling error:', error.message);
        this._handlePollingError();
      }
    }
  }

  /**
   * Handle HTTP polling response
   * HTTP API returns head_pose as {x, y, z, roll, pitch, yaw}
   * @param {Object} data - Response data from HTTP API
   */
  _handleHttpResponse(data) {
    // Parse head_joints
    if (data.head_joints && Array.isArray(data.head_joints) && data.head_joints.length === 7) {
      this._robotState.headJoints = data.head_joints;
    }
    
    // Parse antennas_position
    if (data.antennas_position && Array.isArray(data.antennas_position)) {
      this._robotState.antennas = data.antennas_position;
    }
    
    // Parse body_yaw (if available separately)
    if (data.body_yaw !== undefined) {
      this._robotState.bodyYaw = data.body_yaw;
    }
    
    // Parse head_pose and calculate passive joints
    // HTTP API returns head_pose as {x, y, z, roll, pitch, yaw}
    // We need to convert to 4x4 matrix and calculate passive joints locally
    if (data.head_pose && typeof data.head_pose === 'object' && !Array.isArray(data.head_pose)) {
      // Convert head_pose to 4x4 matrix
      const headPoseMatrix = headPoseToMatrix(data.head_pose);
      this._robotState.headPose = headPoseMatrix;
      
      // Calculate passive joints from head_joints and head_pose
      if (this._robotState.headJoints && headPoseMatrix) {
        const enablePassiveJoints = this._config?.enable_passive_joints ?? DEFAULT_CONFIG.enable_passive_joints;
        if (enablePassiveJoints) {
          const passiveJoints = calculatePassiveJoints(this._robotState.headJoints, headPoseMatrix);
          this._robotState.passiveJoints = passiveJoints;
        }
      }
    }
    
    // Apply state to robot model
    this._applyRobotState();
  }

  /**
   * Handle HTTP polling error with reconnection logic
   */
  _handlePollingError() {
    this._reconnectAttempts++;
    
    if (this._reconnectAttempts < WEBSOCKET_CONFIG.maxReconnectAttempts) {
      this._setConnectionState('reconnecting');
    } else {
      // Max retries exceeded
      console.warn('[ReachyMini3DCard] Max polling errors reached, stopping');
      this._setConnectionState('disconnected');
      this._stopPolling();
    }
  }

  /**
   * Stop HTTP polling
   */
  _stopPolling() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
    }
  }

  /**
   * Handle WebSocket message (kept for backward compatibility)
   * Requirement: 2.6
   * @param {MessageEvent} event - WebSocket message event
   */
  _handleWebSocketMessage(event) {
    try {
      const data = JSON.parse(event.data);
      
      // Parse head_joints
      if (data.head_joints && Array.isArray(data.head_joints) && data.head_joints.length === 7) {
        this._robotState.headJoints = data.head_joints;
      }
      
      // Parse antennas_position
      if (data.antennas_position && Array.isArray(data.antennas_position)) {
        this._robotState.antennas = data.antennas_position;
      }
      
      // Parse head_pose - WebSocket returns {m: [...]} format (4x4 matrix)
      let headPoseMatrix = null;
      if (data.head_pose) {
        if (data.head_pose.m && Array.isArray(data.head_pose.m) && data.head_pose.m.length === 16) {
          // WebSocket format: {m: [16 floats]}
          headPoseMatrix = data.head_pose.m;
        } else if (Array.isArray(data.head_pose) && data.head_pose.length === 16) {
          // Direct array format
          headPoseMatrix = data.head_pose;
        }
        
        if (headPoseMatrix) {
          this._robotState.headPose = headPoseMatrix;
        }
      }
      
      // Parse passive_joints - may be null from server, calculate locally if needed
      if (data.passive_joints && Array.isArray(data.passive_joints) && data.passive_joints.length >= 21) {
        // Server provided passive joints
        this._robotState.passiveJoints = data.passive_joints;
      } else if (this._robotState.headJoints && headPoseMatrix) {
        // Calculate passive joints locally
        const enablePassiveJoints = this._config?.enable_passive_joints ?? DEFAULT_CONFIG.enable_passive_joints;
        if (enablePassiveJoints) {
          const passiveJoints = calculatePassiveJoints(this._robotState.headJoints, headPoseMatrix);
          this._robotState.passiveJoints = passiveJoints;
        }
      }
      
      // Apply state to robot model
      this._applyRobotState();
      
    } catch (error) {
      console.error('[ReachyMini3DCard] Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Handle WebSocket close event with auto-reconnection
   * Falls back to HTTP polling after max WebSocket retries
   * Requirements: 2.5, 2.7
   */
  _handleWebSocketClose() {
    this._ws = null;
    
    // Check if we should attempt WebSocket reconnection
    if (this._reconnectAttempts < WEBSOCKET_CONFIG.maxReconnectAttempts) {
      this._setConnectionState('reconnecting');
      
      const delay = calculateReconnectDelay(this._reconnectAttempts);
      console.info(`[ReachyMini3DCard] WebSocket reconnecting in ${delay}ms (attempt ${this._reconnectAttempts + 1}/${WEBSOCKET_CONFIG.maxReconnectAttempts})`);
      
      this._reconnectTimeout = setTimeout(() => {
        this._reconnectAttempts++;
        this._connectWebSocket();
      }, delay);
    } else {
      // Max WebSocket retries exceeded - fall back to HTTP polling
      console.warn('[ReachyMini3DCard] Max WebSocket reconnection attempts reached, falling back to HTTP polling');
      this._reconnectAttempts = 0; // Reset for HTTP polling
      this._startPolling();
    }
  }

  /**
   * Set connection state and update UI
   * @param {string} state - 'connected' | 'disconnected' | 'reconnecting'
   */
  _setConnectionState(state) {
    this._connectionState = state;
    this._updateStatusIndicator();
  }

  /**
   * Disconnect WebSocket and stop reconnection attempts
   */
  _disconnectWebSocket() {
    // Clear reconnection timeout
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    
    // Stop HTTP polling
    this._stopPolling();
    
    // Close WebSocket (legacy, kept for compatibility)
    if (this._ws) {
      this._ws.onclose = null; // Prevent reconnection attempt
      this._ws.close();
      this._ws = null;
    }
    
    this._setConnectionState('disconnected');
  }

  /**
   * Apply robot state to the 3D model
   * Requirements: 3.3, 3.4, 3.5
   */
  _applyRobotState() {
    if (!this._robot) return;

    // Apply head joints (yaw_body and stewart joints)
    // Requirement: 3.3
    if (this._robotState.headJoints) {
      this._applyHeadJoints(this._robotState.headJoints);
    }

    // Apply antenna positions with inverted mapping
    // Requirement: 3.4
    if (this._robotState.antennas) {
      this._applyAntennaPositions(this._robotState.antennas);
    }

    // Apply passive joints (conditional on enable_passive_joints)
    // Requirements: 3.5, 4.2
    const enablePassiveJoints = this._config?.enable_passive_joints ?? DEFAULT_CONFIG.enable_passive_joints;
    if (enablePassiveJoints && this._robotState.passiveJoints) {
      this._applyPassiveJoints(this._robotState.passiveJoints);
    }
  }

  /**
   * Apply head_joints to URDF model
   * Maps joint values to correct joint names:
   * - head_joints[0] -> yaw_body
   * - head_joints[1-6] -> stewart_1 through stewart_6
   * Requirement: 3.3
   * 
   * @param {number[]} headJoints - Array of 7 values [yaw_body, stewart_1, ..., stewart_6]
   */
  _applyHeadJoints(headJoints) {
    if (!this._robot || !this._robot.joints) return;
    if (!Array.isArray(headJoints) || headJoints.length < 7) return;

    // Apply yaw_body (first value)
    if (this._robot.joints[ROBOT_JOINTS.YAW_BODY]) {
      this._robot.setJointValue(ROBOT_JOINTS.YAW_BODY, headJoints[0]);
    }

    // Apply stewart joints (values 1-6)
    ROBOT_JOINTS.STEWART.forEach((jointName, index) => {
      if (this._robot.joints[jointName]) {
        this._robot.setJointValue(jointName, headJoints[index + 1]);
      }
    });
  }

  /**
   * Apply antennas_position to URDF model
   * Implements inverted mapping (left data to right visual, right data to left visual)
   * and negated values for correct rotation
   * Requirement: 3.4
   * 
   * @param {number[]} antennas - Array of 2 values [left, right]
   */
  _applyAntennaPositions(antennas) {
    if (!this._robot || !this._robot.joints) return;
    if (!Array.isArray(antennas) || antennas.length < 2) return;

    // Inverted mapping: left data -> right antenna, right data -> left antenna
    // Also negate values for correct rotation direction
    const [leftData, rightData] = antennas;

    // Apply left data to right antenna (inverted and negated)
    if (this._robot.joints[ROBOT_JOINTS.ANTENNAS[1]]) { // right_antenna
      this._robot.setJointValue(ROBOT_JOINTS.ANTENNAS[1], -leftData);
    }

    // Apply right data to left antenna (inverted and negated)
    if (this._robot.joints[ROBOT_JOINTS.ANTENNAS[0]]) { // left_antenna
      this._robot.setJointValue(ROBOT_JOINTS.ANTENNAS[0], -rightData);
    }
  }

  /**
   * Apply passive_joints to URDF model (conditional on enable_passive_joints)
   * Requirements: 3.5, 4.2
   * 
   * @param {number[]} passiveJoints - Array of 21 values for passive joints
   */
  _applyPassiveJoints(passiveJoints) {
    if (!this._robot || !this._robot.joints) return;
    if (!Array.isArray(passiveJoints) || passiveJoints.length < 21) return;

    // Apply each passive joint value in order
    ROBOT_JOINTS.PASSIVE.forEach((jointName, index) => {
      if (this._robot.joints[jointName] && index < passiveJoints.length) {
        this._robot.setJointValue(jointName, passiveJoints[index]);
      }
    });
  }

  /**
   * Start the render loop with throttling
   * Requirements: 5.1, 5.5
   */
  _startRenderLoop() {
    if (this._animationFrameId) return; // Already running

    const animate = (currentTime) => {
      // Only continue loop if visible (Requirement 5.5)
      if (!this._isVisible) {
        // Stop the loop when not visible - will be restarted by IntersectionObserver
        this._animationFrameId = null;
        return;
      }

      // Schedule next frame
      this._animationFrameId = requestAnimationFrame(animate);

      // Throttle rendering to target FPS (Requirement 5.1)
      // Skip frames if not enough time has passed
      const elapsed = currentTime - this._lastFrameTime;
      if (elapsed < this._frameInterval) {
        return; // Skip this frame
      }

      // Update last frame time, accounting for any drift
      this._lastFrameTime = currentTime - (elapsed % this._frameInterval);

      // Update controls
      if (this._controls) {
        this._controls.update();
      }

      // Render scene
      if (this._renderer && this._scene && this._camera) {
        this._renderer.render(this._scene, this._camera);
      }
    };

    // Initialize last frame time
    this._lastFrameTime = performance.now();
    this._animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Stop the render loop
   */
  _stopRenderLoop() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  /**
   * Handle window/container resize
   */
  _handleResize() {
    if (!this._canvasContainer || !this._camera || !this._renderer) return;

    const width = this._canvasContainer.clientWidth;
    const height = this._canvasContainer.clientHeight;

    // Update camera aspect ratio
    this._camera.aspect = width / height;
    this._camera.updateProjectionMatrix();

    // Update renderer size
    this._renderer.setSize(width, height);
  }

  /**
   * Update scene background color
   */
  _updateBackgroundColor() {
    if (this._scene) {
      const backgroundColor = this._config?.background_color ?? DEFAULT_CONFIG.background_color;
      this._scene.background = new THREE.Color(backgroundColor);
    }
  }

  /**
   * Update camera distance based on configuration
   */
  _updateCameraDistance() {
    if (this._camera) {
      const cameraDistance = this._config?.camera_distance ?? DEFAULT_CONFIG.camera_distance;
      // Update camera Z position while maintaining X and Y
      this._camera.position.z = cameraDistance;
    }
  }

  /**
   * Display an error overlay
   * @param {string} message - Error message to display
   */
  _showError(message) {
    if (this._container) {
      const existingError = this._container.querySelector('.error-overlay');
      if (existingError) {
        existingError.remove();
      }
      
      const errorOverlay = document.createElement('div');
      errorOverlay.className = 'error-overlay';
      errorOverlay.innerHTML = `<div class="error-message">${message}</div>`;
      this._container.appendChild(errorOverlay);
    }
  }

  /**
   * Clean up resources when card is removed
   * Requirement: 5.4
   */
  _dispose() {
    // Stop animation loop using the dedicated method
    this._stopRenderLoop();
    
    // Stop HTTP polling
    this._stopPolling();
    
    // Clear reconnection timeout
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout);
      this._reconnectTimeout = null;
    }
    
    // Close WebSocket (legacy, kept for compatibility)
    if (this._ws) {
      this._ws.onclose = null; // Prevent reconnection attempt
      this._ws.close();
      this._ws = null;
    }
    
    // Disconnect intersection observer
    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect();
      this._intersectionObserver = null;
    }

    // Remove resize listener
    if (this._handleResize) {
      window.removeEventListener('resize', this._handleResize);
    }
    
    // Dispose OrbitControls
    if (this._controls) {
      this._controls.dispose();
      this._controls = null;
    }

    // Dispose grid helper
    if (this._gridHelper) {
      if (this._gridHelper.geometry) {
        this._gridHelper.geometry.dispose();
      }
      if (this._gridHelper.material) {
        this._gridHelper.material.dispose();
      }
      this._gridHelper = null;
    }

    // Dispose robot group and model
    if (this._robotGroup) {
      if (this._scene) {
        this._scene.remove(this._robotGroup);
      }
      this._robotGroup = null;
    }
    
    if (this._robot) {
      this._disposeObject3D(this._robot);
      this._robot = null;
    }
    
    // Reset robot loading state
    this._robotLoading = false;
    this._robotLoadError = null;
    this._failedAssets = [];

    // Dispose scene
    if (this._scene) {
      // Dispose all objects in scene
      while (this._scene.children.length > 0) {
        const child = this._scene.children[0];
        this._disposeObject3D(child);
        this._scene.remove(child);
      }
      this._scene = null;
    }
    
    // Dispose renderer
    if (this._renderer) {
      this._renderer.dispose();
      // Remove canvas from DOM
      if (this._renderer.domElement && this._renderer.domElement.parentNode) {
        this._renderer.domElement.parentNode.removeChild(this._renderer.domElement);
      }
      this._renderer = null;
    }
    
    // Clear references
    this._camera = null;
    this._container = null;
    this._canvasContainer = null;
    this._statusIndicator = null;
    
    // Reset render loop timing
    this._lastFrameTime = 0;
  }

  /**
   * Recursively dispose of a Three.js Object3D and its children
   * @param {THREE.Object3D} obj - Object to dispose
   */
  _disposeObject3D(obj) {
    if (!obj) return;

    // Dispose children first
    if (obj.children) {
      for (let i = obj.children.length - 1; i >= 0; i--) {
        this._disposeObject3D(obj.children[i]);
      }
    }

    // Dispose geometry
    if (obj.geometry) {
      obj.geometry.dispose();
    }

    // Dispose material(s)
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(material => this._disposeMaterial(material));
      } else {
        this._disposeMaterial(obj.material);
      }
    }
  }

  /**
   * Dispose of a Three.js material and its textures
   * @param {THREE.Material} material - Material to dispose
   */
  _disposeMaterial(material) {
    if (!material) return;

    // Dispose textures
    const textureProperties = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
    textureProperties.forEach(prop => {
      if (material[prop]) {
        material[prop].dispose();
      }
    });

    material.dispose();
  }
}

/**
 * Connection state constants
 */
export const CONNECTION_STATES = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting'
};

/**
 * Status indicator configuration
 * Maps connection states to their visual representation
 * Requirements: 6.2, 6.3, 6.4
 */
export const STATUS_CONFIG = {
  [CONNECTION_STATES.CONNECTED]: {
    color: '#4caf50',  // Green
    label: 'Connected'
  },
  [CONNECTION_STATES.DISCONNECTED]: {
    color: '#f44336',  // Red
    label: 'Offline'
  },
  [CONNECTION_STATES.RECONNECTING]: {
    color: '#ff9800',  // Orange
    label: 'Reconnecting'
  }
};

/**
 * Get status indicator configuration for a given connection state
 * Requirements: 6.2, 6.3, 6.4
 * 
 * @param {string} connectionState - The connection state ('connected' | 'disconnected' | 'reconnecting')
 * @returns {Object} - Object with color and label properties
 */
export function getStatusForConnectionState(connectionState) {
  // Default to disconnected for unknown states
  const state = connectionState || CONNECTION_STATES.DISCONNECTED;
  
  // Use hasOwnProperty to avoid prototype chain issues (e.g., 'toString')
  if (Object.prototype.hasOwnProperty.call(STATUS_CONFIG, state)) {
    return { ...STATUS_CONFIG[state] };
  }
  
  // Return disconnected status for unknown states
  return { ...STATUS_CONFIG[CONNECTION_STATES.DISCONNECTED] };
}

/**
 * Validate that a connection state maps to the correct status
 * Requirements: 6.2, 6.3, 6.4
 * 
 * @param {string} connectionState - The connection state to validate
 * @returns {boolean} - True if the state maps to a valid status
 */
export function isValidConnectionState(connectionState) {
  return Object.values(CONNECTION_STATES).includes(connectionState);
}

/**
 * Format an asset load error message
 * The error message SHALL contain the asset path that failed (Requirement 7.6)
 * @param {string} assetPath - The path of the asset that failed to load
 * @returns {string} - Formatted error message containing the asset path
 */
export function formatAssetLoadError(assetPath) {
  if (!assetPath || typeof assetPath !== 'string') {
    return 'Failed to load asset: unknown';
  }
  return `Failed to load asset: ${assetPath}`;
}

/**
 * Check if an error message contains the asset path
 * @param {string} errorMessage - The error message to check
 * @param {string} assetPath - The asset path that should be in the message
 * @returns {boolean} - True if the error message contains the asset path
 */
export function errorMessageContainsPath(errorMessage, assetPath) {
  if (!errorMessage || !assetPath) return false;
  return errorMessage.includes(assetPath);
}

/**
 * Apply head_joints values to a robot model
 * Maps joint values to correct joint names:
 * - headJoints[0] -> yaw_body
 * - headJoints[1-6] -> stewart_1 through stewart_6
 * Requirement: 3.3
 * 
 * @param {Object} robot - The URDF robot model with joints property
 * @param {number[]} headJoints - Array of 7 values [yaw_body, stewart_1, ..., stewart_6]
 * @returns {Object} - Object mapping joint names to applied values, or null if invalid input
 */
export function applyHeadJointsToRobot(robot, headJoints) {
  if (!robot || !robot.joints) return null;
  if (!Array.isArray(headJoints) || headJoints.length < 7) return null;

  const appliedJoints = {};

  // Apply yaw_body (first value)
  if (robot.joints[ROBOT_JOINTS.YAW_BODY]) {
    robot.setJointValue(ROBOT_JOINTS.YAW_BODY, headJoints[0]);
    appliedJoints[ROBOT_JOINTS.YAW_BODY] = headJoints[0];
  }

  // Apply stewart joints (values 1-6)
  ROBOT_JOINTS.STEWART.forEach((jointName, index) => {
    if (robot.joints[jointName]) {
      robot.setJointValue(jointName, headJoints[index + 1]);
      appliedJoints[jointName] = headJoints[index + 1];
    }
  });

  return appliedJoints;
}

/**
 * Calculate the expected joint mapping for head_joints
 * Returns an object mapping joint names to expected values
 * Requirement: 3.3
 * 
 * @param {number[]} headJoints - Array of 7 values [yaw_body, stewart_1, ..., stewart_6]
 * @returns {Object|null} - Object mapping joint names to expected values, or null if invalid
 */
export function calculateExpectedHeadJointMapping(headJoints) {
  if (!Array.isArray(headJoints) || headJoints.length < 7) return null;

  const mapping = {
    [ROBOT_JOINTS.YAW_BODY]: headJoints[0]
  };

  ROBOT_JOINTS.STEWART.forEach((jointName, index) => {
    mapping[jointName] = headJoints[index + 1];
  });

  return mapping;
}

/**
 * Apply antenna positions to a robot model with inverted mapping
 * Implements inverted mapping (left data to right visual, right data to left visual)
 * and negated values for correct rotation
 * Requirement: 3.4
 * 
 * @param {Object} robot - The URDF robot model with joints property
 * @param {number[]} antennas - Array of 2 values [left, right]
 * @returns {Object} - Object mapping joint names to applied values, or null if invalid input
 */
export function applyAntennaPositionsToRobot(robot, antennas) {
  if (!robot || !robot.joints) return null;
  if (!Array.isArray(antennas) || antennas.length < 2) return null;

  const appliedJoints = {};
  const [leftData, rightData] = antennas;

  // Inverted mapping: left data -> right antenna (negated)
  if (robot.joints[ROBOT_JOINTS.ANTENNAS[1]]) { // right_antenna
    robot.setJointValue(ROBOT_JOINTS.ANTENNAS[1], -leftData);
    appliedJoints[ROBOT_JOINTS.ANTENNAS[1]] = -leftData;
  }

  // Inverted mapping: right data -> left antenna (negated)
  if (robot.joints[ROBOT_JOINTS.ANTENNAS[0]]) { // left_antenna
    robot.setJointValue(ROBOT_JOINTS.ANTENNAS[0], -rightData);
    appliedJoints[ROBOT_JOINTS.ANTENNAS[0]] = -rightData;
  }

  return appliedJoints;
}

/**
 * Calculate the expected antenna joint mapping
 * Returns an object mapping joint names to expected values with inverted mapping and negation
 * Requirement: 3.4
 * 
 * @param {number[]} antennas - Array of 2 values [left, right]
 * @returns {Object|null} - Object mapping joint names to expected values, or null if invalid
 */
export function calculateExpectedAntennaMapping(antennas) {
  if (!Array.isArray(antennas) || antennas.length < 2) return null;

  const [leftData, rightData] = antennas;

  return {
    // Inverted mapping: left data -> right antenna (negated)
    [ROBOT_JOINTS.ANTENNAS[1]]: -leftData,  // right_antenna
    // Inverted mapping: right data -> left antenna (negated)
    [ROBOT_JOINTS.ANTENNAS[0]]: -rightData  // left_antenna
  };
}

/**
 * Apply passive joints to a robot model
 * Requirements: 3.5, 4.2
 * 
 * @param {Object} robot - The URDF robot model with joints property
 * @param {number[]} passiveJoints - Array of 21 values for passive joints
 * @param {boolean} enablePassiveJoints - Whether passive joints are enabled
 * @returns {Object} - Object mapping joint names to applied values, or null if invalid/disabled
 */
export function applyPassiveJointsToRobot(robot, passiveJoints, enablePassiveJoints = true) {
  if (!enablePassiveJoints) return null;
  if (!robot || !robot.joints) return null;
  if (!Array.isArray(passiveJoints) || passiveJoints.length < 21) return null;

  const appliedJoints = {};

  ROBOT_JOINTS.PASSIVE.forEach((jointName, index) => {
    if (robot.joints[jointName] && index < passiveJoints.length) {
      robot.setJointValue(jointName, passiveJoints[index]);
      appliedJoints[jointName] = passiveJoints[index];
    }
  });

  return appliedJoints;
}

/**
 * Calculate the expected passive joint mapping
 * Returns an object mapping joint names to expected values
 * Requirements: 3.5, 4.2
 * 
 * @param {number[]} passiveJoints - Array of 21 values for passive joints
 * @param {boolean} enablePassiveJoints - Whether passive joints are enabled
 * @returns {Object|null} - Object mapping joint names to expected values, or null if invalid/disabled
 */
export function calculateExpectedPassiveJointMapping(passiveJoints, enablePassiveJoints = true) {
  if (!enablePassiveJoints) return null;
  if (!Array.isArray(passiveJoints) || passiveJoints.length < 21) return null;

  const mapping = {};

  ROBOT_JOINTS.PASSIVE.forEach((jointName, index) => {
    if (index < passiveJoints.length) {
      mapping[jointName] = passiveJoints[index];
    }
  });

  return mapping;
}

/**
 * Configuration editor for Reachy Mini 3D Card
 * Provides a visual UI for editing card configuration in Home Assistant
 */
class ReachyMini3DCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
  }

  set hass(hass) {
    this._hass = hass;
  }

  setConfig(config) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._render();
  }

  _render() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }

    this.shadowRoot.innerHTML = `
      <style>
        .card-config {
          padding: 16px;
        }
        .config-row {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }
        .config-row label {
          flex: 1;
          font-weight: 500;
        }
        .config-row input[type="text"],
        .config-row input[type="number"] {
          flex: 1;
          padding: 8px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 4px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #212121);
        }
        .config-row input[type="checkbox"] {
          width: 20px;
          height: 20px;
        }
        .section-title {
          font-weight: 600;
          margin: 16px 0 8px 0;
          padding-bottom: 4px;
          border-bottom: 1px solid var(--divider-color, #e0e0e0);
        }
        .help-text {
          font-size: 12px;
          color: var(--secondary-text-color, #757575);
          margin-top: 4px;
        }
      </style>
      <div class="card-config">
        <div class="section-title">Connection</div>
        
        <div class="config-row">
          <label for="daemon_host">Daemon Host</label>
          <input type="text" id="daemon_host" 
            value="${this._config.daemon_host || ''}" 
            placeholder="localhost">
        </div>
        
        <div class="config-row">
          <label for="daemon_port">Daemon Port</label>
          <input type="number" id="daemon_port" 
            value="${this._config.daemon_port || 8000}" 
            min="1" max="65535">
        </div>
        
        <div class="section-title">Appearance</div>
        
        <div class="config-row">
          <label for="height">Card Height (px)</label>
          <input type="number" id="height" 
            value="${this._config.height || 400}" 
            min="100" max="2000">
        </div>
        
        <div class="config-row">
          <label for="background_color">Background Color</label>
          <input type="text" id="background_color" 
            value="${this._config.background_color || '#f5f5f5'}" 
            placeholder="#f5f5f5">
        </div>
        
        <div class="config-row">
          <label for="camera_distance">Camera Distance</label>
          <input type="number" id="camera_distance" 
            value="${this._config.camera_distance || 0.5}" 
            min="0.2" max="1.5" step="0.1">
        </div>
        
        <div class="section-title">Features</div>
        
        <div class="config-row">
          <label for="enable_grid">Show Grid</label>
          <input type="checkbox" id="enable_grid" 
            ${this._config.enable_grid !== false ? 'checked' : ''}>
        </div>
        
        <div class="config-row">
          <label for="enable_passive_joints">Show Passive Joints</label>
          <input type="checkbox" id="enable_passive_joints" 
            ${this._config.enable_passive_joints !== false ? 'checked' : ''}>
        </div>
        
        <div class="config-row">
          <label for="enable_head_pose">Enable Head Pose</label>
          <input type="checkbox" id="enable_head_pose" 
            ${this._config.enable_head_pose !== false ? 'checked' : ''}>
        </div>
      </div>
    `;

    // Add event listeners
    this.shadowRoot.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', (e) => this._valueChanged(e));
      input.addEventListener('input', (e) => {
        // Debounce text inputs
        if (e.target.type === 'text' || e.target.type === 'number') {
          clearTimeout(this._debounceTimer);
          this._debounceTimer = setTimeout(() => this._valueChanged(e), 300);
        }
      });
    });
  }

  _valueChanged(ev) {
    const target = ev.target;
    const configKey = target.id;
    let value;

    if (target.type === 'checkbox') {
      value = target.checked;
    } else if (target.type === 'number') {
      value = parseFloat(target.value);
      if (isNaN(value)) return;
    } else {
      value = target.value;
    }

    if (this._config[configKey] === value) return;

    const newConfig = { ...this._config, [configKey]: value };
    
    // Fire config-changed event
    const event = new CustomEvent('config-changed', {
      detail: { config: newConfig },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }
}

// Register the editor element
customElements.define('ha-reachy-mini-card-editor', ReachyMini3DCardEditor);

// Register the custom element
customElements.define('ha-reachy-mini-card', ReachyMini3DCard);

// Register with Home Assistant's custom card registry
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ha-reachy-mini-card',
  name: 'Reachy Mini 3D Card',
  description: 'A 3D visualization card for Reachy Mini robot',
  preview: true
});

export { 
  ReachyMini3DCard, 
  SCENE_CONFIG, 
  ROBOT_JOINTS, 
  ASSET_PATHS, 
  WEBSOCKET_CONFIG
};
