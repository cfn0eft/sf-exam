'use strict';
const vm=require('vm'),fs=require('fs'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {compile}=require('./build-question-bank');
const tick=()=>new Promise(r=>setImmediate(r));
const rows=Array.from({length:120},(_,i)=>({id:i+1,question:'架空の問題'.repeat(130),choices:['A','B'],answers:['A'],explanation:'架空の説明'}));
const bundle=compile(rows);
assert.ok(bundle.chunks.length>1);assert.ok(bundle.chunks.every(c=>Buffer.byteLength(c.json)<=240000));
assert.deepEqual(bundle.chunks.flatMap(c=>JSON.parse(c.json)),rows);
function setup(){
 let onAuth,onOwn,fail=false,corrupt=false,waiter=null,hashHook=null;let reads=0,hashes=0;const events=[];
 const auth={currentUser:null,onAuthStateChanged(cb){onAuth=cb;}};
 function ref(p){return {collection:s=>ref(p+'/'+s),doc:s=>ref(p+'/'+s),onSnapshot(o,cb){onOwn=cb;return ()=>{};},async get(options){
  assert.equal(options.source,'server');reads++;
  if(fail)throw Object.assign(new Error('denied'),{code:'permission-denied'});
  if(waiter)await waiter;
  return {exists:true,data:()=>p.split('/').length===2?bundle.manifest:{json:corrupt?'[]':bundle.chunks.find(c=>p.endsWith(c.id)).json}};
 }};}
 const win={dispatchEvent:e=>events.push(e.type),addEventListener(){}};
 const ctx={window:win,Event,Map,Set,Promise,crypto:{subtle:{async digest(...args){hashes++;if(hashHook)hashHook(hashes);return webcrypto.subtle.digest(...args);}}},TextEncoder,Uint8Array,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync('question-bank.js','utf8'),ctx);
 const bank=win.SFQ_BANK;bank.initialize(auth,{collection:s=>ref(s)});
 return {bank,events,reads:()=>reads,fail:()=>{fail=true},corrupt:()=>{corrupt=true},wait:p=>{waiter=p},onHash:f=>{hashHook=f},login(uid='user'){auth.currentUser={uid};onAuth(auth.currentUser);onOwn({exists:true,metadata:{fromCache:false,hasPendingWrites:false},data:()=>({access:'approved'})});},logout(){auth.currentUser=null;onAuth(null);},revoke(){onOwn({exists:true,metadata:{fromCache:false,hasPendingWrites:false},data:()=>({access:'blocked'})});}};
}
(async()=>{
 let t=setup(),authorized=0;await assert.rejects(t.bank.load('sf-admin',()=>authorized++),{code:'bank-auth-pending'});assert.equal(t.reads(),0);assert.equal(authorized,0);
 t.login();assert.equal((await t.bank.load('sf-admin',()=>authorized++)).length,rows.length);assert.equal(authorized,1);let read=t.reads();await t.bank.load('sf-admin');assert.equal(t.reads(),read);
 t.logout();await assert.rejects(t.bank.load('sf-admin'));t.login('other');await t.bank.load('sf-admin');assert.ok(t.reads()>read);
 t=setup();t.login();t.fail();authorized=0;await assert.rejects(t.bank.load('sf-admin',()=>authorized++),{code:'permission-denied'});assert.equal(authorized,0);
 t=setup();t.login();t.corrupt();await assert.rejects(t.bank.load('sf-admin'));
 t=setup();t.login();let release;const gate=new Promise(r=>release=r);t.wait(gate);const pending=t.bank.load('sf-admin');await tick();t.revoke();release();await assert.rejects(pending);
 t=setup();t.login();t.onHash(n=>{if(n===bundle.chunks.length+1)t.revoke();});await assert.rejects(t.bank.load('sf-admin'));
 console.log('Question delivery: split/reassembly, auth, cache isolation, denial, corruption and revocation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
