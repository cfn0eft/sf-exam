'use strict';
// Loopback-only preview. Explicit allowlist prevents serving private files or Git history.
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..');
http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const rel=pathname==='/'?'index.html':pathname.replace(/^\//,'');
 if(rel.includes('..')||rel.includes('\\')||!(/^[\w-]+\.(html|js|css|webmanifest)$/.test(rel)||/^(icons|assets|certifications)\/[\w./-]+$/.test(rel))||rel.endsWith('questions.json')){res.writeHead(404);return res.end();}
 const file=path.join(root,rel);
 if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 const ext=path.extname(file);const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
 let body=fs.readFileSync(file);if(ext==='.html')body=Buffer.from(body.toString().replace('<head>','<head><script>window.SFQ_EMULATOR=true;</script>'));
 res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
}).listen(4328,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4328/ (requires Auth 9199 / Firestore 8189 emulators)'));
