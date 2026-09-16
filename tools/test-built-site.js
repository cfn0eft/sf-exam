'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'_site');
const source={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'firebase-config.js'),'utf8'),source);
assert.ok(source.window.SFQ_FIREBASE_CONFIG?.apiKey && source.window.SFQ_FIREBASE_CONFIG?.projectId,'Firebase connection config must not be empty');
let configured=0;
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){walk(file);continue;}
    assert.notEqual(entry.name,'questions.json','Private question originals must not be published');
    if(!file.endsWith('.html'))continue;
    const html=fs.readFileSync(file,'utf8');
    assert.ok(!/<script\b[^>]*\bsrc=["'][^"']*firebase-config\.js/i.test(html),'Config must not need a separate request: '+file);
    const original=fs.readFileSync(path.join(root,path.relative(out,file)),'utf8');
    if(!original.includes('firebase-config.js'))continue;
    const match=html.match(/<script data-sfq-config>([\s\S]*?)<\/script>/);
    assert.ok(match,'Missing inline config: '+file);
    const actual={window:{}};vm.runInNewContext(match[1],actual);
    assert.equal(JSON.stringify(actual.window),JSON.stringify(source.window),'Config changed during build: '+file);
    assert.ok(html.indexOf('data-sfq-config')<html.indexOf('cloud-sync.js') || !html.includes('cloud-sync.js'),'Config must precede authentication');
    configured++;
  }
}
walk(out);assert.ok(configured>=9,'Gateway and all eight certifications must receive config');
console.log('Built site: inline config verified on '+configured+' pages; no private question originals');
