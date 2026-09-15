'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'_site');
if(fs.existsSync(out))fs.rmSync(out,{recursive:true});fs.mkdirSync(out);
function copy(src){const target=path.join(out,src);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,src),target);}
for(const f of fs.readdirSync(root))if(/^[\w-]+\.(html|js|css|webmanifest)$/.test(f))copy(f);
function walk(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(!e.name.endsWith('questions.json')&&/\.(html|json|svg|png|jpg|jpeg|webp|woff2|css|js)$/.test(e.name))copy(p);}}
for(const dir of ['certifications','icons','assets'])if(fs.existsSync(path.join(root,dir)))walk(dir);
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log('Site built in _site with no question originals, tools, docs or backups');
