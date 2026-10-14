// 정적 호스팅(Vercel)용 빌드: 페이지가 쓰는 three.js 파일만 node_modules에서 public/vendor/three로 복사한다
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'node_modules', 'three');
const OUT = path.join(__dirname, '..', 'public', 'vendor', 'three');
// main.js의 import와 그 내부 의존(MaskPass·Pass·셰이더 3종)까지
const FILES = [
  'build/three.module.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/MaskPass.js',
  'examples/jsm/postprocessing/Pass.js',
  'examples/jsm/shaders/CopyShader.js',
  'examples/jsm/shaders/LuminosityHighPassShader.js',
  'examples/jsm/shaders/OutputShader.js',
];

fs.rmSync(OUT, { recursive: true, force: true });
for (const f of FILES) {
  const to = path.join(OUT, f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(SRC, f), to);
}
console.log(`vendor: three ${require(path.join(SRC, 'package.json')).version} → public/vendor/three (${FILES.length} files)`);
