// 파티클 필드와 렌즈 마무리 패스에 쓰이는 GLSL 셰이더 소스 모음
export const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

// Colour science (ASCII only for strict GLSL compilers)
export const SPECTRAL = /* glsl */`
float gPiece(float x, float mu, float s1, float s2){ float t = (x - mu) / (x < mu ? s1 : s2); return exp(-0.5 * t * t); }
// CIE 1931 2-degree colour matching functions, multi-lobe Gaussian fit (Wyman, Sloan, Shirley 2013)
vec3 wavelengthToXYZ(float l){
  float x = 1.056 * gPiece(l, 599.8, 37.9, 31.0) + 0.362 * gPiece(l, 442.0, 16.0, 26.7) - 0.065 * gPiece(l, 501.1, 20.4, 26.2);
  float y = 0.821 * gPiece(l, 568.8, 46.9, 40.5) + 0.286 * gPiece(l, 530.9, 16.3, 31.1);
  float z = 1.217 * gPiece(l, 437.0, 11.8, 36.0) + 0.681 * gPiece(l, 459.0, 26.0, 13.8);
  return vec3(x, y, z);
}
vec3 xyzToLinearSRGB(vec3 c){
  return vec3( 3.2406 * c.x - 1.5372 * c.y - 0.4986 * c.z,
              -0.9689 * c.x + 1.8758 * c.y + 0.0415 * c.z,
               0.0557 * c.x - 0.2040 * c.y + 1.0570 * c.z);
}
// Hue from l clamped to 415..655 nm (real hue is constant beyond, and the fit's tails flip deep red to green);
// out-of-gamut negatives are clipped; brightness follows the true y-bar with a soft falloff.
vec3 spectral(float l){
  vec3 rgb = max(xyzToLinearSRGB(wavelengthToXYZ(clamp(l, 415.0, 655.0))), 0.0);
  rgb /= max(max(rgb.r, rgb.g), max(rgb.b, 1e-4));
  return rgb * mix(0.35, 1.0, pow(clamp(wavelengthToXYZ(l).y, 0.0, 1.0), 0.3));
}
// blackbody colour from Kelvin (Tanner Helland fit), linear sRGB
vec3 blackbody(float K){
  float t = K / 100.0;
  vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp(1.29293618606 * pow(max(t - 60.0, 0.01), -0.1332047592), 0.0, 1.0);
  c.g = t <= 66.0 ? clamp(0.39008157876 * log(t) - 0.63184144378, 0.0, 1.0)
                  : clamp(1.12989086089 * pow(max(t - 60.0, 0.01), -0.0755148492), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.54320678911 * log(max(t - 10.0, 0.01)) - 1.19625408914, 0.0, 1.0));
  return pow(c, vec3(2.2));
}
`;

export const particleVert = /* glsl */`
uniform float uTime, uProgress, uSize, uPixelRatio, uMouseR, uAttract, uMouseOn, uAlpha;
uniform float uModeFrom, uModeTo, uModeMix, uHeat, uChurn, uDisp;
uniform vec2 uBand;
uniform vec4 uFocus; // xyz: focused cluster centre (local), w: strength
uniform float uFocusR;
uniform vec3 uMouse;
uniform vec3 uShockPos[4];
uniform float uShockTime[4];
uniform float uShockStr[4];
uniform vec3 uColA, uColB, uColC;
attribute vec3 aTarget;
attribute vec4 aRnd;
varying vec3 vColor;
varying float vAlpha;
${NOISE}
${SPECTRAL}
float easeIO(float t){ return t < 0.5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t + 2.0, 3.0) / 2.0; }
// colour modes: 0 palette, 1 physical wavelength colour, 2 blackbody (temperature follows effort)
vec3 modeColor(float m, vec3 pal, float wl, float glow){
  if (m < 0.5) return pal;
  if (m < 1.5) return spectral(wl);
  float K = (1500.0 + uHeat * 9000.0) * (0.55 + aRnd.z * 0.9) + glow * 3000.0;
  return blackbody(K) * 0.8;
}
void main(){
  // every particle carries one wavelength; k is its dispersion sign (-1 violet .. +1 red)
  float wl = 380.0 + aRnd.z * 400.0;
  float k = (wl - 580.0) / 200.0;

  float t = clamp(uProgress * 1.5 - aRnd.x * 0.5, 0.0, 1.0);
  float e = easeIO(t);
  vec3 pos = mix(position, aTarget, e);
  float flight = sin(e * 3.14159265);

  // gentle idle drift (cheap); coherent simplex churn only while morphing or when effort asks for it
  vec3 q = pos * 0.35 + aRnd.xyz * 1.5;
  pos += vec3(sin(q.y * 1.3 + uTime * 0.9), sin(q.z * 1.1 + uTime * 1.1), sin(q.x * 1.7 + uTime * 0.7)) * 0.12;
  float amp = flight * 2.4 + uChurn;
  if (amp > 0.002) {
    vec3 np = pos * 0.22 + vec3(0.0, uTime * (0.08 + uChurn * 0.3), uTime * 0.05);
    vec3 n = vec3(snoise(np), snoise(np + vec3(31.4, 17.2, 9.1)), snoise(np + vec3(-11.7, 47.3, 23.9)));
    pos += n * amp + n.yzx * k * flight * 1.8 * uDisp;
  }

  // mouse: repel, or a gravity well while held
  vec3 d = pos - uMouse;
  float dist = length(d) + 1e-4;
  vec3 dir = d / dist;
  float infl = smoothstep(uMouseR, 0.0, dist) * uMouseOn;
  pos += dir * infl * 1.9 * (1.0 - uAttract) * (1.0 + k * 0.6 * uDisp);
  float well = smoothstep(uMouseR * 3.2, 0.0, dist) * uAttract * uMouseOn;
  vec3 swirl = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + 1e-4);
  pos -= d * well * 0.82;
  pos += swirl * well * (0.8 + aRnd.w * 1.4);
  float glow = infl * (1.0 - uAttract) * 0.9 + well * 0.4;
  // focus: the chosen cluster lights up while the others step back (family screen)
  float inF = smoothstep(uFocusR, uFocusR * 0.6, length(pos - uFocus.xyz));
  glow += inF * uFocus.w * 0.8;
  float focusDim = 1.0 - uFocus.w * 0.95 * (1.0 - inF);

  // shockwaves (wavelength-dependent push when dispersion is on)
  for (int i = 0; i < 4; i++) {
    float age = uTime - uShockTime[i];
    if (age > 0.0 && age < 2.6) {
      vec3 sd = pos - uShockPos[i];
      float sl = length(sd) + 1e-4;
      float w = exp(-pow(sl - age * 8.5 * uShockStr[i], 2.0) * 0.55) * (1.0 - age / 2.6);
      pos += (sd / sl) * w * 2.3 * uShockStr[i] * (1.0 + k * 0.5 * uDisp);
      glow += w * 1.6;
    }
  }

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  // depth cue around the group's own centre: the far half dims, the near half lifts slightly (flat shapes stay at 1.0)
  float dz = mv.z - (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  float front = clamp(1.0 + dz * 0.12, 0.3, 1.15);
  // band-pass filter: particles outside the chosen band fade out
  float band = smoothstep(uBand.y + 25.0, uBand.y, abs(wl - uBand.x));
  float size = uSize * (0.35 + aRnd.y * aRnd.y * 1.5) * (1.0 + glow * 0.7 + flight * 0.6) * mix(0.55, 1.0, band) * mix(0.75, 1.0, min(front, 1.0));
  gl_PointSize = min(size * uPixelRatio * (12.0 / -mv.z), 48.0);

  vec3 pal = mix(uColA, uColB, smoothstep(0.0, 0.7, aRnd.z));
  pal = mix(pal, uColC, smoothstep(0.78, 1.0, aRnd.z));
  vec3 c = modeColor(uModeTo, pal, wl, glow);
  if (uModeMix < 0.999) c = mix(modeColor(uModeFrom, pal, wl, glow), c, uModeMix);
  c += vec3(1.0, 0.85, 0.75) * glow * 0.5;
  float tw = 0.62 + 0.38 * sin(uTime * (1.0 + aRnd.w * 3.0) + aRnd.x * 40.0);
  vColor = c * tw;
  vAlpha = uAlpha * front * focusDim * (1.0 - well * 0.65) * (0.45 + 0.55 * aRnd.y) * clamp(1.0 - (-mv.z - 28.0) / 30.0, 0.0, 1.0) * mix(0.04, 1.0, band);
}
`;

export const particleFrag = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor, pow(1.0 - d * 2.0, 1.7) * vAlpha);
}
`;

// Neural core: a softly displaced inner sphere with a fresnel rim
export const coreVert = /* glsl */`
uniform float uTime, uPulse;
varying vec3 vNormal;
varying vec3 vView;
varying float vDisp;
${NOISE}
void main(){
  float disp = (snoise(normal * 1.6 + uTime * 0.35) + snoise(normal * 4.2 - uTime * 0.55) * 0.35) * 0.18 * (1.0 + uPulse * 1.5);
  vDisp = disp;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position + normal * disp, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const coreFrag = /* glsl */`
uniform vec3 uColA, uColB, uColC;
uniform float uPulse, uGain;
varying vec3 vNormal;
varying vec3 vView;
varying float vDisp;
void main(){
  float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.4);
  vec3 col = mix(uColA * 0.12, uColB * 0.6, smoothstep(-0.18, 0.28, vDisp));
  col += mix(uColB, uColC, 0.5) * fres * (0.8 + uPulse * 1.6);
  // hotter colours are whiter: hold overall brightness down so the core keeps its surface detail
  gl_FragColor = vec4(col * uGain, 1.0);
}
`;

// Neural edges: signal pulses travel along a share of edges; effort raises both the share and the speed
export const edgeVert = /* glsl */`
attribute float aT;
attribute float aSeed;
varying float vT;
varying float vSeed;
void main(){
  vT = aT; vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const edgeFrag = /* glsl */`
uniform float uTime, uFire, uEffort;
uniform vec3 uColA, uColC;
varying float vT;
varying float vSeed;
void main(){
  float isOn = step(fract(vSeed * 91.7), 0.3 + uEffort * 0.7);
  float head = fract(uTime * (0.25 + vSeed * 0.5) * (0.6 + uEffort * 2.4) + vSeed * 7.0);
  float tt = mix(vT, 1.0 - vT, step(0.5, fract(vSeed * 13.0)));
  float pulse = smoothstep(0.14, 0.0, abs(tt - head)) * isOn;
  float a = 0.05 + uEffort * 0.05 + pulse * (0.7 + uFire * 1.4) + uFire * 0.1;
  gl_FragColor = vec4(mix(uColA, uColC, pulse), a);
}
`;

// Lens finish: radial chromatic aberration (pulses on shockwaves) and a soft vignette
export const finishVert = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const finishFrag = /* glsl */`
uniform sampler2D tDiffuse;
uniform float uCA;
varying vec2 vUv;
void main(){
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec2 off = d * r2 * uCA;
  vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
  col *= 1.0 - smoothstep(0.18, 0.75, r2) * 0.45;
  gl_FragColor = vec4(col, 1.0);
}
`;
