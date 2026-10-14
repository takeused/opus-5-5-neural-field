// 20000번부터 빈 포트를 찾아 사이트와 three.js 벤더 파일을 서빙하는 의존성 0 정적 서버
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const VENDOR = path.join(__dirname, 'node_modules', 'three');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean.startsWith('/vendor/three/')) {
    return { base: VENDOR, file: path.join(VENDOR, clean.slice('/vendor/three/'.length)) };
  }
  return { base: ROOT, file: path.join(ROOT, clean === '/' ? 'index.html' : clean) };
}

const server = http.createServer((req, res) => {
  const { base, file } = resolve(req.url);
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

function listen(port) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE') { console.log(`port ${port} busy → ${port + 1}`); listen(port + 1); }
    else throw e;
  });
  server.listen(port, () => console.log(`OPUS 5.5 site → http://localhost:${port}`));
}
listen(Number(process.env.PORT) || 20000);
