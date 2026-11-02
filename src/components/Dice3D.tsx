import { motion, useAnimationControls } from 'framer-motion';
import React, { useEffect, useRef, useState } from 'react';

type Quat = [number, number, number, number]; // [w, x, y, z]

const S = Math.SQRT1_2;

/**
 * Exact unit quaternions mapping each die face's outward local normal onto +Y_world (upward tabletop face):
 *  - Face 1: +Y_local (Artisan Gold-Ringed Royal Sapphire Ace)
 *  - Face 6: -Y_local (opposite 1, 1+6=7)
 *  - Face 2: +Z_local
 *  - Face 5: -Z_local (opposite 2, 2+5=7)
 *  - Face 3: +X_local
 *  - Face 4: -X_local (opposite 3, 3+4=7)
 */
const FACE_UP_QUATS: Record<number, Quat> = {
  1: [1, 0, 0, 0],
  2: [S, -S, 0, 0],
  3: [S, 0, 0, S],
  4: [S, 0, 0, -S],
  5: [S, S, 0, 0],
  6: [0, 1, 0, 0],
};

function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

function quatFromAxisAngle(
  ax: number,
  ay: number,
  az: number,
  angleRad: number
): Quat {
  const len = Math.hypot(ax, ay, az) || 1;
  const half = angleRad * 0.5;
  const s = Math.sin(half) / len;
  return [Math.cos(half), ax * s, ay * s, az * s];
}

function quatSlerp(a: Quat, bInput: Quat, t: number): Quat {
  const clamped = Math.max(0, Math.min(1, t));
  let dot =
    a[0] * bInput[0] + a[1] * bInput[1] + a[2] * bInput[2] + a[3] * bInput[3];
  const b: Quat =
    dot < 0
      ? [-bInput[0], -bInput[1], -bInput[2], -bInput[3]]
      : [bInput[0], bInput[1], bInput[2], bInput[3]];
  dot = Math.abs(dot);

  if (dot > 0.9995) {
    return quatNormalize([
      a[0] + (b[0] - a[0]) * clamped,
      a[1] + (b[1] - a[1]) * clamped,
      a[2] + (b[2] - a[2]) * clamped,
      a[3] + (b[3] - a[3]) * clamped,
    ]);
  }

  const theta0 = Math.acos(Math.min(1, dot));
  const theta = theta0 * clamped;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return [
    s0 * a[0] + s1 * b[0],
    s0 * a[1] + s1 * b[1],
    s0 * a[2] + s1 * b[2],
    s0 * a[3] + s1 * b[3],
  ];
}

/**
 * Column-major 3x3 rotation matrix (local -> world) ready for WebGL uniformMatrix3fv.
 */
function quatToMat3(q: Quat, out: Float32Array): void {
  const [w, x, y, z] = q;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  // Column 0
  out[0] = 1 - 2 * (yy + zz);
  out[1] = 2 * (xy + wz);
  out[2] = 2 * (xz - wy);
  // Column 1
  out[3] = 2 * (xy - wz);
  out[4] = 1 - 2 * (xx + zz);
  out[5] = 2 * (yz + wx);
  // Column 2
  out[6] = 2 * (xz + wy);
  out[7] = 2 * (yz - wx);
  out[8] = 1 - 2 * (xx + yy);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function buildRestQuat(value: number, yawRad: number): Quat {
  const base = FACE_UP_QUATS[value] ?? FACE_UP_QUATS[1];
  const yawQ = quatFromAxisAngle(0, 1, 0, yawRad);
  return quatNormalize(quatMul(yawQ, base));
}

const VERTEX_SHADER_SRC = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/**
 * Supersampled (4x RGSS) PBR Raymarched 3D Rounded Dice Shader:
 *  - Continuous sdRoundBox(vec3(0.68), 0.20) with smooth spherical corners & cylindrical bevels
 *  - Boolean-subtracted concave spherical pip dimples on all 6 faces
 *  - Brushed 24K Gold bezel ring + Royal Sapphire concave jewel inlay on Face 1
 *  - Analytical soft ambient occlusion & directional contact shadows on the velvet tray floor
 */
const FRAGMENT_SHADER_SRC = `
precision highp float;

uniform vec2 uRes;
uniform vec3 uPos0;
uniform vec3 uPos1;
uniform mat3 uRot0;
uniform mat3 uRot1;
uniform float uDarkTheme;
uniform float uCamLift;

float smax(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
  return mix(b, a, h) + k * h * (1.0 - h);
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// Returns vec3(2D distance to nearest pip center on dominant face, faceId 1..6, dominant abs coord)
vec3 evalFacePips(vec3 p) {
  vec3 ap = abs(p);
  const float G = 0.395;
  float d2 = 10.0;
  float faceId = 1.0;
  float dom = ap.y;

  if (ap.y >= ap.x && ap.y >= ap.z) {
    dom = ap.y;
    if (p.y > 0.0) {
      // Face 1 (+Y): Artisan Ace center jewel
      faceId = 1.0;
      d2 = length(p.xz);
    } else {
      // Face 6 (-Y): Two columns of 3 pips
      faceId = 6.0;
      vec2 uv = abs(p.xz);
      d2 = min(length(uv - vec2(G, G)), length(uv - vec2(G, 0.0)));
    }
  } else if (ap.z >= ap.x) {
    dom = ap.z;
    if (p.z > 0.0) {
      // Face 2 (+Z): Two diagonal pips
      faceId = 2.0;
      vec2 uv = p.xy;
      d2 = min(length(uv - vec2(-G, G)), length(uv - vec2(G, -G)));
    } else {
      // Face 5 (-Z): Five quincunx pips
      faceId = 5.0;
      vec2 uv = abs(p.xy);
      d2 = min(length(uv), length(uv - vec2(G, G)));
    }
  } else {
    dom = ap.x;
    if (p.x > 0.0) {
      // Face 3 (+X): Three diagonal pips
      faceId = 3.0;
      vec2 uv = p.zy;
      d2 = min(length(uv), min(length(uv - vec2(-G, G)), length(uv - vec2(G, -G))));
    } else {
      // Face 4 (-X): Four corner pips
      faceId = 4.0;
      vec2 uv = abs(p.zy);
      d2 = length(uv - vec2(G, G));
    }
  }

  return vec3(d2, faceId, dom);
}

float sdDieLocal(vec3 p) {
  float dBox = sdRoundBox(p, vec3(0.68), 0.20);
  if (dBox > 0.16) return dBox;

  vec3 pip = evalFacePips(p);
  float dSphere;
  if (pip.y < 1.5) {
    // Face 1 Ace concave spherical socket (r_open = 0.194, depth = 0.068)
    dSphere = length(vec2(pip.x, pip.z - 1.1227)) - 0.3107;
  } else {
    // Faces 2..6 concave spherical pip sockets (r_open = 0.146, depth = 0.056)
    dSphere = length(vec2(pip.x, pip.z - 1.0423)) - 0.2183;
  }

  return smax(dBox, -dSphere, 0.0105);
}

vec3 calcNormalLocal(vec3 p) {
  const float e = 0.00085;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * sdDieLocal(p + k.xyy * e) +
    k.yyx * sdDieLocal(p + k.yyx * e) +
    k.yxy * sdDieLocal(p + k.yxy * e) +
    k.xxx * sdDieLocal(p + k.xxx * e)
  );
}

float traceDieLocal(vec3 ro, vec3 rd) {
  // Exact bounding sphere check (radius = 1.42 -> r^2 = 2.0164)
  float b = dot(ro, rd);
  float c = dot(ro, ro) - 2.0164;
  float h = b * b - c;
  if (h < 0.0) return -1.0;

  float sq = sqrt(h);
  float t = max(0.0, -b - sq);
  float tEnd = -b + sq;
  if (tEnd <= 0.0) return -1.0;

  for (int i = 0; i < 44; i++) {
    float d = sdDieLocal(ro + rd * t);
    if (d < 0.00048) return t;
    t += d;
    if (t > tEnd) break;
  }
  return -1.0;
}

// Analytical Studio HDRI Environment Dome for realistic softbox & rim reflections on rounded bevels
vec3 sampleStudioEnv(vec3 r) {
  vec3 dome = mix(vec3(0.05, 0.07, 0.12), vec3(0.24, 0.29, 0.40), clamp(r.y * 0.5 + 0.5, 0.0, 1.0));
  // Primary overhead studio softbox panel
  float mainBox = smoothstep(0.56, 0.88, dot(r, normalize(vec3(-0.26, 0.88, 0.39))));
  // Cool right fill panel
  float fillBox = smoothstep(0.62, 0.92, dot(r, normalize(vec3(0.74, 0.42, 0.52))));
  // Warm golden back-left rim strip
  float warmRim = smoothstep(0.68, 0.95, dot(r, normalize(vec3(-0.78, 0.35, -0.52))));
  return dome +
    mainBox * vec3(1.25, 1.22, 1.16) +
    fillBox * vec3(0.36, 0.44, 0.60) +
    warmRim * vec3(0.45, 0.34, 0.16);
}

vec3 shadeDie(
  vec3 pLocal,
  vec3 nLocal,
  mat3 rot,
  vec3 pWorld,
  vec3 rd,
  vec3 otherPos
) {
  vec3 n = normalize(rot * nLocal);
  vec3 v = -rd;

  vec3 pip = evalFacePips(pLocal);
  float d2 = pip.x;
  bool isAce = pip.y < 1.5;

  float stdPipMask = isAce ? 0.0 : (1.0 - smoothstep(0.136, 0.148, d2));
  float aceGemMask = isAce ? (1.0 - smoothstep(0.183, 0.195, d2)) : 0.0;
  float aceGoldMask = isAce
    ? smoothstep(0.184, 0.195, d2) * (1.0 - smoothstep(0.242, 0.255, d2))
    : 0.0;

  // Concave bowl cavity occlusion + floor proximity AO + inter-die gap AO
  float bowlDepth = clamp((0.88 - pip.z) / 0.066, 0.0, 1.0);
  float cavityAO = 1.0 - 0.38 * bowlDepth;
  float floorAO = 0.68 + 0.32 * smoothstep(-0.88, -0.14, pWorld.y);
  float gapDist = length(pWorld - otherPos);
  float interAO = 0.85 + 0.15 * smoothstep(1.55, 2.25, gapDist);
  float ao = cavityAO * floorAO * interAO;

  // Cinema 3-point warm-key / cool-fill studio lighting
  vec3 lKey = normalize(vec3(-0.32, 0.86, 0.40));
  vec3 lFill = normalize(vec3(0.70, 0.32, 0.64));
  vec3 lRim = normalize(vec3(0.10, 0.48, -0.87));

  float diffKey = max(dot(n, lKey), 0.0);
  float diffFill = max(dot(n, lFill), 0.0);
  float diffRim = max(dot(n, lRim), 0.0);

  // Subtle subsurface scattering wrap across satin alabaster bevels
  float wrapKey = max((dot(n, lKey) + 0.18) / 1.18, 0.0);

  // Material base albedo (linear space): warm creamy alabaster ivory + deep sapphire-onyx pips + 24K gold
  vec3 ivoryAlbedo = vec3(0.815, 0.822, 0.848);
  vec3 onyxAlbedo = vec3(0.022, 0.034, 0.068);
  vec3 sapphireAlbedo = vec3(0.032, 0.148, 0.620);
  vec3 goldAlbedo = vec3(0.84, 0.54, 0.12);

  // Subtle edge bevel pearlescence so the 12 rounded edges & 8 corners feel tactile and dimensional
  vec3 ap = abs(pLocal);
  float edgeCurvature = smoothstep(0.64, 0.84, max(min(ap.x, ap.y), min(max(ap.x, ap.y), ap.z)));
  ivoryAlbedo = mix(ivoryAlbedo, vec3(0.765, 0.785, 0.830), edgeCurvature * 0.45);

  vec3 albedo = ivoryAlbedo;
  albedo = mix(albedo, onyxAlbedo, stdPipMask);
  albedo = mix(albedo, sapphireAlbedo, aceGemMask);
  albedo = mix(albedo, goldAlbedo, aceGoldMask);

  float enamelMask = clamp(stdPipMask + aceGemMask, 0.0, 1.0);

  // Directional self-shadowing crescent inside recessed concave pip bowls
  float pipShadow = mix(1.0, 0.32 + 0.68 * smoothstep(-0.12, 0.68, dot(n, lKey)), enamelMask * bowlDepth);

  // Sky dome & warm tray bounce irradiance
  vec3 skyAmb = mix(vec3(0.08, 0.10, 0.16), vec3(0.18, 0.21, 0.29), 0.5 + 0.5 * n.y);
  vec3 bounceAmb = vec3(0.075, 0.065, 0.085) * max(-n.y, 0.0);

  float keyTerm = mix(wrapKey * 0.92, diffKey, enamelMask * 0.72 + aceGoldMask * 0.55) * pipShadow;
  vec3 irradiance =
    keyTerm * vec3(1.02, 0.985, 0.93) +
    diffFill * vec3(0.21, 0.25, 0.34) * pipShadow +
    diffRim * vec3(0.14, 0.18, 0.27) +
    (skyAmb + bounceAmb) * ao;

  vec3 col = albedo * irradiance;

  // PBR Specular & Studio HDRI Fresnel Reflections
  vec3 hKey = normalize(lKey + v);
  vec3 hFill = normalize(lFill + v);
  float nhKey = max(dot(n, hKey), 0.0);
  float nhFill = max(dot(n, hFill), 0.0);
  float nv = max(dot(n, v), 0.0);
  float fresnel = pow(1.0 - nv, 4.5);

  vec3 refl = reflect(-v, n);
  vec3 envCol = sampleStudioEnv(refl);

  // Satin sheen on pearl body & bevels + studio environment reflection
  float satinSpec = pow(nhKey, 26.0) * 0.13 + pow(nhFill, 18.0) * 0.05;
  vec3 ivoryEnv = envCol * (0.028 + 0.13 * fresnel) * (1.0 - enamelMask) * (1.0 - aceGoldMask);

  // High-gloss clear-coat reflection inside concave enamel pip bowls
  float clearCoat = (pow(nhKey, 88.0) * 0.95 + pow(nhFill, 60.0) * 0.30) * enamelMask;
  vec3 enamelEnv = envCol * (0.045 + 0.22 * fresnel) * enamelMask * (0.55 + 0.45 * pipShadow);

  // Brushed 24K gold metallic reflection & specular on Face 1 bezel
  vec3 goldSpec =
    vec3(1.0, 0.88, 0.54) *
    (pow(nhKey, 38.0) * 0.88 + pow(nhFill, 24.0) * 0.34) *
    aceGoldMask;
  vec3 goldEnv = envCol * vec3(1.0, 0.82, 0.42) * (0.24 + 0.42 * fresnel) * aceGoldMask;

  // CNC-lathed micro-chamfer rim highlight encircling every pip opening
  float rimBand = isAce
    ? exp(-pow((d2 - 0.256) / 0.011, 2.0))
    : exp(-pow((d2 - 0.150) / 0.010, 2.0));
  float lipSpec = rimBand * pow(nhKey, 12.0) * 0.095;

  col += vec3(0.98, 0.99, 1.0) * (satinSpec * (1.0 - aceGoldMask) + clearCoat + lipSpec);
  col += ivoryEnv + enamelEnv + goldSpec + goldEnv;

  // Royal Sapphire inner jewel depth glow on Face 1
  if (aceGemMask > 0.01) {
    float centerGlow = (1.0 - smoothstep(0.0, 0.185, d2)) * (0.38 + 0.62 * diffKey);
    col += vec3(0.05, 0.19, 0.58) * centerGlow * aceGemMask;
  }

  return col;
}

float evalDieFloorShadow(vec3 pFloor, vec3 diePos, mat3 dieRot) {
  float height = max(diePos.y, 0.0);
  vec2 lightDrift = vec2(0.22, 0.18) * height + vec2(0.02, 0.028);
  float sliceY = mix(-0.85, 0.0, clamp(height * 2.2, 0.0, 1.0));
  vec3 sampleWorld = vec3(
    pFloor.x - lightDrift.x - diePos.x,
    sliceY,
    pFloor.z - lightDrift.y - diePos.z
  );
  vec3 qLocal = sampleWorld * dieRot;
  float dFoot = sdRoundBox(qLocal, vec3(0.67), 0.20);

  float crevice = smoothstep(0.14 + height * 0.28, -0.02, dFoot) / (1.0 + height * 3.6);
  float penumbra = smoothstep(0.36 + height * 0.38, -0.08, dFoot) / (1.0 + height * 1.9);
  return clamp(crevice * 0.60 + penumbra * 0.40, 0.0, 1.0);
}

vec4 sampleRay(vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * uRes) / uRes.y;

  // Close-up macro 57° studio tabletop lens (fl = 1.76) with smooth throw tracking (zero clipping!)
  vec3 ro = vec3(0.0, 4.28 + uCamLift * 0.30, 2.76 + uCamLift * 0.24);
  vec3 ta = vec3(0.0, 0.02 + uCamLift * 0.42, 0.05);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.76 * ww);

  // Transform ray into each die's local space once (zero per-step matrix multiplications)
  vec3 ro0 = (ro - uPos0) * uRot0;
  vec3 rd0 = rd * uRot0;
  float t0 = traceDieLocal(ro0, rd0);

  vec3 ro1 = (ro - uPos1) * uRot1;
  vec3 rd1 = rd * uRot1;
  float t1 = traceDieLocal(ro1, rd1);

  float tHit = -1.0;
  int hitDie = -1;
  if (t0 > 0.0 && (t1 < 0.0 || t0 < t1)) {
    tHit = t0;
    hitDie = 0;
  } else if (t1 > 0.0) {
    tHit = t1;
    hitDie = 1;
  }

  if (hitDie >= 0) {
    vec3 pWorld = ro + rd * tHit;
    vec3 linearCol;
    if (hitDie == 0) {
      vec3 pLocal = ro0 + rd0 * tHit;
      vec3 nLocal = calcNormalLocal(pLocal);
      linearCol = shadeDie(pLocal, nLocal, uRot0, pWorld, rd, uPos1);
    } else {
      vec3 pLocal = ro1 + rd1 * tHit;
      vec3 nLocal = calcNormalLocal(pLocal);
      linearCol = shadeDie(pLocal, nLocal, uRot1, pWorld, rd, uPos0);
    }

    // Soft highlight compression & sRGB gamma encoding
    linearCol = linearCol / (1.0 + 0.14 * linearCol);
    vec3 srgb = pow(clamp(linearCol, 0.0, 1.0), vec3(1.0 / 2.2));
    return vec4(srgb, 1.0);
  }

  // Analytical soft contact shadow on the tray floor plane (y = -0.88)
  if (rd.y < -0.01) {
    float tFloor = (-0.88 - ro.y) / rd.y;
    if (tFloor > 0.0) {
      vec3 pFloor = ro + rd * tFloor;
      float s0 = evalDieFloorShadow(pFloor, uPos0, uRot0);
      float s1 = evalDieFloorShadow(pFloor, uPos1, uRot1);
      float sh = 1.0 - (1.0 - s0) * (1.0 - s1);
      float maxAlpha = mix(0.32, 0.62, uDarkTheme);
      float a = clamp(sh * maxAlpha, 0.0, 1.0);
      vec3 shadowTint = mix(vec3(0.05, 0.08, 0.16), vec3(0.01, 0.02, 0.05), uDarkTheme);
      return vec4(shadowTint * a, a);
    }
  }

  return vec4(0.0);
}

void main() {
  // 4x Rotated-Grid Subpixel Supersampling (RGSS) for razor-sharp, alias-free edges
  vec4 acc = vec4(0.0);
  acc += sampleRay(gl_FragCoord.xy + vec2(-0.375, -0.125));
  acc += sampleRay(gl_FragCoord.xy + vec2( 0.125, -0.375));
  acc += sampleRay(gl_FragCoord.xy + vec2( 0.375,  0.125));
  acc += sampleRay(gl_FragCoord.xy + vec2(-0.125,  0.375));
  gl_FragColor = acc * 0.25;
}
`;

interface GLResources {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  uRes: WebGLUniformLocation | null;
  uPos0: WebGLUniformLocation | null;
  uPos1: WebGLUniformLocation | null;
  uRot0: WebGLUniformLocation | null;
  uRot1: WebGLUniformLocation | null;
  uDarkTheme: WebGLUniformLocation | null;
  uCamLift: WebGLUniformLocation | null;
}

function initDiceWebGL(canvas: HTMLCanvasElement): GLResources | null {
  const attrs: WebGLContextAttributes = {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  };
  const gl =
    (canvas.getContext('webgl', attrs) as WebGLRenderingContext | null) ||
    (canvas.getContext(
      'experimental-webgl',
      attrs
    ) as WebGLRenderingContext | null);
  if (!gl) return null;

  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };

  const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  const buffer = gl.createBuffer();
  if (!buffer) {
    gl.deleteProgram(program);
    return null;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  return {
    gl,
    program,
    buffer,
    uRes: gl.getUniformLocation(program, 'uRes'),
    uPos0: gl.getUniformLocation(program, 'uPos0'),
    uPos1: gl.getUniformLocation(program, 'uPos1'),
    uRot0: gl.getUniformLocation(program, 'uRot0'),
    uRot1: gl.getUniformLocation(program, 'uRot1'),
    uDarkTheme: gl.getUniformLocation(program, 'uDarkTheme'),
    uCamLift: gl.getUniformLocation(program, 'uCamLift'),
  };
}

const PIP_2D_COORDS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

function drawFallback2D(
  canvas: HTMLCanvasElement,
  d1: number,
  d2: number,
  liftRatio: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const size = Math.min(w * 0.34, h * 0.68);
  const r = size * 0.22;
  const centers = [w * 0.3, w * 0.7];
  const vals = [d1, d2];

  centers.forEach((cx, idx) => {
    const cy = h * 0.54 - liftRatio * h * 0.16;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(idx === 0 ? -0.06 : 0.06);

    ctx.fillStyle = 'rgba(2, 6, 23, 0.38)';
    ctx.beginPath();
    ctx.roundRect(-size * 0.48, -size * 0.42, size, size, r);
    ctx.fill();

    const grad = ctx.createLinearGradient(
      -size * 0.5,
      -size * 0.5,
      size * 0.5,
      size * 0.5
    );
    grad.addColorStop(0, '#f8fafc');
    grad.addColorStop(0.6, '#e2e8f0');
    grad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-size * 0.5, -size * 0.5, size, size, r);
    ctx.fill();

    const coords = PIP_2D_COORDS[vals[idx]] ?? PIP_2D_COORDS[1];
    const step = size * 0.25;
    coords.forEach(([gx, gy]) => {
      const px = gx * step;
      const py = gy * step;
      const pr = vals[idx] === 1 ? size * 0.12 : size * 0.085;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = vals[idx] === 1 ? '#1d4ed8' : '#0f172a';
      ctx.fill();
      if (vals[idx] === 1) {
        ctx.lineWidth = Math.max(1.5, size * 0.03);
        ctx.strokeStyle = '#d97706';
        ctx.stroke();
      }
    });
    ctx.restore();
  });
}

const CANVAS_SIZES: Record<'sm' | 'md' | 'lg' | 'xl', { w: number; h: number }> = {
  sm: { w: 128, h: 64 },
  md: { w: 174, h: 86 },
  lg: { w: 214, h: 106 },
  xl: { w: 246, h: 122 },
};

// Base resting tabletop yaw angles (-15° left die, +17° right die) reveal top + front + inner side faces in 3D
const BASE_YAW_0 = -0.262;
const BASE_YAW_1 = 0.297;

export const Dice3D: React.FC<{
  dice: [number, number] | null;
  rollId: number;
  onQuickRoll?: () => void;
  canRoll?: boolean;
  sizeTier?: 'sm' | 'md' | 'lg' | 'xl';
}> = ({ dice, rollId, onQuickRoll, canRoll, sizeTier = 'lg' }) => {
  const [rollSignal, setRollSignal] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [isInFlight, setIsInFlight] = useState(false);
  const [hovered, setHovered] = useState(false);

  const prevRollIdRef = useRef<number>(rollId);
  const rippleControls = useAnimationControls();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glResRef = useRef<GLResources | null>(null);

  // Balanced preview [1, 6] before first roll showcases both the Artisan Ace seal and classic 6-pip face
  const d1 = dice?.[0] ?? 1;
  const d2 = dice?.[1] ?? 6;
  const isDouble = dice !== null && d1 === d2;
  const sum = dice ? d1 + d2 : null;

  const animRef = useRef<{
    qStart0: Quat;
    qEnd0: Quat;
    qCur0: Quat;
    qStart1: Quat;
    qEnd1: Quat;
    qCur1: Quat;
    val0: number;
    val1: number;
    rollCount: number;
    rollStartMs: number;
    rolling: boolean;
    hoverCur: number;
    hoverTarget: number;
    rafId: number | null;
  }>({
    qStart0: buildRestQuat(d1, BASE_YAW_0),
    qEnd0: buildRestQuat(d1, BASE_YAW_0),
    qCur0: buildRestQuat(d1, BASE_YAW_0),
    qStart1: buildRestQuat(d2, BASE_YAW_1),
    qEnd1: buildRestQuat(d2, BASE_YAW_1),
    qCur1: buildRestQuat(d2, BASE_YAW_1),
    val0: d1,
    val1: d2,
    rollCount: 0,
    rollStartMs: 0,
    rolling: false,
    hoverCur: 0,
    hoverTarget: 0,
    rafId: null,
  });

  const renderFrameRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    glResRef.current = initDiceWebGL(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      glResRef.current = null;
    };
    const handleContextRestored = () => {
      if (canvasRef.current) {
        glResRef.current = initDiceWebGL(canvasRef.current);
        renderFrameRef.current();
      }
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const rotBuf0 = new Float32Array(9);
    const rotBuf1 = new Float32Array(9);
    let lastTs = performance.now();

    const evalDieTrajectory = (
      uRaw: number,
      qStart: Quat,
      qEnd: Quat,
      baseX: number,
      dir: -1 | 1,
      rollIdx: number
    ): { pos: [number, number, number]; q: Quat } => {
      const u = Math.max(0, Math.min(1, uRaw));
      if (u >= 1) {
        return { pos: [baseX, 0, 0.04], q: qEnd };
      }

      // Parabolic throw arc + two physical damped bounces on the velvet floor
      let y = 0;
      if (u < 0.56) {
        const s = u / 0.56;
        y = 4 * s * (1 - s) * 0.68;
      } else if (u < 0.82) {
        const s = (u - 0.56) / 0.26;
        y = 4 * s * (1 - s) * 0.2;
      } else {
        const s = (u - 0.82) / 0.18;
        y = 4 * s * (1 - s) * 0.045;
      }

      // Subtle lateral & forward tabletop momentum that settles cleanly to rest
      const settle = Math.pow(1 - u, 1.85);
      const arcWave = Math.sin(u * Math.PI);
      const x = baseX + dir * 0.14 * arcWave * settle;
      const z = 0.04 + 0.19 * arcWave * settle;

      // Smooth base face slerp completed before final settle bounce
      const qBase = quatSlerp(qStart, qEnd, smoothstep(0.04, 0.78, u));

      // Multi-axis 720° (4*PI) decaying 3D tumble: equals 4*PI (Identity!) at u=0 and 0 (Identity!) at u=1
      const easeSpin = 1 - Math.pow(1 - u, 3.05);
      const spinAngle = (1 - easeSpin) * (Math.PI * 4);
      const tiltPhase = rollIdx * 1.17 + (dir < 0 ? 0.2 : 0.9);
      const qSpin = quatFromAxisAngle(
        dir * 0.74,
        0.24 * Math.cos(tiltPhase),
        -dir * 0.62,
        spinAngle
      );

      // Subtle impact rock upon hitting the velvet tray at u = 0.56
      let qRock: Quat = [1, 0, 0, 0];
      if (u > 0.56) {
        const b = (u - 0.56) / 0.44;
        const rockAngle =
          Math.sin(b * Math.PI * 2.5) * Math.pow(1 - b, 2.1) * 0.2;
        qRock = quatFromAxisAngle(0.45, 0, dir * 0.88, rockAngle);
      }

      const q = quatNormalize(quatMul(qRock, quatMul(qSpin, qBase)));
      return { pos: [x, y, z], q };
    };

    const drawCurrentState = (now: number) => {
      const cvs = canvasRef.current;
      if (!cvs) return;

      const dt = Math.min(0.064, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      const st = animRef.current;
      const dims = CANVAS_SIZES[sizeTier];
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const targetW = Math.round(dims.w * dpr);
      const targetH = Math.round(dims.h * dpr);
      if (cvs.width !== targetW || cvs.height !== targetH) {
        cvs.width = targetW;
        cvs.height = targetH;
      }

      // Smooth spring-like hover levitation when ready to roll
      const hoverDiff = st.hoverTarget - st.hoverCur;
      if (Math.abs(hoverDiff) > 0.002) {
        st.hoverCur += hoverDiff * Math.min(1, dt * 14);
      } else {
        st.hoverCur = st.hoverTarget;
      }

      let pos0: [number, number, number] = [-1.12, st.hoverCur * 0.14, 0.04];
      let pos1: [number, number, number] = [1.12, st.hoverCur * 0.14, 0.04];
      let q0 = st.qEnd0;
      let q1 = st.qEnd1;

      const ROLL_DURATION_MS = 1320;
      const DIE1_STAGGER_MS = 48;

      if (st.rolling) {
        const elapsed = now - st.rollStartMs;
        const u0 = elapsed / ROLL_DURATION_MS;
        const u1 = Math.max(0, elapsed - DIE1_STAGGER_MS) / ROLL_DURATION_MS;

        const tr0 = evalDieTrajectory(
          u0,
          st.qStart0,
          st.qEnd0,
          -1.12,
          -1,
          st.rollCount
        );
        const tr1 = evalDieTrajectory(
          u1,
          st.qStart1,
          st.qEnd1,
          1.12,
          1,
          st.rollCount
        );

        pos0 = tr0.pos;
        pos1 = tr1.pos;
        q0 = tr0.q;
        q1 = tr1.q;

        if (u0 >= 1 && u1 >= 1) {
          st.rolling = false;
        }
      } else if (st.hoverCur > 0.002) {
        const tilt0 = quatFromAxisAngle(0.6, 0, -0.5, st.hoverCur * 0.08);
        const tilt1 = quatFromAxisAngle(0.6, 0, 0.5, st.hoverCur * 0.08);
        q0 = quatNormalize(quatMul(tilt0, st.qEnd0));
        q1 = quatNormalize(quatMul(tilt1, st.qEnd1));
      }

      st.qCur0 = q0;
      st.qCur1 = q1;

      const res = glResRef.current;
      if (res) {
        const { gl } = res;
        gl.viewport(0, 0, cvs.width, cvs.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(res.program);

        quatToMat3(q0, rotBuf0);
        quatToMat3(q1, rotBuf1);

        const isDark =
          document.documentElement.getAttribute('data-theme') === 'dark'
            ? 1.0
            : 0.0;

        gl.uniform2f(res.uRes, cvs.width, cvs.height);
        gl.uniform3f(res.uPos0, pos0[0], pos0[1], pos0[2]);
        gl.uniform3f(res.uPos1, pos1[0], pos1[1], pos1[2]);
        gl.uniformMatrix3fv(res.uRot0, false, rotBuf0);
        gl.uniformMatrix3fv(res.uRot1, false, rotBuf1);
        gl.uniform1f(res.uDarkTheme, isDark);
        gl.uniform1f(res.uCamLift, Math.max(0, (pos0[1] + pos1[1]) * 0.5));

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else {
        drawFallback2D(cvs, st.val0, st.val1, Math.max(pos0[1], pos1[1]));
      }

      const needsNextFrame =
        st.rolling || Math.abs(st.hoverTarget - st.hoverCur) > 0.002;
      if (needsNextFrame) {
        st.rafId = requestAnimationFrame(drawCurrentState);
      } else {
        st.rafId = null;
      }
    };

    const kickLoop = () => {
      const st = animRef.current;
      if (st.rafId === null) {
        lastTs = performance.now();
        st.rafId = requestAnimationFrame(drawCurrentState);
      }
    };

    renderFrameRef.current = kickLoop;
    drawCurrentState(performance.now());

    // Re-render single frame if light/dark theme toggles while idle
    const themeObserver = new MutationObserver(() => {
      kickLoop();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      themeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      if (animRef.current.rafId !== null) {
        cancelAnimationFrame(animRef.current.rafId);
        animRef.current.rafId = null;
      }
      if (glResRef.current) {
        const { gl, program, buffer } = glResRef.current;
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        glResRef.current = null;
      }
    };
  }, [sizeTier]);

  // Sync hover levitation target without wasting idle frames
  useEffect(() => {
    const activeHover = Boolean(canRoll && hovered && !isRolling);
    animRef.current.hoverTarget = activeHover ? 1 : 0;
    renderFrameRef.current();
  }, [canRoll, hovered, isRolling]);

  // Update resting faces immediately if dice prop syncs without a new rollId (e.g. room join / reconnect)
  useEffect(() => {
    const st = animRef.current;
    st.val0 = d1;
    st.val1 = d2;
    if (!st.rolling && rollId === prevRollIdRef.current) {
      const q0 = buildRestQuat(d1, BASE_YAW_0);
      const q1 = buildRestQuat(d2, BASE_YAW_1);
      st.qStart0 = q0;
      st.qEnd0 = q0;
      st.qCur0 = q0;
      st.qStart1 = q1;
      st.qEnd1 = q1;
      st.qCur1 = q1;
      renderFrameRef.current();
    }
  }, [d1, d2, rollId]);

  // Trigger full 3D parabolic throw & 720° tumble when rollId advances
  useEffect(() => {
    if (rollId > 0 && rollId !== prevRollIdRef.current) {
      prevRollIdRef.current = rollId;
      setRollSignal((prev) => prev + 1);
      setIsRolling(true);
      setIsInFlight(true);

      const st = animRef.current;
      st.rollCount += 1;
      st.val0 = d1;
      st.val1 = d2;
      st.qStart0 = st.qCur0;
      st.qStart1 = st.qCur1;

      // Subtle organic tabletop yaw variation (±3.8°) + 90° spin variety so doubles look distinct & natural
      const quarter0 = (st.rollCount % 4) * (Math.PI * 0.5);
      const quarter1 = ((st.rollCount + 1) % 4) * (Math.PI * 0.5);
      const jitter0 = Math.sin(rollId * 2.17) * 0.065;
      const jitter1 = Math.cos(rollId * 1.93) * 0.065;

      st.qEnd0 = buildRestQuat(d1, BASE_YAW_0 + quarter0 + jitter0);
      st.qEnd1 = buildRestQuat(d2, BASE_YAW_1 + quarter1 + jitter1);
      st.rollStartMs = performance.now();
      st.rolling = true;
      renderFrameRef.current();

      rippleControls.start({
        scale: [0.76, 1.18],
        opacity: [0, 0.36, 0],
        transition: {
          duration: 0.58,
          delay: 0.73,
          ease: 'easeOut',
        },
      });

      const flightTimer = setTimeout(() => setIsInFlight(false), 860);
      const timer = setTimeout(() => setIsRolling(false), 1360);
      return () => {
        clearTimeout(flightTimer);
        clearTimeout(timer);
      };
    }
    prevRollIdRef.current = rollId;
  }, [rollId, d1, d2, rippleControls]);

  const dims = CANVAS_SIZES[sizeTier];

  const trayPadding =
    sizeTier === 'sm'
      ? 'px-2.5 py-1.5 rounded-2xl'
      : sizeTier === 'md'
        ? 'px-3.5 pt-2 pb-2 rounded-2xl'
        : sizeTier === 'lg'
          ? 'px-4 pt-2.5 pb-2.5 rounded-[24px]'
          : 'px-4.5 pt-3 pb-3 rounded-[26px]';

  return (
    <div
      className={`flex flex-col items-center ${
        sizeTier === 'sm' ? 'gap-1' : 'gap-2'
      } shrink-0`}
    >
      {/* Recessed Velvet / Satin-Slate Dice Arena */}
      <div
        onClick={() => {
          if (canRoll && onQuickRoll) onQuickRoll();
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={canRoll ? 'Натисніть на кубики, щоб зробити кидок' : undefined}
        className={`relative flex flex-col items-center ${trayPadding} dice-velvet-tray border backdrop-blur-md transition-all duration-200 ${
          canRoll
            ? 'cursor-pointer border-blue-500/40 dark:border-amber-400/35 hover:border-blue-500/70 dark:hover:border-amber-300/60 active:scale-[0.98]'
            : 'border-slate-300/85 dark:border-slate-400/18'
        }`}
      >
        {/* Clipped Interior Effects Layer (Landing Shockwave & Subtle Double Sheen) */}
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden">
          <motion.div
            animate={rippleControls}
            initial={{ opacity: 0, scale: 0.76 }}
            className="absolute inset-3 rounded-[inherit] border border-blue-500/35 dark:border-amber-300/40"
          />
          {isDouble && !isRolling && (
            <motion.div
              key={`double-sheen-${rollId}`}
              initial={{ x: '-115%', opacity: 0 }}
              animate={{ x: '115%', opacity: [0, 0.55, 0] }}
              transition={{ duration: 0.85, ease: 'easeInOut' }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-300/18 to-transparent -skew-x-12"
            />
          )}
        </div>

        {/* Clean Top Micro-Header */}
        {sizeTier !== 'sm' && (
          <div className="relative z-10 w-full flex items-center justify-between gap-3.5 px-1.5 mb-0.5 select-none">
            <span className="inline-flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300/85 whitespace-nowrap">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  canRoll
                    ? 'bg-emerald-500 dark:bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.65)] animate-pulse'
                    : 'bg-slate-400/70 dark:bg-slate-500'
                }`}
              />
              {dice === null
                ? canRoll
                  ? 'Ваш хід • Кидайте'
                  : 'Початок партії'
                : canRoll
                  ? 'Ваш кидок'
                  : 'Ігровий стіл'}
            </span>
            {sum !== null && (
              <span className="text-[9.5px] font-extrabold tracking-wider text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                {isInFlight ? (
                  <span className="text-blue-600/80 dark:text-amber-300/85">
                    Кидок...
                  </span>
                ) : (
                  <>
                    {d1} + {d2} ={' '}
                    <strong className="text-blue-600 dark:text-amber-300">
                      {sum}
                    </strong>
                  </>
                )}
              </span>
            )}
          </div>
        )}

        {/* Supersampled 3D Raymarched Rounded Dice Stage */}
        <div className="relative z-20 flex items-center justify-center select-none">
          <canvas
            ref={canvasRef}
            style={{ width: `${dims.w}px`, height: `${dims.h}px` }}
            className="block pointer-events-none"
            aria-label={`Кубики: ${d1} та ${d2}`}
          />
        </div>
      </div>

      {/* Crisp Result & Double Pill (Revealed smoothly right as dice land on the tray) */}
      {sum !== null && !isInFlight && (
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <motion.span
            key={`sum-${rollId}`}
            initial={rollSignal > 0 ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
            className={`rounded-full font-extrabold bg-white/95 text-slate-800 border border-slate-200/95 dark:bg-[#0b111e]/95 dark:text-slate-100 dark:border-slate-400/20 shadow-md tabular-nums whitespace-nowrap ${
              sizeTier === 'sm'
                ? 'px-2.5 py-0.5 text-[10px]'
                : 'px-3.5 py-1 text-xs'
            }`}
          >
            Випало:{' '}
            <span className="text-blue-600 dark:text-amber-300">{sum}</span>
            {sizeTier === 'sm' ? ` (${d1}+${d2})` : ' клітинок'}
          </motion.span>

          {isDouble && (
            <motion.span
              key={`double-${rollId}`}
              initial={{ opacity: 0, scale: 0.85, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                type: 'spring',
                stiffness: 360,
                damping: 22,
                delay: 0.08,
              }}
              className={`rounded-full font-black bg-amber-400/90 text-slate-950 border border-amber-200/60 shadow-sm whitespace-nowrap ${
                sizeTier === 'sm'
                  ? 'px-2 py-0.5 text-[10px]'
                  : 'px-3 py-1 text-[11px] tracking-wide'
              }`}
            >
              ✦ ДУБЛЬ {d1}:{d2}
            </motion.span>
          )}
        </div>
      )}
    </div>
  );
};
