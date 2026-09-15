'use strict';
const fs=require('fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc}=require('firebase/firestore');
const assert=require('node:assert/strict');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-sfq-bank',firestore:{host:'127.0.0.1',port:8189,rules:fs.readFileSync('firestore.rules','utf8')}});
 let checks=0;
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   for(const [uid,data] of Object.entries({approved:{access:'approved'},special:{access:'approved',specialistAccess:true},pending:{access:'pending'},blocked:{access:'blocked'},missing:{}}))await setDoc(doc(db,'progress',uid),data);
   for(const slug of ['sf-admin','agentforce']){
    await setDoc(doc(db,'questionBanks',slug),{activeVersion:'v-test'});
    for(const version of ['v-test','v-old'])await setDoc(doc(db,`questionBanks/${slug}/versions/${version}/chunks/part-000`),{json:'[]'});
   }
  });
  const dbFor=uid=>uid?env.authenticatedContext(uid,{email:uid+'@sfquiz.local'}).firestore():env.unauthenticatedContext().firestore();
  for(const uid of [null,'pending','blocked','missing','absent'])for(const slug of ['sf-admin','agentforce']){
   const db=dbFor(uid);await assertFails(getDoc(doc(db,'questionBanks',slug)));checks++;
   await assertFails(getDoc(doc(db,`questionBanks/${slug}/versions/v-test/chunks/part-000`)));checks++;
  }
  for(const uid of ['approved','special','zX5ZYus58QMrig8aD08t3uGsi4t2']){
   const db=dbFor(uid);await assertSucceeds(getDoc(doc(db,'questionBanks','sf-admin')));checks++;
   await assertSucceeds(getDoc(doc(db,'questionBanks/sf-admin/versions/v-test/chunks/part-000')));checks++;
  }
  await assertFails(getDoc(doc(dbFor('approved'),'questionBanks','agentforce')));checks++;
  await assertFails(getDoc(doc(dbFor('approved'),'questionBanks/agentforce/versions/v-test/chunks/part-000')));checks++;
  await assertSucceeds(getDoc(doc(dbFor('special'),'questionBanks/agentforce/versions/v-test/chunks/part-000')));checks++;
  await assertFails(getDoc(doc(dbFor('special'),'questionBanks/agentforce/versions/v-old/chunks/part-000')));checks++;
  for(const uid of ['approved','pending','blocked']){
   const db=dbFor(uid);
   await assertFails(updateDoc(doc(db,'progress',uid),{specialistAccess:true}));checks++;
   await assertFails(setDoc(doc(db,'questionBanks','sf-admin'),{activeVersion:'evil'}));checks++;
   await assertFails(setDoc(doc(db,'questionBanks/sf-admin/versions/v-test/chunks/part-000'),{json:'evil'}));checks++;
   await assertFails(deleteDoc(doc(db,'questionBanks','sf-admin')));checks++;
  }
  await assertFails(updateDoc(doc(dbFor('pending'),'progress','pending'),{access:'approved'}));checks++;
  await assertFails(updateDoc(doc(dbFor('blocked'),'progress','blocked'),{access:'pending'}));checks++;
  const admin=dbFor('zX5ZYus58QMrig8aD08t3uGsi4t2');
  await assertSucceeds(updateDoc(doc(admin,'progress','approved'),{access:'blocked'}));checks++;
  await assertFails(getDoc(doc(dbFor('approved'),'questionBanks/sf-admin/versions/v-test/chunks/part-000')));checks++;
  await assertSucceeds(updateDoc(doc(admin,'progress','special'),{specialistAccess:false}));checks++;
  await assertFails(getDoc(doc(dbFor('special'),'questionBanks/agentforce/versions/v-test/chunks/part-000')));checks++;
  await assertSucceeds(updateDoc(doc(admin,'questionBanks','sf-admin'),{activeVersion:'v-old'}));checks++;
  await assertSucceeds(getDoc(doc(admin,'questionBanks/sf-admin/versions/v-old/chunks/part-000')));checks++;
  assert.ok(checks>=45);console.log(`Firestore rules: ${checks} permission checks passed`);
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
