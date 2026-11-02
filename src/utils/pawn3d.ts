import { TokenId } from '../shared/types';

/**
 * Offscreen Supersampled (4x RGSS) WebGL PBR 3D Royal Medallion Tabletop Figurine Renderer.
 * Sculpted Faberge/Cartier-inspired deep guilloche jewel-enamel pedestal, double-stepped 24K
 * brushed champagne-gold plinth, anodized dark-obsidian velvet foot ring, and a tilted 3D
 * gold-bezel cabochon showcase head with a true 3D-embossed 24K gold Ukrainian relief crest
 * beneath a domed sapphire watch-crystal clearcoat.
 *
 * Rendered ONCE per (token, color, crowned) at 232x300 x 4 RGSS samples and cached as a
 * straight-alpha Retina PNG data URL for 0% runtime GPU/CPU cost and 120fps board movement.
 */

const PAWN_SPRITE_CACHE = new Map<string, string>();
const EMBLEM_RELIEF_CACHE = new Map<TokenId, Uint8Array>();

const EMBLEM_TEX_SIZE = 128;

const PAWN_VS = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const PAWN_FS = `
precision highp float;

uniform vec2 uRes;
uniform vec3 uColorLinear;
uniform float uCrowned;
uniform sampler2D uEmblemTex;

const float SIN_TILT = 0.30901699; // sin(18 deg)
const float COS_TILT = 0.95105652; // cos(18 deg)

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float smax(float a, float b, float k) {
  return -smin(-a, -b, k);
}

float sdRoundedCyl(vec3 p, float ra, float rb, float h) {
  vec2 d = vec2(length(p.xz) - (ra - rb), abs(p.y) - (h - rb));
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - rb;
}

vec3 toMedallionLocal(vec3 p) {
  vec3 pm = p - vec3(0.0, 0.485, 0.020);
  return vec3(
    pm.x,
    COS_TILT * pm.y - SIN_TILT * pm.z,
    SIN_TILT * pm.y + COS_TILT * pm.z
  );
}

// Returns vec2(signedDistance, materialId):
// 1.0 = Deep Guilloche Jewel-Enamel Pedestal
// 2.0 = 24K Brushed & Polished Champagne Gold (Plinth, Rings, Bezel, Crown)
// 3.0 = Dark Anodized Obsidian Velvet Foot Ring
// 4.0 = Recessed Dark-Jewel Enamel Showcase Well + 3D Embossed 24K Gold Emblem
vec2 mapPawn(vec3 p) {
  float r = length(p.xz);
  float ang = atan(p.x, p.z);

  // 1. Recessed Dark-Obsidian Velvet Foot Ring (guarantees crisp edge separation on bright cards)
  float dFeltPad = sdRoundedCyl(p - vec3(0.0, -0.856, 0.0), 0.625, 0.018, 0.025);

  // 2. Double-Stepped 24K Brushed Champagne-Gold Weighted Plinth
  float dGoldLower = sdRoundedCyl(p - vec3(0.0, -0.798, 0.0), 0.606, 0.036, 0.052);
  float dGoldUpper = sdRoundedCyl(p - vec3(0.0, -0.718, 0.0), 0.532, 0.032, 0.044);
  float dGoldPlinth = min(dGoldLower, dGoldUpper);

  // 3. Molded Jewel-Enamel Lower Cushion + Fluted Guilloche Tapered Pedestal Column
  float dCushion = sdRoundedCyl(p - vec3(0.0, -0.620, 0.0), 0.476, 0.062, 0.078);

  float ty = clamp((p.y + 0.58) / 0.66, 0.0, 1.0);
  float fluteMask = smoothstep(0.06, 0.24, ty) * (1.0 - smoothstep(0.76, 0.96, ty));
  float flutes = 0.011 * cos(ang * 14.0) * fluteMask;
  float stemRad = mix(0.430, 0.218, pow(max(ty, 0.0001), 0.56)) - 0.042 * sin(ty * 3.14159265) + flutes;
  vec2 dStem2 = vec2(r - stemRad, abs(p.y + 0.25) - 0.34);
  float dStem = (min(max(dStem2.x, dStem2.y), 0.0) + length(max(dStem2, 0.0))) * 0.74;

  float dJewel = smin(dCushion, dStem, 0.065);

  // 4. 24K Gold Waist Ring & Sculpted Neck Torus Collar
  float dWaistRing = sdRoundedCyl(p - vec3(0.0, -0.548, 0.0), 0.456, 0.016, 0.020);
  float dCollar = sdRoundedCyl(p - vec3(0.0, 0.055, 0.0), 0.308, 0.030, 0.038);

  // 5. Tilted 3D Royal Gold-Bezel Cabochon Medallion Head (facing the tabletop viewer)
  vec3 q = toMedallionLocal(p);
  float rq = length(q.xy);
  float qAng = atan(q.y, q.x);

  // Subtle 28-groove coin-edge knurling around the gold medallion case
  float knurl = 0.0042 * cos(qAng * 28.0) *
    smoothstep(0.41, 0.46, rq) *
    (1.0 - smoothstep(0.045, 0.105, abs(q.z)));

  float dCaseOuter = sdRoundedCyl(vec3(q.x, q.z, q.y), 0.476, 0.054, 0.128) - knurl;
  float dFrontDish = sdRoundedCyl(vec3(q.x, q.z - 0.132, q.y), 0.382, 0.018, 0.042);
  float dMedallion = smax(dCaseOuter, -dFrontDish, 0.014);

  // 6. Royal 24K Gold Top Finial (5-Peak Royal Coronet for human player, Sovereign Finial for AI/opponents)
  vec3 qt = q - vec3(0.0, 0.472, 0.0);
  float rt = length(qt.xz);
  float dTopGold;
  if (uCrowned > 0.5) {
    float cAng = atan(qt.x, qt.z);
    float wave = 0.5 + 0.5 * cos(cAng * 5.0);
    float crownH = 0.072 + 0.062 * pow(max(wave, 0.0001), 1.35);
    float flareR = 0.168 + 0.065 * clamp(qt.y / 0.15, 0.0, 1.0);
    vec2 dc = vec2(
      abs(rt - flareR * 0.72) - flareR * 0.31,
      abs(qt.y - (0.015 + crownH * 0.5)) - crownH * 0.5
    );
    float dCrownBody = (min(max(dc.x, dc.y), 0.0) + length(max(dc, 0.0)) - 0.020) * 0.70;
    float dCrownBand = sdRoundedCyl(qt - vec3(0.0, 0.016, 0.0), 0.188, 0.022, 0.026);
    dTopGold = smin(dCrownBand, dCrownBody, 0.024);
  } else {
    float dFinBase = sdRoundedCyl(qt - vec3(0.0, 0.014, 0.0), 0.128, 0.020, 0.024);
    float dFinGem = length((qt - vec3(0.0, 0.072, 0.0)) * vec3(1.0, 0.88, 1.0)) - 0.062;
    dTopGold = smin(dFinBase, dFinGem, 0.020);
  }

  float dMedallionAssembly = smin(dMedallion, dTopGold, 0.022);
  float dGoldAll = min(
    min(dGoldPlinth, min(dWaistRing, dCollar)),
    dMedallionAssembly
  );

  vec2 res = vec2(dJewel, 1.0);
  if (dGoldAll < res.x) {
    float isFrontWell = (rq < 0.376 && q.z > 0.065 && qt.y < -0.04) ? 1.0 : 0.0;
    res = vec2(dGoldAll, isFrontWell > 0.5 ? 4.0 : 2.0);
  }
  if (dFeltPad < res.x) {
    res = vec2(dFeltPad, 3.0);
  }
  return res;
}

vec3 calcNormal(vec3 p) {
  const float e = 0.0008;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * mapPawn(p + k.xyy * e).x +
    k.yyx * mapPawn(p + k.yyx * e).x +
    k.yxy * mapPawn(p + k.yxy * e).x +
    k.xxx * mapPawn(p + k.xxx * e).x
  );
}

float calcAO(vec3 pos, vec3 nor) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.016 + 0.042 * float(i);
    float d = mapPawn(pos + h * nor).x;
    occ += (h - d) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 2.55 * occ, 0.12, 1.0);
}

vec3 sampleStudioEnv(vec3 r) {
  vec3 dome = mix(
    vec3(0.025, 0.038, 0.075),
    vec3(0.22, 0.27, 0.40),
    clamp(r.y * 0.5 + 0.5, 0.0, 1.0)
  );
  float mainBox = smoothstep(0.56, 0.90, dot(r, normalize(vec3(-0.38, 0.78, 0.50))));
  float sideFill = smoothstep(0.66, 0.93, dot(r, normalize(vec3(0.76, 0.34, 0.55))));
  float warmRim = smoothstep(0.66, 0.94, dot(r, normalize(vec3(-0.74, 0.46, -0.49))));
  return dome +
    mainBox * vec3(1.38, 1.33, 1.24) +
    sideFill * vec3(0.34, 0.44, 0.62) +
    warmRim * vec3(0.62, 0.46, 0.22);
}

vec3 shade24KGold(vec3 n, vec3 v, float ao, vec3 lKey, vec3 lFill, vec3 lRim, float richness) {
  float diffKey = max(dot(n, lKey), 0.0);
  float diffFill = max(dot(n, lFill), 0.0);
  float diffRim = max(dot(n, lRim), 0.0);
  vec3 hKey = normalize(lKey + v);
  vec3 hFill = normalize(lFill + v);
  float nhKey = max(dot(n, hKey), 0.0001);
  float nhFill = max(dot(n, hFill), 0.0001);
  float nv = max(dot(n, v), 0.0);
  float fresnel = pow(max(1.0 - nv, 0.0001), 3.6);

  vec3 refl = reflect(-v, n);
  vec3 envCol = sampleStudioEnv(refl);

  vec3 goldBase = mix(vec3(0.92, 0.71, 0.30), vec3(0.97, 0.76, 0.32), richness);
  vec3 bronzeShadow = vec3(0.24, 0.14, 0.04) * ao;
  vec3 irrad =
    diffKey * vec3(1.18, 1.10, 0.96) +
    diffFill * vec3(0.30, 0.34, 0.44) +
    diffRim * vec3(0.36, 0.28, 0.16) +
    bronzeShadow;

  vec3 spec =
    vec3(1.0, 0.96, 0.80) *
    (pow(nhKey, 44.0) * 1.32 + pow(nhFill, 24.0) * 0.42 + pow(nhKey, 12.0) * 0.22);

  return goldBase * irrad * 0.54 +
    envCol * vec3(1.0, 0.85, 0.48) * (0.30 + 0.50 * fresnel) * ao +
    spec;
}

vec4 sampleRay(vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * uRes) / uRes.y;

  // Elevated ~26.5 deg luxury tabletop figurine camera
  vec3 ro = vec3(0.0, 1.70, 3.42);
  vec3 ta = vec3(0.0, -0.04, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.52 * ww);

  // Bounding sphere culling around entire figurine
  vec3 oc = ro - vec3(0.0, 0.08, 0.0);
  float b = dot(oc, rd);
  float c = dot(oc, oc) - 1.78;
  float disc = b * b - c;

  float tHit = -1.0;
  float matId = 0.0;

  if (disc > 0.0) {
    float sq = sqrt(disc);
    float t = max(0.0, -b - sq);
    float tEnd = -b + sq;
    for (int i = 0; i < 64; i++) {
      vec2 res = mapPawn(ro + rd * t);
      if (res.x < 0.00042) {
        tHit = t;
        matId = res.y;
        break;
      }
      t += res.x;
      if (t > tEnd) break;
    }
  }

  if (tHit > 0.0) {
    vec3 p = ro + rd * tHit;
    vec3 n = calcNormal(p);
    vec3 v = -rd;
    float ao = calcAO(p, n);

    vec3 lKey = normalize(vec3(-0.40, 0.78, 0.48));
    vec3 lFill = normalize(vec3(0.75, 0.28, 0.60));
    vec3 lRim = normalize(vec3(-0.12, 0.55, -0.82));

    float diffKey = max(dot(n, lKey), 0.0);
    float diffFill = max(dot(n, lFill), 0.0);
    float diffRim = max(dot(n, lRim), 0.0);

    vec3 hKey = normalize(lKey + v);
    vec3 hFill = normalize(lFill + v);
    float nhKey = max(dot(n, hKey), 0.0001);
    float nhFill = max(dot(n, hFill), 0.0001);
    float nv = max(dot(n, v), 0.0);
    float fresnel = pow(max(1.0 - nv, 0.0001), 4.0);

    vec3 refl = reflect(-v, n);
    vec3 envCol = sampleStudioEnv(refl);

    vec3 col;
    if (matId > 3.5) {
      // 4.0: Vivid Player-Colored Sunburst Guilloche Gemstone Enamel + 3D Embossed 24K Gold/Champagne Crest
      vec3 q = toMedallionLocal(p);
      float rq = length(q.xy);
      vec2 eUv = clamp(q.xy / 0.352 * 0.5 + 0.5, 0.0, 1.0);
      vec4 emb = texture2D(uEmblemTex, eUv);

      // Rich player-color sunburst guilloche enamel so the pawn's head unmistakably displays the player's color!
      float rays = 0.5 + 0.5 * cos(atan(q.y, q.x) * 28.0);
      float radGlow = max(1.0 - smoothstep(0.0, 0.376, rq), 0.0001);
      float bezelAO = smoothstep(0.376, 0.308, rq);

      // If player color is warm gold/amber, deepen the enamel bed slightly into imperial amber-ruby for crisp crest contrast
      float isWarmGoldPlayer = smoothstep(0.32, 0.65, uColorLinear.r - uColorLinear.b) *
        smoothstep(0.12, 0.36, uColorLinear.g);
      vec3 jewelTint = mix(uColorLinear, uColorLinear * vec3(0.72, 0.42, 0.18), isWarmGoldPlayer * 0.65);

      vec3 enamelCol =
        jewelTint * (0.42 + 0.92 * radGlow + 0.28 * rays * radGlow) +
        mix(jewelTint, vec3(1.0), 0.25) * 0.18 * pow(radGlow, 1.5);

      // Deep localized relief drop-shadow directly behind the raised 3D emblem + inner bezel AO
      enamelCol *= (1.0 - 0.80 * emb.b) * (0.50 + 0.50 * bezelAO);

      // Compute true 3D relief normal from the smooth Gaussian heightfield (G channel)
      const float eps = 1.0 / 128.0;
      float hL = texture2D(uEmblemTex, clamp(eUv - vec2(eps, 0.0), 0.0, 1.0)).g;
      float hR = texture2D(uEmblemTex, clamp(eUv + vec2(eps, 0.0), 0.0, 1.0)).g;
      float hD = texture2D(uEmblemTex, clamp(eUv - vec2(0.0, eps), 0.0, 1.0)).g;
      float hU = texture2D(uEmblemTex, clamp(eUv + vec2(0.0, eps), 0.0, 1.0)).g;

      vec3 nLocal = normalize(vec3((hL - hR) * 4.4, (hD - hU) * 4.4, 1.0));
      vec3 nRelief = normalize(vec3(
        nLocal.x,
        COS_TILT * nLocal.y + SIN_TILT * nLocal.z,
        -SIN_TILT * nLocal.y + COS_TILT * nLocal.z
      ));

      vec3 goldCrestCol = shade24KGold(nRelief, v, 0.96, lKey, lFill, lRim, 1.0);
      // Brighten crest into champagne-ivory white gold so it gleams distinctly on every player color
      goldCrestCol = mix(goldCrestCol, vec3(1.05, 1.02, 0.94) * length(goldCrestCol) * 0.68, 0.34 + 0.30 * isWarmGoldPlayer);
      float bevelEdge = clamp((hR - hL) * 0.55 + (hD - hU) * 0.75, 0.0, 1.0);
      goldCrestCol += vec3(1.0, 0.98, 0.90) * bevelEdge * 0.54;

      float goldMask = smoothstep(0.34, 0.62, emb.r);
      vec3 wellCol = mix(enamelCol, goldCrestCol, goldMask);

      // Domed Sapphire Watch-Crystal Clearcoat Reflection arching across the medallion face
      vec3 domeLocal = normalize(vec3(q.x * 0.95, q.y * 0.95, 1.0));
      vec3 nDome = normalize(vec3(
        domeLocal.x,
        COS_TILT * domeLocal.y + SIN_TILT * domeLocal.z,
        -SIN_TILT * domeLocal.y + COS_TILT * domeLocal.z
      ));
      float domeSpec = pow(max(dot(nDome, hKey), 0.0001), 92.0) * 0.30;
      float domeFres = pow(max(1.0 - max(dot(nDome, v), 0.0), 0.0001), 4.0);
      wellCol += vec3(0.96, 0.98, 1.0) * domeSpec + sampleStudioEnv(reflect(-v, nDome)) * 0.055 * domeFres;

      // Sub-pixel smooth transition into the surrounding 3D 24K gold bezel wall
      float bezelWallBlend = smoothstep(0.360, 0.376, rq);
      vec3 bezelGoldCol = shade24KGold(n, v, ao, lKey, lFill, lRim, uCrowned);
      col = mix(wellCol, bezelGoldCol, bezelWallBlend);
    } else if (matId > 2.5) {
      // 3.0: Dark Anodized Obsidian Velvet Foot Ring
      vec3 baseObs = vec3(0.010, 0.015, 0.030);
      col = baseObs * (0.45 + 0.85 * diffKey) * ao + envCol * 0.04 * fresnel;
    } else if (matId > 1.5) {
      // 2.0: 24K Brushed & Polished Champagne Gold Plinth, Collar, Bezel & Crown
      col = shade24KGold(n, v, ao, lKey, lFill, lRim, uCrowned);
    } else {
      // 1.0: Deep Faberge Guilloche Translucent Gemstone Enamel Pedestal (rich dark core, zero chalky wash-out!)
      float keyShaped = pow(max(diffKey, 0.0001), 1.12);
      vec3 deepShadowAmb = mix(vec3(0.035, 0.045, 0.080), vec3(0.11, 0.13, 0.19), 0.5 + 0.5 * n.y);
      vec3 goldBounce = vec3(0.16, 0.11, 0.04) * exp(-abs(p.y + 0.68) * 3.8);

      // Subsurface internal gemstone glow (warms the lower belly without bleaching shadows)
      float sss = pow(max(1.0 - nv, 0.0001), 2.0) * (0.25 + 0.75 * diffFill);
      vec3 irrad =
        keyShaped * vec3(1.16, 1.12, 1.06) +
        diffFill * vec3(0.22, 0.26, 0.36) +
        diffRim * vec3(0.20, 0.24, 0.34) +
        (deepShadowAmb + goldBounce) * ao;

      float clearCoat = pow(nhKey, 86.0) * 0.95 + pow(nhFill, 42.0) * 0.22;
      float satinSheen = pow(nhKey, 18.0) * 0.14;
      vec3 jewelRim = mix(uColorLinear, vec3(0.95, 0.97, 1.0), 0.35) * fresnel * 0.38;

      col =
        uColorLinear * irrad +
        uColorLinear * uColorLinear * sss * 0.55 +
        envCol * (0.042 + 0.22 * fresnel) * ao +
        vec3(1.0, 0.99, 0.97) * (clearCoat + satinSheen) +
        jewelRim;
    }

    // Smooth ACES-inspired filmic highlight compression & sRGB gamma encoding
    col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
    vec3 srgb = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
    return vec4(srgb, 1.0);
  }

  // Grounded Studio Contact Shadow on Tabletop Card Surface (y = -0.882)
  if (rd.y < -0.01) {
    float tFloor = (-0.882 - ro.y) / rd.y;
    if (tFloor > 0.0) {
      vec3 pFloor = ro + rd * tFloor;
      float rf = length(pFloor.xz - vec2(0.022, 0.016));
      float tightCrevice = smoothstep(0.69, 0.45, rf) * 0.82;
      float softCushion = smoothstep(0.77, 0.36, rf) * 0.34;
      float a = clamp(tightCrevice + softCushion * (1.0 - tightCrevice * 0.5), 0.0, 0.88);
      vec3 shCol = vec3(0.008, 0.014, 0.034);
      return vec4(shCol * a, a);
    }
  }

  return vec4(0.0);
}

void main() {
  vec4 acc = vec4(0.0);
  acc += sampleRay(gl_FragCoord.xy + vec2(-0.375, -0.125));
  acc += sampleRay(gl_FragCoord.xy + vec2( 0.125, -0.375));
  acc += sampleRay(gl_FragCoord.xy + vec2( 0.375,  0.125));
  acc += sampleRay(gl_FragCoord.xy + vec2(-0.125,  0.375));
  vec4 c = acc * 0.25;
  gl_FragColor = c.a > 0.0005 ? vec4(clamp(c.rgb / c.a, 0.0, 1.0), c.a) : vec4(0.0);
}
`;

interface PawnGLContext {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  emblemTexture: WebGLTexture;
  uRes: WebGLUniformLocation | null;
  uColorLinear: WebGLUniformLocation | null;
  uCrowned: WebGLUniformLocation | null;
  uEmblemTex: WebGLUniformLocation | null;
}

let sharedPawnGL: PawnGLContext | null | undefined;

function hexToLinearRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  let sr = ((num >> 16) & 255) / 255;
  let sg = ((num >> 8) & 255) / 255;
  let sb = (num & 255) / 255;

  // Preserve full vivid jewel saturation so every player's pawn color is unmistakable at a glance
  sr = Math.min(1, Math.max(0, sr));
  sg = Math.min(1, Math.max(0, sg));
  sb = Math.min(1, Math.max(0, sb));

  return [Math.pow(sr, 2.2), Math.pow(sg, 2.2), Math.pow(sb, 2.2)];
}

function blurSeparable(
  src: Float32Array,
  size: number,
  radius: number
): Float32Array {
  const tmp = new Float32Array(size * size);
  const dst = new Float32Array(size * size);
  const sigma = Math.max(0.8, radius * 0.52);
  const weights = new Float32Array(radius * 2 + 1);
  let wSum = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    weights[k + radius] = w;
    wSum += w;
  }
  for (let i = 0; i < weights.length; i++) {
    weights[i] /= wSum;
  }

  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.min(size - 1, Math.max(0, x + k));
        acc += src[row + sx] * weights[k + radius];
      }
      tmp[row + x] = acc;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.min(size - 1, Math.max(0, y + k));
        acc += tmp[sy * size + x] * weights[k + radius];
      }
      dst[y * size + x] = acc;
    }
  }

  return dst;
}

function drawTokenMask64(ctx: CanvasRenderingContext2D, token: TokenId): void {
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (token === 'tryzub') {
    // Sculptural Ukrainian Heraldic Trident with bold prongs & clean negative space
    const p = new Path2D(
      'M32 5.5 L36.8 18.8 V41.2 L44.4 33.8 V13.2 L52.2 8.5 V39.2 C52.2 47.4 46.2 51.4 39.2 51.4 H35.8 L32 58.5 L28.2 51.4 H24.8 C17.8 51.4 11.8 47.4 11.8 39.2 V8.5 L19.6 13.2 V33.8 L27.2 41.2 V18.8 L32 5.5 Z'
    );
    ctx.fill(p);
    // Carve clean interior heraldic channels so the 3D gold prongs gleam distinctly
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(22.5, 45.2);
    ctx.lineTo(41.5, 45.2);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    return;
  }

  if (token === 'patron') {
    // Majestic Crowned Galician Lion Medallion Relief
    const crown = new Path2D(
      'M19 17.5 L16.5 9.2 L25 13.5 L32 6.8 L39 13.5 L47.5 9.2 L45 17.5 Z'
    );
    ctx.fill(crown);

    // Bold Heraldic Lion Mane & Noble Head Silhouette
    const mane = new Path2D(
      'M32 19.5 C43.5 19.5 51.5 27.2 51.5 37.5 C51.5 44.2 47.8 49.5 43.2 53.5 L39.5 50.2 L36.5 56.8 L32 53.8 L27.5 56.8 L24.5 50.2 L20.8 53.5 C16.2 49.5 12.5 44.2 12.5 37.5 C12.5 27.2 20.5 19.5 32 19.5 Z'
    );
    ctx.fill(mane);

    // Sculpted Negative-Space Facial & Mane Relief Grooves
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 2.5;
    // Fierce noble brows & eyes
    ctx.beginPath();
    ctx.moveTo(21.5, 31.5);
    ctx.lineTo(27.8, 34.0);
    ctx.moveTo(42.5, 31.5);
    ctx.lineTo(36.2, 34.0);
    ctx.stroke();
    // Nose & muzzle contour
    ctx.beginPath();
    ctx.moveTo(28.5, 39.5);
    ctx.lineTo(32, 43.2);
    ctx.lineTo(35.5, 39.5);
    ctx.moveTo(32, 43.2);
    ctx.lineTo(32, 47.5);
    ctx.moveTo(26.5, 48.0);
    ctx.quadraticCurveTo(32, 45.8, 37.5, 48.0);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    return;
  }

  if (token === 'mriya') {
    // Swept-Wing Flagship "Mriya" Strategic Aircraft Silhouette with 6 Engine Pods & Twin Tail
    const plane = new Path2D(
      'M32 6.5 L36.2 14.8 V24.2 L57.5 34.8 V40.5 L36.2 34.8 V46.2 L46.2 51.2 V56.2 L32 52.4 L17.8 56.2 V51.2 L27.8 46.2 V34.8 L6.5 40.5 V34.8 L27.8 24.2 V14.8 L32 6.5 Z'
    );
    ctx.fill(plane);
    // 6 forward-jutting engine nacelles along the swept wings
    const engines = [
      [12.5, 34.2],
      [18.2, 31.6],
      [23.6, 29.0],
      [40.4, 29.0],
      [45.8, 31.6],
      [51.5, 34.2],
    ];
    for (const [ex, ey] of engines) {
      ctx.beginPath();
      ctx.ellipse(ex, ey, 2.0, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.rect(16.8, 49.0, 2.6, 8.2);
    ctx.rect(44.6, 49.0, 2.6, 8.2);
    ctx.fill();
    return;
  }

  if (token === 'kozak') {
    // Crossed Curved Cossack Sabres & Central Heraldic Shield Boss
    ctx.lineWidth = 6.2;
    ctx.beginPath();
    ctx.moveTo(14, 50);
    ctx.quadraticCurveTo(28, 34, 50, 10);
    ctx.stroke();

    // Crossguard 1
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(14.5, 41.5);
    ctx.lineTo(23.5, 49.5);
    ctx.stroke();

    // Clean overlap gap before drawing second crossed sabre
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 9.2;
    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.quadraticCurveTo(36, 34, 14, 10);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    ctx.lineWidth = 6.2;
    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.quadraticCurveTo(36, 34, 14, 10);
    ctx.stroke();

    // Crossguard 2
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(49.5, 41.5);
    ctx.lineTo(40.5, 49.5);
    ctx.stroke();

    // Central Cossack Buckler Boss
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(32, 31, 9.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.beginPath();
    ctx.arc(32, 31, 7.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(32, 31, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    return;
  }

  if (token === 'kashtan') {
    // Sculpted 5-Leaf Kyiv Chestnut Palmate Relief
    const leaves = [
      'M32 6.2 C37.4 14.5 38.2 23.8 32 33.2 C25.8 23.8 26.6 14.5 32 6.2 Z',
      'M12.2 15.2 C20.8 16.5 27.6 22.8 30.6 33.5 C20.5 30.6 14.4 23.8 12.2 15.2 Z',
      'M51.8 15.2 C43.2 16.5 36.4 22.8 33.4 33.5 C43.5 30.6 49.6 23.8 51.8 15.2 Z',
      'M8.8 36.2 C16.8 33.0 24.4 34.2 30.4 38.2 C23.2 44.2 15.2 43.0 8.8 36.2 Z',
      'M55.2 36.2 C47.2 33.0 39.6 34.2 33.6 38.2 C40.8 44.2 48.8 43.0 55.2 36.2 Z',
    ];
    for (const d of leaves) {
      ctx.fill(new Path2D(d));
    }
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(32, 36.5);
    ctx.lineTo(32, 56.0);
    ctx.stroke();
    return;
  }

  if (token === 'kotyk') {
    const catHead = new Path2D(
      'M14 28 L11 11 L25 20 C27.2 19.3 29.5 19 32 19 C34.5 19 36.8 19.3 39 20 L53 11 L50 28 C51.9 31 53 34.6 53 38.5 C53 48.2 43.6 55 32 55 C20.4 55 11 48.2 11 38.5 C11 34.6 12.1 31 14 28 Z'
    );
    ctx.fill(catHead);
    return;
  }

  if (token === 'paddington') {
    ctx.beginPath();
    ctx.arc(32, 39, 15.5, 0, Math.PI * 2);
    ctx.fill();
    const hat = new Path2D(
      'M8 26 C16 22 48 22 56 26 L47 24.5 L43 11.5 C39.5 9.5 24.5 9.5 21 11.5 L17 24.5 Z'
    );
    ctx.fill(hat);
    return;
  }

  if (token === 'potter') {
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(20, 41, 10.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(44, 41, 10.5, 0, Math.PI * 2);
    ctx.stroke();
    const bolt = new Path2D(
      'M34.5 8 L27.5 18.5 H33.5 L29.5 28.5 L39 16.5 H32.8 Z'
    );
    ctx.fill(bolt);
    return;
  }

  if (token === 'mickey') {
    ctx.beginPath();
    ctx.arc(15.5, 18.5, 10.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(48.5, 18.5, 10.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(32, 38.5, 15.2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 'bulava' — Ceremonial Hetman Spiked Golden Mace (Пернач / Булава)
  ctx.lineWidth = 6.2;
  ctx.beginPath();
  ctx.moveTo(13.5, 50.5);
  ctx.lineTo(35.5, 28.5);
  ctx.stroke();

  // Pommel & Grip Ring
  ctx.beginPath();
  ctx.arc(12.5, 51.5, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(21.5, 36.5);
  ctx.lineTo(27.5, 42.5);
  ctx.stroke();

  // Heavy Spherical Mace Head + Radial Hetman Spikes
  ctx.beginPath();
  ctx.arc(41.5, 22.5, 11.6, 0, Math.PI * 2);
  ctx.fill();

  const spikeAngles = [
    -Math.PI * 0.75,
    -Math.PI * 0.5,
    -Math.PI * 0.25,
    0,
    Math.PI * 0.25,
    Math.PI * 0.5,
  ];
  for (const a of spikeAngles) {
    const tipX = 41.5 + Math.cos(a) * 16.8;
    const tipY = 22.5 + Math.sin(a) * 16.8;
    const leftX = 41.5 + Math.cos(a - 0.24) * 10.6;
    const leftY = 22.5 + Math.sin(a - 0.24) * 10.6;
    const rightX = 41.5 + Math.cos(a + 0.24) * 10.6;
    const rightY = 22.5 + Math.sin(a + 0.24) * 10.6;
    ctx.beginPath();
    ctx.moveTo(leftX, leftY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
  }

  // Carved central signet jewel depression on mace sphere
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(41.5, 22.5, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function getEmblemReliefPixels(token: TokenId): Uint8Array | null {
  const cached = EMBLEM_RELIEF_CACHE.get(token);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const size = EMBLEM_TEX_SIZE;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.scale(size / 64, size / 64);
  drawTokenMask64(ctx, token);
  ctx.restore();

  const img = ctx.getImageData(0, 0, size, size).data;
  const mask = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    mask[i] = img[i * 4 + 3] / 255;
  }

  // Smooth bevel heightfield (combines fine + medium Gaussian passes for sculpted 3D gold dome)
  const blurFine = blurSeparable(mask, size, 2);
  const blurBroad = blurSeparable(mask, size, 5);
  const heightField = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    heightField[i] = Math.min(
      1,
      mask[i] * 0.24 + blurFine[i] * 0.48 + blurBroad[i] * 0.28
    );
  }

  // Shifted soft drop-shadow field (+2.5px right, +3.5px down in canvas coords)
  const shifted = new Float32Array(size * size);
  const dx = 3;
  const dy = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = x - dx;
      const sy = y - dy;
      if (sx >= 0 && sx < size && sy >= 0 && sy < size) {
        shifted[y * size + x] = mask[sy * size + sx];
      }
    }
  }
  const shadowField = blurSeparable(shifted, size, 5);

  // Flip Y into OpenGL bottom-up row order so texture2D(uEmblemTex, uv) aligns 1:1 with +Y = up!
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const srcRow = (size - 1 - y) * size;
    const dstRow = y * size;
    for (let x = 0; x < size; x++) {
      const si = srcRow + x;
      const di = (dstRow + x) * 4;
      out[di] = Math.round(Math.min(1, Math.max(0, mask[si])) * 255);
      out[di + 1] = Math.round(Math.min(1, Math.max(0, heightField[si])) * 255);
      out[di + 2] = Math.round(Math.min(1, Math.max(0, shadowField[si])) * 255);
      out[di + 3] = 255;
    }
  }

  EMBLEM_RELIEF_CACHE.set(token, out);
  return out;
}

function getSharedPawnGL(): PawnGLContext | null {
  if (sharedPawnGL !== undefined) return sharedPawnGL;
  if (typeof document === 'undefined') {
    sharedPawnGL = null;
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 232;
  canvas.height = 300;

  const attrs: WebGLContextAttributes = {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  };

  const gl =
    (canvas.getContext('webgl', attrs) as WebGLRenderingContext | null) ||
    (canvas.getContext(
      'experimental-webgl',
      attrs
    ) as WebGLRenderingContext | null);

  if (!gl) {
    sharedPawnGL = null;
    return null;
  }

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

  const vs = compile(gl.VERTEX_SHADER, PAWN_VS);
  const fs = compile(gl.FRAGMENT_SHADER, PAWN_FS);
  if (!vs || !fs) {
    sharedPawnGL = null;
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    sharedPawnGL = null;
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    sharedPawnGL = null;
    return null;
  }

  const buf = gl.createBuffer();
  const tex = gl.createTexture();
  if (!buf || !tex) {
    gl.deleteProgram(program);
    sharedPawnGL = null;
    return null;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  sharedPawnGL = {
    canvas,
    gl,
    program,
    emblemTexture: tex,
    uRes: gl.getUniformLocation(program, 'uRes'),
    uColorLinear: gl.getUniformLocation(program, 'uColorLinear'),
    uCrowned: gl.getUniformLocation(program, 'uCrowned'),
    uEmblemTex: gl.getUniformLocation(program, 'uEmblemTex'),
  };
  return sharedPawnGL;
}

function renderFallbackPawn2D(
  color: string,
  crowned: boolean,
  token: TokenId
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 232;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const sh = ctx.createRadialGradient(116, 264, 8, 116, 264, 82);
  sh.addColorStop(0, 'rgba(2, 6, 23, 0.82)');
  sh.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(116, 264, 78, 28, 0, 0, Math.PI * 2);
  ctx.fill();

  const goldGrad = ctx.createLinearGradient(46, 232, 186, 260);
  goldGrad.addColorStop(0, '#fef3c7');
  goldGrad.addColorStop(0.5, '#eab308');
  goldGrad.addColorStop(1, '#78350f');
  ctx.fillStyle = goldGrad;
  ctx.beginPath();
  ctx.ellipse(116, 248, 66, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyGrad = ctx.createLinearGradient(64, 130, 168, 240);
  bodyGrad.addColorStop(0, color);
  bodyGrad.addColorStop(0.45, color);
  bodyGrad.addColorStop(1, '#090e1a');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(64, 240);
  ctx.quadraticCurveTo(92, 180, 92, 134);
  ctx.lineTo(140, 134);
  ctx.quadraticCurveTo(140, 180, 168, 240);
  ctx.closePath();
  ctx.fill();

  // Gold bezel medallion
  ctx.fillStyle = goldGrad;
  ctx.beginPath();
  ctx.arc(116, 92, 50, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#090e1c';
  ctx.beginPath();
  ctx.arc(116, 92, 40, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(82, 58);
  ctx.scale(68 / 64, 68 / 64);
  drawTokenMask64(ctx, token);
  ctx.restore();

  if (crowned) {
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(96, 44);
    ctx.lineTo(92, 22);
    ctx.lineTo(106, 33);
    ctx.lineTo(116, 17);
    ctx.lineTo(126, 33);
    ctx.lineTo(140, 22);
    ctx.lineTo(136, 44);
    ctx.closePath();
    ctx.fill();
  }

  return canvas.toDataURL('image/png');
}

export function getPawn3DSpriteUrl(
  colorHex: string,
  crowned: boolean,
  token: TokenId = 'tryzub'
): string {
  const key = `${token}_${colorHex.toLowerCase()}_${crowned ? 'crown_v5' : 'std_v5'}`;
  const cached = PAWN_SPRITE_CACHE.get(key);
  if (cached) return cached;

  const ctx = getSharedPawnGL();
  const reliefPixels = getEmblemReliefPixels(token);
  if (!ctx || !reliefPixels) {
    const fb = renderFallbackPawn2D(colorHex, crowned, token);
    if (fb) PAWN_SPRITE_CACHE.set(key, fb);
    return fb;
  }

  const {
    canvas,
    gl,
    program,
    emblemTexture,
    uRes,
    uColorLinear,
    uCrowned,
    uEmblemTex,
  } = ctx;
  const [lr, lg, lb] = hexToLinearRgb(colorHex);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, emblemTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    EMBLEM_TEX_SIZE,
    EMBLEM_TEX_SIZE,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    reliefPixels
  );

  gl.uniform2f(uRes, canvas.width, canvas.height);
  gl.uniform3f(uColorLinear, lr, lg, lb);
  gl.uniform1f(uCrowned, crowned ? 1.0 : 0.0);
  gl.uniform1i(uEmblemTex, 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  const dataUrl = canvas.toDataURL('image/png');
  PAWN_SPRITE_CACHE.set(key, dataUrl);
  return dataUrl;
}
