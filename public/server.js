// server.js — sert le dossier /public sur http://localhost:5500
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const PORT = 5500;

const MIME = {
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.mjs':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml',
  '.ico':'image/x-icon',
  '.pdf':'application/pdf',
  '.txt':'text/plain; charset=utf-8',
};

http.createServer((req,res)=>{
  let urlPath = decodeURI(req.url.split('?')[0]);
  if (urlPath === '/' ) urlPath = '/reader.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.stat(filePath, (err, stat)=>{
    if (err) { res.writeHead(404); return res.end('Not found'); }
    if (stat.isDirectory()){
      const index = path.join(filePath, 'index.html');
      return fs.stat(index, (e2, st2)=>{
        if (!e2) return fs.createReadStream(index).pipe(res.writeHead(200, {'Content-Type': MIME['.html']}));
        res.writeHead(403); res.end('Directory listing disabled');
      });
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control':'no-cache'});
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(PORT, ()=> console.log(`Serveur prêt: http://localhost:${PORT}/reader.html`));

