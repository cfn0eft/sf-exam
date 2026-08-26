let QDATA=[], CHDATA=[], NAVDATA=[], CRAMDATA=[], COMPDATA=[], LESSDATA=[];
let lesCur=null, lesIdx=0;
const CFG=(typeof window!=='undefined'&&window.CERT_CONFIG)||{};
const EXAM_N=CFG.examN||60, EXAM_MIN=CFG.examMin||105, PASS=CFG.pass||65, SKEY=CFG.storageKey||'sfq_default';
const DATA_DIR=CFG.dataDir||'data/';
let DOMAIN_DEFS=[];
let QDOMAIN={};
let DOMAIN_BY={};
function domainOf(id){return QDOMAIN[id]||(DOMAIN_DEFS[0]?DOMAIN_DEFS[0].code:'');}
function domainDef(code){return DOMAIN_BY[code]||DOMAIN_BY[(DOMAIN_DEFS[0]||{}).code]||(DOMAIN_DEFS[0]||{code:'',name:'',weight:1,emoji:''});}
const DIFF_LABEL={1:'易',2:'標準',3:'難'};
let fDiffSet={1:false,2:false,3:false};
function qDiff(q){
  if(!q)return 2;
  var d=q.diff;
  if(d===1||d===2||d===3)return d;
  if(typeof d==='string'){var m={'1':1,'2':2,'3':3,easy:1,'易':1,normal:2,'標準':2,std:2,hard:3,'難':3}[d];if(m)return m;}
  var h=store.hist[q.id];if(h){var t=(h.c||0)+(h.w||0);if(t>=2){var p=h.c/t;if(p>=0.8)return 1;if(p<0.5)return 3;return 2;}}
  return 2;
}
function qDiffData(q){var d=q&&q.diff;return d===1||d===2||d===3||(typeof d==='string'&&/^(1|2|3|easy|易|normal|標準|std|hard|難)$/.test(d));}
function diffPillHTML(q){var d=qDiff(q);return ' <span class="dpill d'+d+'"'+(qDiffData(q)?'':' title="推定（データ未設定）"')+'>'+DIFF_LABEL[d]+(qDiffData(q)?'':'?')+'</span>';}
function fDiffActive(){return fDiffSet[1]||fDiffSet[2]||fDiffSet[3];}
function toggleDiffFilter(n){fDiffSet[n]=!fDiffSet[n];try{applyFilters();}catch(e){}}
let sDisp=[], eDispArr=[], sLowConf=false;
function cshufOn(){return localStorage.getItem('sfq_cshuf')!=='0';}
const REPO_URL=(CFG.repoUrl)||'https://github.com/cfn0eft/sf-exam';
let dcActive=false;

let allQ=[], filtQ=[];
let certName=CFG.certName||'';
let store=loadStore();
let sQueue=[],sCur=0,sOk=0,sNg=0,sSel=[],sRevealed=false,sLastWrong=[],sQStart=0;
let sHint=0,loopMode=false,loopStreak={},loopTotal=0;
let eQ=[],eCur=0,eAns={},eTimer=null,eSecs=0,eWrongOnly=false,eFlag={},eQTime={};
let eN=EXAM_N,eTimed=true,eBudget=EXAM_MIN*60;
let fBm=false,fShuf=true,fMulti=false,fKw='',fWrong=false;
const SRC_KEYS=['tyson','gen','jpnshiken'];
const SRC_LABEL={tyson:'タイソン',gen:'生成',jpnshiken:'jpnshiken'};
let srcSel=(function(){try{const v=localStorage.getItem('sfq_src');if(!v||v==='all')return new Set();return new Set(v.split(',').filter(s=>SRC_KEYS.includes(s)));}catch(e){return new Set();}})();
function saveSrcSel(){try{localStorage.setItem('sfq_src',srcSel.size?Array.from(srcSel).join(','):'all');}catch(e){}}
function inScope(q){return srcSel.size===0||(q&&srcSel.has(q.source));}
function scopedQ(){return allQ.filter(inScope);}
let vQueue=[],vCur=0,vFilter='all',vFlipped=false;
let qkQueue=[],qkCur=0,qkMode='all',qkRevealed=false;
const EXAM_SAVE_KEY=SKEY+'_examstate';
const EXAM_RECENT_KEY=SKEY+'_recentexam';
function recentExamIds(){try{const a=JSON.parse(localStorage.getItem(EXAM_RECENT_KEY)||'[]');return new Set([].concat.apply([],Array.isArray(a)?a:[]));}catch(e){return new Set();}}
function pushRecentExam(ids){try{let a=JSON.parse(localStorage.getItem(EXAM_RECENT_KEY)||'[]');if(!Array.isArray(a))a=[];a.push(ids||[]);localStorage.setItem(EXAM_RECENT_KEY,JSON.stringify(a.slice(-2)));}catch(e){}}
function freshFirst(list){const rec=recentExamIds();if(!rec.size)return shuffle(list);const a=[],b=[];shuffle(list).forEach(q=>(rec.has(q.id)?b:a).push(q));return a.concat(b);}

function loadStore(){
  try{const r=localStorage.getItem(SKEY);if(r)return JSON.parse(r);}catch(e){}
  return{bm:[],hist:{},streak:0,vm:{},tbm:{},srs:{},daily:{},notes:{},examDate:'',goal:0,exams:[],badges:{},dc:{},acquiredDate:'',acqLock:0,time:{tot:0,dom:{},hour:{}},sum:{},xp:0,missions:{wk:'',claimed:{}},rdz:[],lessons:{}};
}
function save(){try{localStorage.setItem(SKEY,JSON.stringify(store));}catch(e){} if(window.__cloudSave)window.__cloudSave();}
window.__getStore=function(){return store;};
window.__setStore=function(o){ if(!o||typeof o!=='object')return; store=o; if(!store.bm)store.bm=[]; if(!store.hist)store.hist={}; if(!store.vm)store.vm={}; if(!store.tbm)store.tbm={}; if(!store.srs)store.srs={}; if(!store.daily)store.daily={}; if(store.streak==null)store.streak=0; if(!store.notes)store.notes={}; if(!store.exams)store.exams=[]; if(!store.badges)store.badges={}; if(!store.dc||typeof store.dc!=='object')store.dc={}; if(store.examDate==null)store.examDate=''; if(store.goal==null)store.goal=0; if(store.acquiredDate==null)store.acquiredDate=''; if(store.acqLock==null)store.acqLock=0; if(!store.time||typeof store.time!=='object')store.time={tot:0,dom:{},hour:{}}; if(typeof store.time.tot!=='number')store.time.tot=0; if(!store.time.dom)store.time.dom={}; if(!store.time.hour)store.time.hour={}; if(!store.sum||typeof store.sum!=='object')store.sum={}; if(typeof store.xp!=='number')store.xp=0; if(!store.missions||typeof store.missions!=='object')store.missions={wk:'',claimed:{}}; if(!store.missions.claimed)store.missions.claimed={}; if(!Array.isArray(store.rdz))store.rdz=[]; if(!store.lessons||typeof store.lessons!=='object')store.lessons={}; try{localStorage.setItem(SKEY,JSON.stringify(store));}catch(e){} };
window.__refreshUI=function(){ try{buildKwFilter();}catch(e){} try{applyFilters();}catch(e){} try{homeStats();}catch(e){} try{renderTextbook();}catch(e){} try{renderNavMap();}catch(e){} try{renderChapNav();}catch(e){} };
function getH(id){return store.hist[id]||{c:0,w:0};}
function recH(id,ok,low,opts){
  if(!store.hist[id])store.hist[id]={c:0,w:0};
  if(ok){store.hist[id].c++;store.streak=(store.streak||0)+1;}
  else{store.hist[id].w++;store.streak=0;}
  store.hist[id].last=ok?'c':'w';
  store.hist[id].lc=low?1:0;
  srsUpdate(id,ok,low);
  bumpDaily();
  store.xp=(store.xp||0)+(ok?(low?6:10):3);
  try{snapReadiness();}catch(e){}
  if(opts&&opts.defer)return;
  save();
  if(typeof checkBadges==='function')checkBadges();
  try{maybeGoalCheer();}catch(e){}
  try{checkMissions();}catch(e){}
}
function recStudyTime(domain,ok,sec){
  if(!store.time||typeof store.time!=='object')store.time={tot:0,dom:{},hour:{}};
  if(!store.time.dom)store.time.dom={};if(!store.time.hour)store.time.hour={};
  sec=Math.max(0,Math.min(300,sec||0));
  store.time.tot=(store.time.tot||0)+sec;
  if(domain){const d=store.time.dom[domain]||(store.time.dom[domain]={sec:0,n:0});d.sec+=sec;d.n++;}
  const h=new Date().getHours();
  const hb=store.time.hour[h]||(store.time.hour[h]={c:0,w:0,sec:0});
  hb.sec+=sec;if(ok)hb.c++;else hb.w++;
}
function isWrong(id){const h=store.hist[id];if(!h)return false;if(h.last)return h.last==='w';return h.w>0;}
function isUnseen(id){const h=store.hist[id];return !h||(h.c+h.w)===0;}
function needsReview(id){const h=store.hist[id];if(!h)return false;if(isWrong(id))return true;return h.last==='c'&&h.lc===1;}
function isLowConfCorrect(id){const h=store.hist[id];return !!(h&&h.last==='c'&&h.lc===1);}
function isBm(id){return store.bm.includes(id);}
function togBm(id){const i=store.bm.indexOf(id);if(i>=0)store.bm.splice(i,1);else store.bm.push(id);save();}
function exportBookmarksCsv(){
  const qs=(store.bm||[]).map(function(id){return allQ.find(function(q){return q.id===id;});}).filter(Boolean);
  if(!qs.length){toast('ブックマークした問題がありません');return;}
  const esc=function(x){var v=String(x==null?'':x);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const lines=[['ID','問題','選択肢','答え'].join(',')];
  qs.forEach(function(q){
    lines.push([
      'Q'+q.id,
      q.question,
      (q.choices||[]).join('\n'),
      (q.answers||[]).join(' / ')
    ].map(esc).join(','));
  });
  const blob=new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const slug=(certName||SKEY||'quiz').replace(/[^\w\-]+/g,'_');
  const a=document.createElement('a');
  a.href=url;a.download='sfquiz_bookmarks_'+slug+'_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
  toast('★ '+qs.length+'問をCSVで書き出しました');
}
function getVM(k){return store.vm[k]||0;}
function setVM(k,v){store.vm[k]=v;save();}

function buildDomainIndex(){DOMAIN_BY={};(DOMAIN_DEFS||[]).forEach(d=>{DOMAIN_BY[d.code]=d;});}
async function loadCertData(){
  async function gj(f){try{const r=await fetch(DATA_DIR+f,{cache:'no-cache'});if(!r.ok)return null;return await r.json();}catch(e){return null;}}
  const dom=await gj('domains.json');
  if(dom){ if(Array.isArray(dom)){DOMAIN_DEFS=dom;} else {DOMAIN_DEFS=dom.domains||[]; if(dom.map)QDOMAIN=Object.assign({},dom.map);} }
  if((!DOMAIN_DEFS||!DOMAIN_DEFS.length)&&Array.isArray(CFG.domains))DOMAIN_DEFS=CFG.domains;
  buildDomainIndex();
  const qs=await gj('questions.json');
  QDATA=Array.isArray(qs)?qs.filter(q=>q&&q.question&&q.choices&&q.answers):[];
  QDATA.forEach(q=>{
    if(q.multi==null)q.multi=Array.isArray(q.answers)&&q.answers.length>1;
    if(!q.domain&&QDOMAIN[q.id])q.domain=QDOMAIN[q.id];
    if(q.domain&&QDOMAIN[q.id]==null)QDOMAIN[q.id]=q.domain;
  });
  CHDATA=(await gj('vocab.json'))||[];
  NAVDATA=(await gj('navmap.json'))||[];
  CRAMDATA=(await gj('cram.json'))||[];
  COMPDATA=(await gj('compare.json'))||[];
  LESSDATA=(await gj('lessons.json'))||[];
  allQ=[...QDATA];filtQ=[...allQ];
  if(srcSel.size)srcSel=new Set(Array.from(srcSel).filter(s=>allQ.some(q=>q&&q.source===s)));
}
function applyCertText(){
  if(CFG.certName)certName=CFG.certName;
  const termCount=CHDATA.reduce((n,c)=>n+((c.terms&&c.terms.length)||0),0);
  const setTxt=(id,t)=>{const el=document.getElementById(id);if(el)el.textContent=t;};
  setTxt('cert-name',certName);
  const sub=[CFG.examCode,QDATA.length+'問',termCount?termCount+'用語':'','合格ライン'+PASS+'%'].filter(Boolean).join(' ・ ');
  setTxt('cert-sub',sub);
  if(CFG.shortName)setTxt('topbar-title',CFG.shortName);
  if(CFG.certName)document.title=(CFG.shortName||CFG.certName)+' 学習アプリ';
  const eb=document.querySelector('#pg-home .btn-exam .bsub');if(eb)eb.textContent=EXAM_N+'問・'+EXAM_MIN+'分・合格ライン'+PASS+'%';
}
document.addEventListener('DOMContentLoaded',async ()=>{
  try{await loadCertData();}catch(e){console.error('cert data load failed',e);}
  applyCertText();
  try{buildKwFilter();}catch(e){}
  try{restoreFilters();}catch(e){}
  try{applyFilters();}catch(e){}
  try{homeStats();}catch(e){}
  try{renderTextbook();}catch(e){}
  try{renderNavMap();}catch(e){}
  try{renderChapNav();}catch(e){}
  try{renderCram();}catch(e){}
  if(typeof updateSrsBtn==='function')updateSrsBtn();
  if(localStorage.getItem('dark')==='1')applyDark(true);
  try{applyFontSize(localStorage.getItem('sfq_fontsize')||'normal');}catch(e){}
  try{renderOnlineState();}catch(e){}
  try{maybeOnboard();}catch(e){}
  document.addEventListener('keydown',handleKey);
  try{var _hv=(location.hash||'').replace('#','');if(['cram','textbook','vocab','stats'].indexOf(_hv)>=0)goTo(_hv);}catch(e){}
  try{handleLaunchShortcut();}catch(e){}
});

function handleLaunchShortcut(){
  var go=null;
  try{go=new URLSearchParams(location.search).get('go');}catch(e){}
  if(!go)return;
  try{history.replaceState(null,'',location.pathname+location.hash);}catch(e){}
  if(go==='daily')startDaily();
  else if(go==='exam')startExam();
}

function handleKey(e){
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const tag=(e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select')return;
  if(e.key==='?'){toggleShortcutHelp();e.preventDefault();return;}
  if(e.key==='Escape'){
    const _nb=document.getElementById('nb-ov');if(_nb&&_nb.classList.contains('show')){closeNotebook();e.preventDefault();return;}
    const _cs=document.getElementById('cs-ov');if(_cs&&_cs.classList.contains('show')){closeCases();e.preventDefault();return;}
    const _gd=document.getElementById('guide-ov');if(_gd&&_gd.classList.contains('show')){closeGuide();e.preventDefault();return;}
    const _f=document.getElementById('fig-lb');if(_f&&_f.classList.contains('show')){closeFig();e.preventDefault();return;}
    const _n=document.getElementById('news-modal');if(_n&&_n.classList.contains('on')){closeNews();e.preventDefault();return;}
    const _fb=document.getElementById('fb-modal');if(_fb&&_fb.classList.contains('on')){closeFeedback();e.preventDefault();return;}
    const _h=document.getElementById('sc-help');if(_h&&_h.classList.contains('on')){toggleShortcutHelp(false);e.preventDefault();return;}
  }
  const studyActive=document.getElementById('pg-study').classList.contains('active');
  const examActive=document.getElementById('pg-exam').classList.contains('active');
  if(studyActive){
    if(document.getElementById('s-card').style.display==='none')return;
    const q=sQueue[sCur];if(!q)return;
    const isM=q.answers.length>1;
    if(/^[1-9]$/.test(e.key)){
      const oi=sDisp[parseInt(e.key,10)-1];
      if(oi!=null&&!sRevealed){selChoice(oi,isM);e.preventDefault();}
    }else if(e.key==='0'){
      if(!sRevealed){toggleConf();e.preventDefault();}
    }else if(e.key==='Enter'){
      e.preventDefault();
      if(!sRevealed){if(sSel.length===q.answers.length)checkAnswer();}
      else nextSQ();
    }else if(e.key==='h'||e.key==='H'){
      if(!sRevealed){showHint();e.preventDefault();}
    }
  }else if(examActive){
    if(document.getElementById('e-area').style.display==='none')return;
    const q=eQ[eCur];if(!q)return;
    const isM=q.answers.length>1;
    if(/^[1-9]$/.test(e.key)){
      const oi=(eDispArr[eCur]||[])[parseInt(e.key,10)-1];
      if(oi!=null){selEChoice(oi,isM);e.preventDefault();}
    }else if(e.key==='ArrowRight'||e.key==='Enter'){
      if(eCur<eN-1){eNav(1);e.preventDefault();}
    }else if(e.key==='ArrowLeft'){
      if(eCur>0){eNav(-1);e.preventDefault();}
    }else if(e.key==='f'||e.key==='F'){
      toggleEFlag();e.preventDefault();
    }
  }
}

function buildKwFilter(){
  const c={};
  allQ.forEach(q=>(q.keywords||[]).forEach(k=>c[k]=(c[k]||0)+1));
  const sorted=Object.entries(c).sort((a,b)=>b[1]-a[1]);
  const sel=document.getElementById('f-kw');
  const prev=sel?sel.value:'';
  sel.innerHTML='<option value="">🏷️ キーワードで絞り込み（全て）</option>';
  sorted.forEach(([k,n])=>{
    const o=document.createElement('option');o.value=k;o.textContent=k+'（'+n+'問）';sel.appendChild(o);
  });
  if(prev&&Array.prototype.some.call(sel.options,o=>o.value===prev))sel.value=prev;
}
function filtersKey(){return SKEY+'_filters';}
function saveFilters(){
  try{
    const chk=id=>{const e=document.getElementById(id);return e?!!e.checked:false;};
    const kwEl=document.getElementById('f-kw');
    const st={nw:chk('f-new'),wr:chk('f-wrong'),lc:chk('f-lc'),bm:chk('f-bm'),mu:chk('f-multi'),sh:chk('f-shuf'),
      kw:kwEl?(kwEl.value||''):'',d:{1:!!fDiffSet[1],2:!!fDiffSet[2],3:!!fDiffSet[3]}};
    localStorage.setItem(filtersKey(),JSON.stringify(st));
  }catch(e){}
}
function restoreFilters(){
  try{
    const raw=localStorage.getItem(filtersKey());if(!raw)return;
    const st=JSON.parse(raw);if(!st||typeof st!=='object')return;
    const setChk=(id,v)=>{const e=document.getElementById(id);if(e&&typeof v==='boolean')e.checked=v;};
    setChk('f-new',st.nw);setChk('f-wrong',st.wr);setChk('f-lc',st.lc);setChk('f-bm',st.bm);setChk('f-multi',st.mu);setChk('f-shuf',st.sh);
    if(st.d)fDiffSet={1:!!st.d[1],2:!!st.d[2],3:!!st.d[3]};
    const kwEl=document.getElementById('f-kw');
    if(kwEl&&st.kw&&Array.prototype.some.call(kwEl.options,o=>o.value===st.kw))kwEl.value=st.kw;
  }catch(e){}
}

function applyFilters(){
  fWrong=document.getElementById('f-wrong').checked;
  fBm=document.getElementById('f-bm').checked;
  fShuf=document.getElementById('f-shuf').checked;
  fMulti=document.getElementById('f-multi').checked;
  fKw=document.getElementById('f-kw').value;
  const fLc=document.getElementById('f-lc').checked;
  const fNew=document.getElementById('f-new').checked;
  const _ft=document.getElementById('f-text');const fText=_ft?(_ft.value||'').trim().toLowerCase():'';
  document.getElementById('chip-new').classList.toggle('on',fNew);
  document.getElementById('chip-wrong').classList.toggle('on',fWrong);
  document.getElementById('chip-lc').classList.toggle('on',fLc);
  document.getElementById('chip-bm').classList.toggle('on',fBm);
  document.getElementById('chip-bm').classList.toggle('bm-on',fBm);
  document.getElementById('chip-shuf').classList.toggle('on',fShuf);
  document.getElementById('chip-multi').classList.toggle('on',fMulti);
  syncCShufChip();
  syncSrcChips();
  [1,2,3].forEach(function(n){var c=document.getElementById('chip-d'+n);if(c)c.classList.toggle('on',fDiffSet[n]);});
  const scoped=scopedQ();
  filtQ=scoped.filter(q=>{
    if(fNew&&!isUnseen(q.id))return false;
    if(fWrong&&!isWrong(q.id))return false;
    if(fLc&&!isLowConfCorrect(q.id))return false;
    if(fBm&&!isBm(q.id))return false;
    if(fMulti&&q.answers.length<2)return false;
    if(fDiffActive()&&!fDiffSet[qDiff(q)])return false;
    if(fKw&&!(q.keywords||[]).includes(fKw))return false;
    if(fText){
      const hay=(q.question+' '+(q.choices||[]).join(' ')+' '+(q.explanation||'')+' '+(q.keywords||[]).join(' ')+' q'+q.id).toLowerCase();
      if(!hay.includes(fText))return false;
    }
    return true;
  });
  const nc=scoped.filter(q=>isUnseen(q.id)).length;
  const ncEl=document.getElementById('new-count');
  if(ncEl)ncEl.textContent=nc?' '+nc:'';
  const wc=scoped.filter(q=>isWrong(q.id)).length;
  const wcEl=document.getElementById('wrong-count');
  if(wcEl)wcEl.textContent=wc?' '+wc:'';
  const nwEl=document.getElementById('next-wrong');
  if(nwEl)nwEl.textContent=wc;
  const lc=scoped.filter(q=>isLowConfCorrect(q.id)).length;
  const lcEl=document.getElementById('lc-count');
  if(lcEl)lcEl.textContent=lc?' '+lc:'';
  [1,2,3].forEach(function(n){var el=document.getElementById('d'+n+'-count');if(el){var cc=scoped.filter(function(q){return qDiff(q)===n;}).length;el.textContent=cc?' '+cc:'';}});
  const el=document.getElementById('f-count');
  if(el)el.textContent='対象: '+filtQ.length+' 問';
  saveFilters();
}
function setSrcFilter(v){
  if(v==='all'){srcSel=new Set();}
  else if(SRC_KEYS.includes(v)){if(srcSel.has(v))srcSel.delete(v);else srcSel.add(v);}
  saveSrcSel();
  syncSrcChips();
  try{applyFilters();}catch(e){}
  try{updateSrsBtn();}catch(e){}
  try{homeStats();}catch(e){}
}
function syncSrcChips(){
  const c0=document.getElementById('chip-src-all');
  if(c0)c0.classList.toggle('on',srcSel.size===0);
  SRC_KEYS.forEach(s=>{
    const c=document.getElementById('chip-src-'+s);
    if(c)c.classList.toggle('on',srcSel.has(s));
  });
  const setBadge=(id,n)=>{const el=document.getElementById(id);if(el)el.textContent=n?' '+n:'';};
  setBadge('src-all-count',allQ.length);
  SRC_KEYS.forEach(s=>setBadge('src-'+s+'-count',allQ.filter(q=>q.source===s).length));
}
function syncCShufChip(){const c=document.getElementById('chip-cshuf');if(c)c.classList.toggle('on',cshufOn());}
function toggleCShuf(){localStorage.setItem('sfq_cshuf',cshufOn()?'0':'1');syncCShufChip();toast(cshufOn()?'🔀 選択肢順をシャッフル':'選択肢順を固定');}

function homeStats(){
  const ans=Object.keys(store.hist).filter(id=>{const h=store.hist[id];return h.c+h.w>0;});
  const tc=ans.reduce((s,id)=>s+store.hist[id].c,0);
  const tt=ans.reduce((s,id)=>s+store.hist[id].c+store.hist[id].w,0);
  setText('st-done',ans.length);
  setText('st-acc',tt>0?Math.round(tc/tt*100)+'%':'—');
  const mastered=Object.values(store.vm||{}).filter(v=>v>=2).length;
  setText('st-vocab',mastered);
  updateSrsBtn();
  try{
    const ds=domainStats().filter(d=>d.t>0).sort((a,b)=>a.pct-b.pct);
    const weak=ds.slice(0,3).map(d=>d.code);
    const pool=weak.length?scopedQ().filter(q=>weak.includes(domainOf(q.id))).length:0;
    const nwk=document.getElementById('next-weak');
    if(nwk)nwk.textContent=pool||'';
    const nlc=document.getElementById('next-leech');if(nlc){const lc=leechList().length;nlc.textContent=lc||'';}
  }catch(e){}
  try{renderStreakBanner();}catch(e){}
  try{renderHomeAcq();}catch(e){}
  try{renderHomeProgress();}catch(e){}
  try{renderDaily();}catch(e){}
  try{renderResumeBanner();}catch(e){}
  try{renderNews();}catch(e){}
  try{renderGame();}catch(e){}
  try{revealLessonEntry();}catch(e){}
  renderPlan();
}

function goTo(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const page=document.getElementById('pg-'+name);
  if(!page){console.warn('page not found: pg-'+name);return;}
  page.classList.add('active');
  const nb=document.getElementById('nb-'+name);if(nb)nb.classList.add('active');
  const isHome=name==='home';
  document.getElementById('btn-back').style.display=isHome?'none':'flex';
  if(isHome){homeStats();applyFilters();}
  if(name==='stats')renderStats();
  if(name==='vocab')initVocab();
  if(name==='cram')renderCram();
  if(name==='lessons')renderLessonList();
  if(name==='mypage')renderMypage();
  if(name==='textbook'){
    document.getElementById('td-view').classList.remove('on');
    document.getElementById('tb-list').style.display='';
  }
  window.scrollTo(0,0);
}
function goBack(){
  if(eTimer){if(!confirm('試験を中断しますか？（あとでホームから再開できます）'))return;clearInterval(eTimer);eTimer=null;saveExamState();}
  goTo('home');
}

function setBmBtn(btn,on){
  if(!btn)return;
  btn.textContent=on?'★':'☆';
  btn.className='bmbtn'+(on?' on':'');
  btn.setAttribute('aria-pressed',on?'true':'false');
}

function applyDark(on){
  document.documentElement.setAttribute('data-theme',on?'dark':'');
  const b=document.getElementById('btn-dark');
  if(b){b.textContent=on?'☀️':'🌙';b.setAttribute('aria-pressed',on?'true':'false');}
}
function toggleDark(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  applyDark(!isDark);
  localStorage.setItem('dark',isDark?'0':'1');
}

function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}

function mdInline(s){
  if(!s)return'';
  return s
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,function(_,txt,url){
      if(/^term:/.test(url)) return '<a href="#" class="tbk-xref" onclick="gotoTerm(decodeURIComponent(\''+encodeURIComponent(url.slice(5))+'\'));return false;">'+txt+'</a>';
      return '<a href="'+url+'" target="_blank">'+txt+'</a>';
    });
}
function mdBlock(text){
  if(!text)return'';
  const lines=text.split('\n');
  let out='',inList=false;
  lines.forEach(raw=>{
    const line=raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const li=raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if(/^- /.test(raw)){
      if(!inList){out+='<ul style="padding-left:18px;margin-bottom:6px">';inList=true;}
      out+='<li style="margin-bottom:3px;font-size:13px">'+mdInline(raw.slice(2))+'</li>';
    } else {
      if(inList){out+='</ul>';inList=false;}
      if(!raw.trim()){out+='';return;}
      out+='<p style="margin-bottom:6px;font-size:13px;line-height:1.7">'+mdInline(raw)+'</p>';
    }
  });
  if(inList)out+='</ul>';
  return out;
}

function shuffle(a){const r=[...a];for(let i=r.length-1;i>0;i--){const j=0|Math.random()*(i+1);[r[i],r[j]]=[r[j],r[i]];}return r;}
function arrEq(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function setText(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}

let tbTab='guide';
function switchTbTab(t){
  tbTab=t;
  const ids=['guide','nav','cmp','figs'];
  ids.forEach(k=>{
    const pane=document.getElementById('tb-'+k); if(pane)pane.style.display=(t===k?'':'none');
    const btn=document.getElementById('tt-'+k); if(btn)btn.classList.toggle('on',t===k);
  });
  if(t==='cmp')renderCompare();
  if(t==='figs')renderFigGallery();
  const guideUI=(t==='guide'||t==='nav');
  const chNav=document.getElementById('ch-nav'); if(chNav)chNav.style.display=guideUI?'':'none';
  const sw=document.querySelector('#pg-textbook .search-wrap'); if(sw)sw.style.display=guideUI?'':'none';
  if(!guideUI){const mf=document.getElementById('tb-mark-filter'); if(mf)mf.style.display='none';}
}
function renderFigGallery(){
  const el=document.getElementById('tb-figs'); if(!el)return;
  const pre=(CFG.slug||'')+'/';
  const seen={},items=[];
  Object.keys(FIGS).forEach(k=>{
    if(k.indexOf(pre)!==0)return;
    const svg=FIGS[k]; if(!svg||seen[svg])return; seen[svg]=1;
    const name=k.slice(pre.length);
    const m=svg.match(/aria-label="([^"]*)"/);
    items.push({name:name,cap:(m&&m[1])?m[1]:name});
  });
  if(!items.length){el.innerHTML='<div class="cram-empty">🖼️ この資格の図解は準備中です。</div>';return;}
  items.sort((a,b)=>a.cap.localeCompare(b.cap,'ja'));
  let h='<div class="fig-gallery-note">この資格で使われている図解 '+items.length+' 点。タップで拡大できます。</div><div class="fig-gallery">';
  items.forEach(it=>{h+='<div class="fig-gcard">'+figHTML(it.name,it.cap)+'</div>';});
  el.innerHTML=h+'</div>';
}
function bindChHead(head,wrap,hit){
  const t=hit||head;
  t.setAttribute('role','button');
  t.setAttribute('tabindex','0');
  t.setAttribute('aria-expanded',wrap.classList.contains('open')?'true':'false');
  const toggle=()=>{ t.setAttribute('aria-expanded',wrap.classList.toggle('open')?'true':'false'); };
  head.addEventListener('click',toggle);
  t.addEventListener('keydown',(e)=>{
    if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){e.preventDefault();e.stopPropagation();toggle();}
  });
}
function syncChExpanded(wrap){
  if(!wrap)return;
  const t=wrap.querySelector('[role="button"]');
  if(t)t.setAttribute('aria-expanded',wrap.classList.contains('open')?'true':'false');
}

function renderCompare(){
  const el=document.getElementById('tb-cmp'); if(!el)return;
  if(!COMPDATA||!COMPDATA.length){el.innerHTML='<div class="cram-empty">📊 この資格の比較表は準備中です。</div>';return;}
  el.innerHTML='';

  const navWrap=document.createElement('div');
  navWrap.className='filter-bar';
  navWrap.style.margin='0 0 12px';
  COMPDATA.forEach((s,i)=>{
    const def=DOMAIN_BY[s.domain]||null;
    const emo=(def&&def.emoji)||'•';
    const btn=document.createElement('button');
    btn.className='chip';
    btn.innerHTML=emo+' '+escH(s.title);
    btn.addEventListener('click',()=>{
      const target=document.getElementById('cmp-sec-'+i);
      if(!target)return;
      target.classList.add('open');syncChExpanded(target);
      target.scrollIntoView({behavior:'smooth',block:'start'});
    });
    navWrap.appendChild(btn);
  });
  el.appendChild(navWrap);

  COMPDATA.forEach((sec,i)=>{
    if(!sec||!sec.content)return;
    const def=DOMAIN_BY[sec.domain]||null;
    const badge=(def&&def.name)?'<span class="dom-tag" style="font-size:11px;color:var(--text-sub);margin-left:6px">'+def.emoji+' '+escH(def.name)+'</span>':'';

    const wrap=document.createElement('div');
    wrap.className='ch-item';wrap.id='cmp-sec-'+i;
    const head=document.createElement('div');head.className='ch-head';
    head.innerHTML=
      '<div class="ch-head-left"><span>'+escH(sec.title)+'</span>'+badge+'</div>'+
      '<div class="ch-head-right"><span class="ch-arrow">›</span></div>';
    bindChHead(head,wrap);
    const bodyEl=document.createElement('div');bodyEl.className='ch-body';
    bodyEl.innerHTML='<div class="cram-sec" style="margin:0;padding:12px 14px">'+cramMd(sec.content)+'</div>';
    wrap.appendChild(head);wrap.appendChild(bodyEl);el.appendChild(wrap);
  });
}

function getTBM(k){return store.tbm[k]||0;}
function setTBM(k,v){store.tbm[k]=v;save();}
function cycleTBM(k){setTBM(k,(getTBM(k)+1)%3);}
const MARK_ICON=[' ','🔖','✓'];
const MARK_CLASS=['','bm','done'];

let currentTbChap=-1;
let markFilter='all';

function renderChapNav(){
  const el=document.getElementById('ch-nav');if(!el)return;
  el.innerHTML='';
  CHDATA.forEach((ch,ci)=>{
    const btn=document.createElement('button');
    btn.className='ch-pill';
    btn.id='cp-'+ci;
    const total=ch.terms.length;
    const done=ch.terms.filter(t=>getTBM(t.title||t.jaName)===2).length;
    const bm=ch.terms.filter(t=>getTBM(t.title||t.jaName)===1).length;
    const prog=done>0?(' '+done+'/'+total):'';
    btn.innerHTML=escH(ch.chapter.replace(/^第\d+章[:：]\s*/,'')).slice(0,10)+'<span class="pill-prog">'+prog+'</span>';
    btn.title=ch.chapter;
    btn.onclick=()=>scrollToChap(ci);
    el.appendChild(btn);
  });
}

function scrollToChap(ci){
  const el=document.getElementById('ch-item-'+ci);
  if(!el)return;
  if(!el.classList.contains('open'))el.classList.add('open');
  el.scrollIntoView({behavior:'smooth',block:'start'});
  document.querySelectorAll('.ch-pill').forEach(p=>p.classList.remove('active'));
  const pill=document.getElementById('cp-'+ci);
  if(pill){pill.classList.add('active');pill.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});}
}

function setMarkFilter(f){
  markFilter=f;
  ['all','bm','undone','done'].forEach(v=>{
    const e=document.getElementById('tmf-'+v);if(e)e.classList.toggle('on',v===f);
  });
  renderTextbook();
}

let sumChapIdx=-1;
function openSummary(ci,ev){
  if(ev)ev.stopPropagation();
  sumChapIdx=ci;
  const ch=CHDATA[ci];
  document.getElementById('sum-title').textContent=ch.chapter;
  const body=document.getElementById('sum-body');body.innerHTML='';
  ch.terms.forEach((t,ti)=>{
    const mark=getTBM(t.title||t.jaName);
    const row=document.createElement('div');row.className='sum-term';
    row.innerHTML='<span class="sum-tname" style="color:'+(mark===2?'var(--teal)':mark===1?'var(--warning)':'var(--text)')+'">'+
      MARK_ICON[mark]+' '+escH(t.jaName||t.title)+'</span>'+
      '<span class="sum-tdef">'+escH((t.definition||'').slice(0,60)+(t.definition&&t.definition.length>60?'…':''))+'</span>';
    row.onclick=()=>{closeSummary();showTD(ci,ti);};
    body.appendChild(row);
    if(t.examPoints&&t.examPoints.length){
      const hint=document.createElement('div');hint.className='sum-sep';
      hint.textContent='⚡ '+t.examPoints[0].replace(/\*\*/g,'').slice(0,50);
      body.insertBefore(hint,row);
    }
  });
  document.getElementById('sum-overlay').classList.add('on');
  document.getElementById('sum-modal').classList.add('on');
}
function closeSummary(){
  document.getElementById('sum-overlay').classList.remove('on');
  document.getElementById('sum-modal').classList.remove('on');
}

function updateChapProgress(ci){
  const ch=CHDATA[ci];
  const total=ch.terms.length;
  const done=ch.terms.filter(t=>getTBM(t.title||t.jaName)===2).length;
  const bm=ch.terms.filter(t=>getTBM(t.title||t.jaName)===1).length;
  const el=document.getElementById('chp-'+ci);
  if(el)el.textContent=done?('✓'+done+'/'+total):(bm?('🔖'+bm):(''+total+'用語'));
  const fill=document.getElementById('chfill-'+ci);
  if(fill)fill.style.width=(total?Math.round(done/total*100):0)+'%';
  const pill=document.getElementById('cp-'+ci);
  if(pill){
    pill.querySelector('.pill-prog').textContent=done>0?(' '+done+'/'+total):'';
  }
}

let tdCi=-1,tdTi=-1,tdTermList=[];

function navTD(dir){
  const newTi=tdTi+dir;
  if(newTi<0||newTi>=CHDATA[tdCi].terms.length)return;
  showTD(tdCi,newTi);
}
function cycleTDMark(){
  const t=CHDATA[tdCi].terms[tdTi];
  const key=t.title||t.jaName;
  cycleTBM(key);
  updateChapProgress(tdCi);
  refreshTDMark();
}
function refreshTDMark(){
  const t=CHDATA[tdCi].terms[tdTi];
  const key=t.title||t.jaName;
  const v=getTBM(key);
  const btn=document.getElementById('td-mark-btn');
  if(!btn)return;
  btn.textContent=v===0?'● 未読':v===1?'🔖 しおり':'✓ 読了';
  btn.className='td-mark-btn '+MARK_CLASS[v];
}

function renderTextbook(){
  const el=document.getElementById('tb-guide');el.innerHTML='';
  const filterBar=document.getElementById('tb-mark-filter');
  if(filterBar)filterBar.style.display='';
  CHDATA.forEach((ch,ci)=>{
    const visTerms=ch.terms.map((t,ti)=>({t,ti})).filter(({t})=>{
      const v=getTBM(t.title||t.jaName);
      if(markFilter==='bm')return v===1;
      if(markFilter==='done')return v===2;
      if(markFilter==='undone')return v!==2;
      return true;
    });
    if(markFilter!=='all'&&visTerms.length===0)return;

    const wrap=document.createElement('div');
    wrap.className='ch-item';wrap.id='ch-item-'+ci;

    const head=document.createElement('div');head.className='ch-head';
    const done=ch.terms.filter(t=>getTBM(t.title||t.jaName)===2).length;
    const bm=ch.terms.filter(t=>getTBM(t.title||t.jaName)===1).length;
    const progTxt=done?('✓'+done+'/'+ch.terms.length):(bm?('🔖'+bm):(''+ch.terms.length+'用語'));
    head.innerHTML=
      '<div class="ch-head-left">'+
        '<span>'+escH(ch.chapter)+'</span>'+
        '<span class="ch-badge" id="chp-'+ci+'">'+escH(progTxt)+'</span>'+
      '</div>'+
      '<div class="ch-head-right">'+
        '<button class="ch-summary-btn" title="章まとめ">まとめ</button>'+
        '<span class="ch-arrow">›</span>'+
      '</div>';
    head.querySelector('.ch-summary-btn').addEventListener('click',ev=>openSummary(ci,ev));
    bindChHead(head,wrap,head.querySelector('.ch-head-left'));

    const pbar=document.createElement('div');pbar.className='ch-prog-bar';
    pbar.innerHTML='<div class="ch-prog-fill" id="chfill-'+ci+'" style="width:'+(ch.terms.length?Math.round(done/ch.terms.length*100):0)+'%"></div>';

    const body=document.createElement('div');body.className='ch-body';
    body.appendChild(pbar);
    visTerms.forEach(({t,ti})=>{
      const key=t.title||t.jaName;
      const v=getTBM(key);
      const row=document.createElement('div');row.className='term-row';
      row.innerHTML=
        '<button class="term-mark '+MARK_CLASS[v]+'" data-ci="'+ci+'" data-ti="'+ti+'" title="読了マーク">'+
          (v===0?'○':MARK_ICON[v])+
        '</button>'+
        '<div style="flex:1">'+
          '<div class="tname">'+escH(t.jaName||t.title)+'</div>'+
          (t.enName?'<div class="ten">'+escH(t.enName)+'</div>':'')+
        '</div>'+
        (t.questions.length?'<span class="tqc">Q×'+t.questions.length+'</span>':'');
      row.querySelector('.term-mark').addEventListener('click',ev=>{
        ev.stopPropagation();
        cycleTBM(key);
        updateChapProgress(ci);
        const btn=ev.currentTarget;
        const nv=getTBM(key);
        btn.textContent=nv===0?'○':MARK_ICON[nv];
        btn.className='term-mark '+MARK_CLASS[nv];
      });
      row.addEventListener('click',()=>showTD(ci,ti));
      body.appendChild(row);
    });

    wrap.appendChild(head);wrap.appendChild(body);el.appendChild(wrap);
  });
  renderChapNav();
}
function escH(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

const FIGS=(typeof window!=='undefined'&&window.SFQ_FIGURES)||{};
function figMarkup(name){if(!name)return '';return FIGS[(CFG.slug||'')+'/'+name]||FIGS[name]||'';}
function figHTML(name,cap){
  const m=figMarkup(name);if(!m)return '';
  return '<figure class="qfig" onclick="openFig(this,event)" title="タップで拡大">'+m
    +(cap?'<figcaption>'+escH(cap)+'</figcaption>':'')+'</figure>';
}
function setFig(elId,name){
  const el=document.getElementById(elId);if(!el)return;
  const h=figHTML(name);el.innerHTML=h;el.style.display=h?'':'none';
}
function openFig(figEl,ev){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const svg=figEl&&figEl.querySelector('svg');if(!svg)return;
  let lb=document.getElementById('fig-lb');
  if(!lb){lb=document.createElement('div');lb.id='fig-lb';lb.className='figlb';
    lb.addEventListener('click',closeFig);document.body.appendChild(lb);}
  lb.innerHTML='<div class="qfig">'+svg.outerHTML+'</div>';
  lb.classList.add('show');
}
function closeFig(){const lb=document.getElementById('fig-lb');if(lb)lb.classList.remove('show');}

function renderNavMap(){
  const el=document.getElementById('tb-nav');el.innerHTML='';
  NAVDATA.forEach((sec,si)=>{
    if(!sec.content.trim())return;

    let body='';
    const paths=sec.content.match(/`\[設定\][^`]+`/g)||[];
    paths.forEach(p=>body+='<span class="path-code">'+escH(p.replace(/`/g,''))+'</span><br>');
    const rows=sec.content.split('\n').filter(l=>l.includes('|'));
    let inHead=true,tbl='',hasTbl=false;
    rows.forEach(r=>{
      if(/^\|[-|: ]+\|$/.test(r.trim())){inHead=false;return;}
      const cells=r.split('|').filter((_,i,a)=>i>0&&i<a.length-1);
      if(!cells.length)return;
      if(!hasTbl){tbl='<table class="nm-table"><thead><tr>';hasTbl=true;inHead=true;}
      if(inHead){tbl+=cells.map(c=>'<th>'+mdInline(c.trim())+'</th>').join('');tbl+='</tr></thead><tbody>';inHead=false;}
      else tbl+='<tr>'+cells.map(c=>'<td>'+mdInline(c.trim())+'</td>').join('')+'</tr>';
    });
    if(hasTbl)tbl+='</tbody></table>';
    body+=tbl;
    const notes=sec.content.split('\n').filter(l=>/^> /.test(l));
    notes.forEach(n=>body+='<blockquote style="border-left:3px solid var(--warning);background:var(--warning-light);padding:8px 12px;border-radius:0 8px 8px 0;margin:6px 0;font-size:12px">'+mdInline(n.slice(2))+'</blockquote>');

    const wrap=document.createElement('div');
    wrap.className='ch-item';wrap.id='nm-sec-'+si;
    const head=document.createElement('div');head.className='ch-head';
    head.innerHTML=
      '<div class="ch-head-left"><span>'+escH(sec.title)+'</span></div>'+
      '<div class="ch-head-right"><span class="ch-arrow">›</span></div>';
    bindChHead(head,wrap);
    const bodyEl=document.createElement('div');bodyEl.className='ch-body';
    bodyEl.innerHTML='<div class="nm-sec" style="margin:0;padding:12px 14px;box-shadow:none;border-radius:0">'+body+'</div>';
    wrap.appendChild(head);wrap.appendChild(bodyEl);el.appendChild(wrap);
  });
}
function cramMd(text){
  const lines=String(text||'').split('\n');
  let out='',listType=null,i=0;
  const closeList=()=>{ if(listType){out+='</'+listType+'>';listType=null;} };
  const cellsOf=r=>r.split('|').filter((_,idx,a)=>idx>0&&idx<a.length-1).map(c=>c.trim());
  const isSep=r=>/^\s*\|?[\s:|-]+\|?\s*$/.test(r)&&r.indexOf('-')>=0;
  while(i<lines.length){
    const raw=lines[i], t=raw.trim();
    if(t.indexOf('|')>=0 && i+1<lines.length && isSep(lines[i+1])){
      closeList();
      const th=cellsOf(raw); i+=2;
      let body='';
      while(i<lines.length && lines[i].indexOf('|')>=0 && lines[i].trim()!==''){
        body+='<tr>'+cellsOf(lines[i]).map(c=>'<td>'+mdInline(c)+'</td>').join('')+'</tr>'; i++;
      }
      out+='<table class="nm-table"><thead><tr>'+th.map(c=>'<th>'+mdInline(c)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table>';
      continue;
    }
    if(/^###\s+/.test(t)){ closeList(); out+='<h4 class="cram-h4">'+mdInline(t.replace(/^###\s+/,''))+'</h4>'; i++; continue; }
    if(/^>\s?/.test(t)){ closeList(); const b=t.replace(/^>\s?/,''); const warn=/⚠️|注意|罠|危険/.test(b); out+='<div class="cram-callout '+(warn?'warn':'tip')+'">'+mdInline(b)+'</div>'; i++; continue; }
    if(/^[-*]\s+/.test(t)){ if(listType!=='ul'){closeList();out+='<ul class="cram-ul">';listType='ul';} out+='<li>'+mdInline(t.replace(/^[-*]\s+/,''))+'</li>'; i++; continue; }
    if(/^\d+\.\s+/.test(t)){ if(listType!=='ol'){closeList();out+='<ol class="cram-ol">';listType='ol';} out+='<li>'+mdInline(t.replace(/^\d+\.\s+/,''))+'</li>'; i++; continue; }
    if(t===''){ closeList(); i++; continue; }
    closeList(); out+='<p class="cram-p">'+mdInline(t)+'</p>'; i++;
  }
  closeList();
  return out;
}
function renderCram(){
  const el=document.getElementById('cram-body'); if(!el)return;
  if(!CRAMDATA||!CRAMDATA.length){
    el.innerHTML='<div class="cram-empty">📋 この資格の「直前まとめ」は準備中です。</div>';
    return;
  }
  el.innerHTML='';

  const navWrap=document.createElement('div');
  navWrap.className='filter-bar';
  navWrap.style.margin='0 0 12px';
  CRAMDATA.forEach((sec,i)=>{
    if(!sec||!sec.title)return;
    const btn=document.createElement('button');
    btn.className='chip';
    btn.textContent=sec.title;
    btn.addEventListener('click',()=>{
      const target=document.getElementById('cram-sec-'+i);
      if(!target)return;
      target.classList.add('open');
      target.scrollIntoView({behavior:'smooth',block:'start'});
    });
    navWrap.appendChild(btn);
  });
  el.appendChild(navWrap);

  CRAMDATA.forEach((sec,i)=>{
    if(!sec)return;
    const wrap=document.createElement('div');
    wrap.className='ch-item';wrap.id='cram-sec-'+i;
    const head=document.createElement('div');head.className='ch-head';
    head.innerHTML=
      '<div class="ch-head-left"><span>'+escH(sec.title||'（無題）')+'</span></div>'+
      '<div class="ch-head-right"><span class="ch-arrow">›</span></div>';
    bindChHead(head,wrap);
    const bodyEl=document.createElement('div');bodyEl.className='ch-body';
    bodyEl.innerHTML='<div class="cram-sec" style="margin:0;padding:12px 14px">'+cramMd(sec.content||'')+'</div>';
    wrap.appendChild(head);wrap.appendChild(bodyEl);el.appendChild(wrap);
  });
}
function tbSearch(q){
  const query=q.toLowerCase().trim();
  const clearBtn=document.getElementById('tb-clear');
  if(clearBtn)clearBtn.style.display=query?'':'none';
  document.querySelectorAll('.ch-item').forEach(c=>{c.classList.remove('open');syncChExpanded(c);});
  let total=0,matched=0;
  document.querySelectorAll('.term-row').forEach(r=>{
    total++;
    const hit=!query||r.textContent.toLowerCase().includes(query);
    r.style.display=hit?'':'none';
    if(hit)matched++;
  });
  if(query){
    document.querySelectorAll('.ch-item').forEach(c=>{
      if([...c.querySelectorAll('.term-row')].some(r=>r.style.display!=='none'))c.classList.add('open');
    });
  }
  const cnt=document.getElementById('search-count');
  if(cnt){
    cnt.style.display=query?'':'none';
    cnt.textContent=query?matched+'件ヒット（全'+total+'用語中）':'';
  }
}
function clearTbSearch(){
  const inp=document.getElementById('tb-search');
  if(inp){inp.value='';tbSearch('');}
}
function showTD(ci,ti){
  tdCi=ci;tdTi=ti;
  const t=CHDATA[ci].terms[ti];
  const total=CHDATA[ci].terms.length;
  setText('td-title',t.jaName||t.title);
  setText('td-en',t.enName?'( '+t.enName+' )':'');
  document.getElementById('td-def').innerHTML=mdBlock(t.definition)||'—';
  const tdFigBlk=document.getElementById('td-fig-blk');
  if(t.fig&&figMarkup(t.fig)){
    document.getElementById('td-fig').innerHTML=figHTML(t.fig);
    if(tdFigBlk)tdFigBlk.style.display='';
  }else if(tdFigBlk){tdFigBlk.style.display='none';}
  const ep=document.getElementById('td-ep');ep.innerHTML='';
  if(t.examPoints&&t.examPoints.length){
    t.examPoints.forEach(p=>{
      const d=document.createElement('div');d.className='ep-item';
      d.innerHTML=mdInline(p);ep.appendChild(d);
    });
    document.getElementById('td-ep-blk').style.display='';
  }else{document.getElementById('td-ep-blk').style.display='none';}
  const qel=document.getElementById('td-qs');qel.innerHTML='';
  if(t.questions&&t.questions.length){
    t.questions.forEach(qid=>{
      const c=document.createElement('span');c.className='qchip';c.textContent='Q'+qid;
      c.onclick=()=>jumpQ(qid);qel.appendChild(c);
    });
    document.getElementById('td-q-blk').style.display='';
  }else{document.getElementById('td-q-blk').style.display='none';}
  const prevBtn=document.getElementById('td-prev');
  const nextBtn=document.getElementById('td-next');
  const posEl=document.getElementById('td-pos');
  if(prevBtn)prevBtn.disabled=ti===0;
  if(nextBtn)nextBtn.disabled=ti===total-1;
  if(posEl)posEl.textContent=CHDATA[ci].chapter.replace(/^第\d+章[:：]\s*/,'')+'  '+(ti+1)+'/'+total;
  refreshTDMark();
  document.getElementById('tb-list').style.display='none';
  document.getElementById('td-view').classList.add('on');
  window.scrollTo(0,0);
}
function closeTD(){
  document.getElementById('td-view').classList.remove('on');
  document.getElementById('tb-list').style.display='';
}
function gotoTerm(label){
  if(!label)return;
  const norm=s=>String(s||'').replace(/\s/g,'');
  const L=norm(label);
  const keysOf=t=>[t.title,t.jaName,t.enName].filter(Boolean).map(norm);
  let found=null;
  for(let ci=0;ci<CHDATA.length&&!found;ci++)
    for(let ti=0;ti<CHDATA[ci].terms.length;ti++)
      if(keysOf(CHDATA[ci].terms[ti]).some(k=>k===L)){found=[ci,ti];break;}
  for(let ci=0;ci<CHDATA.length&&!found;ci++)
    for(let ti=0;ti<CHDATA[ci].terms.length;ti++)
      if(keysOf(CHDATA[ci].terms[ti]).some(k=>k&&(L.includes(k)||k.includes(L)))){found=[ci,ti];break;}
  goTo('textbook');switchTbTab('guide');
  if(found){showTD(found[0],found[1]);}
  else{
    const inp=document.getElementById('tb-search');
    if(inp){inp.value=label;tbSearch(label);}
    toast('「'+label+'」に近い用語を表示');
  }
}
function jumpQ(qid){
  const q=allQ.find(q=>q.id===qid);if(!q){toast('問題が見つかりません');return;}
  sQueue=[q];sCur=0;sOk=0;sNg=0;dcActive=false;
  document.getElementById('s-end').style.display='none';
  document.getElementById('s-card').style.display='block';
  setText('sess-ok-txt','✓ 0');setText('sess-ng-txt','✗ 0');
  goTo('study');renderSQ();toast('Q'+qid+' を表示中');
}

function allTerms(){
  const out=[];
  CHDATA.forEach(ch=>ch.terms.forEach(t=>out.push({key:t.title,ja:t.jaName||t.title,en:t.enName||'',cat:ch.chapter,def:t.definition,pts:t.examPoints})));
  return out;
}
function initVocab(){
  const all=allTerms();
  let f=all;
  if(vFilter==='unseen')f=all.filter(t=>getVM(t.key)===0);
  else if(vFilter==='hard')f=all.filter(t=>getVM(t.key)===1);
  else if(vFilter==='mastered')f=all.filter(t=>getVM(t.key)===2);
  vQueue=shuffle(f);vCur=0;vFlipped=false;
  document.getElementById('v-done').style.display='none';
  document.getElementById('v-cards').style.display='';
  vMastBar();renderVC();
}
function setVF(f){
  vFilter=f;
  ['all','unseen','hard','mastered'].forEach(v=>{
    const e=document.getElementById('vf-'+v);if(e)e.classList.toggle('on',v===f);
  });
  initVocab();
}
function renderVC(){
  if(vCur>=vQueue.length){vocabDone();return;}
  const t=vQueue[vCur];
  const scene=document.getElementById('card-scene');
  scene.classList.remove('flipped');vFlipped=false;
  setText('vc-cat',t.cat);setText('vc-term',t.ja);
  setText('vc-en',t.en?'( '+t.en+' )':'');
  setText('vc-cat2',t.cat);
  document.getElementById('vc-def').textContent=t.def||'—';
  const ptsEl=document.getElementById('vc-pts');ptsEl.innerHTML='';
  if(t.pts&&t.pts.length){
    const h=document.createElement('div');
    h.style.cssText='font-size:10px;font-weight:700;color:var(--warning);margin-bottom:5px;margin-top:6px';
    h.textContent='⚡ 試験のポイント';ptsEl.appendChild(h);
    t.pts.slice(0,3).forEach(p=>{
      const d=document.createElement('div');
      d.style.cssText='font-size:11px;color:var(--text-sub);margin-bottom:3px;padding-left:6px';
      d.textContent='• '+p.replace(/\*\*/g,'');ptsEl.appendChild(d);
    });
  }
  setText('v-prog',(vCur+1)+' / '+vQueue.length);
  vMastBar();
}
function flipCard(){
  if(vCur>=vQueue.length)return;
  vFlipped=!vFlipped;
  document.getElementById('card-scene').classList.toggle('flipped',vFlipped);
}
function vRate(ok){
  if(vCur>=vQueue.length)return;
  setVM(vQueue[vCur].key,ok?2:1);
  vCur++;vMastBar();renderVC();
}
function vSkip(){vCur++;renderVC();}
function vRestart(){initVocab();}
function vMastBar(){
  const all=allTerms();
  const m=all.filter(t=>getVM(t.key)>=2).length;
  const pct=Math.round(m/all.length*100);
  document.getElementById('v-bar').style.width=pct+'%';
  setText('v-mast','★ '+m+' 習得');
  homeStats();
}
function vocabDone(){
  const all=allTerms();
  const m=all.filter(t=>getVM(t.key)>=2).length;
  document.getElementById('v-cards').style.display='none';
  document.getElementById('v-done').style.display='block';
  setText('v-done-label',vFilter==='mastered'?'習得済み用語の確認完了！':'このセットを完走しました！');
  setText('v-done-sub','全'+all.length+'用語中 '+m+'用語習得済み');
}

function startStudy(){
  applyFilters();
  if(filtQ.length===0){toast('対象の問題がありません');return;}
  sQueue=fShuf?shuffle([...filtQ]):[...filtQ];
  sCur=0;sOk=0;sNg=0;sRevealed=false;dcActive=false;loopMode=false;
  document.getElementById('s-end').style.display='none';
  document.getElementById('s-card').style.display='block';
  setText('sess-ok-txt','✓ 0');setText('sess-ng-txt','✗ 0');
  goTo('study');renderSQ();
}
function renderSQ(){
  if(sCur>=sQueue.length){studyDone();return;}
  const q=sQueue[sCur];sSel=[];sRevealed=false;sLowConf=false;sQStart=Date.now();sHint=0;
  const isM=q.answers.length>1;
  setText('s-prog',(sCur+1)+' / '+sQueue.length);
  document.getElementById('s-pfill').style.width=(sCur/sQueue.length*100)+'%';
  const badge=document.getElementById('s-badge');
  badge.textContent='Q'+q.id+' '+domainDef(domainOf(q.id)).emoji+(isM?' ★ '+q.answers.length+'つ選択':'');
  badge.className='qbadge'+(isM?' mbadge':'');
  badge.insertAdjacentHTML('beforeend',diffPillHTML(q));
  setText('s-qtext',q.question);
  var _scn=document.getElementById('s-scenario');
  if(_scn){if(q.scenario){_scn.style.display='';_scn.innerHTML='<div class="scn-tag">📋 ケーススタディ</div>'+escH(q.scenario);}else{_scn.style.display='none';_scn.innerHTML='';}}
  setFig('s-qfig',q.fig);
  const bmbtn=document.getElementById('s-bmbtn');
  setBmBtn(bmbtn,isBm(q.id));
  const choicesEl=document.getElementById('s-choices');choicesEl.innerHTML='';
  sDisp = cshufOn() ? shuffle(q.choices.map((_,i)=>i)) : q.choices.map((_,i)=>i);
  sDisp.forEach((oi,di)=>{
    const ch=q.choices[oi];
    const item=document.createElement('div');item.className='choice';item.dataset.oi=oi;item.dataset.num=di+1;
    item.setAttribute('role','button');item.setAttribute('aria-pressed','false');item.tabIndex=0;
    const mark=document.createElement('div');mark.className='cmark';mark.textContent=String(di+1);
    const span=document.createElement('span');span.textContent=ch;
    item.appendChild(mark);item.appendChild(span);
    item.addEventListener('click',()=>selChoice(oi,isM));
    item.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();selChoice(oi,isM);}});
    choicesEl.appendChild(item);
  });
  {const _ck=document.getElementById('s-check');_ck.disabled=true;_ck.textContent=isM?('あと'+q.answers.length+'つ選択'):'解答する';}
  const cf=document.getElementById('s-conf');if(cf)cf.classList.remove('on');
  const expEl=document.getElementById('s-exp');
  expEl.className='exp-box';expEl.innerHTML='';expEl.setAttribute('aria-live','polite');
  document.getElementById('s-next-row').style.display='none';
  var _sa=document.getElementById('s-act');if(_sa)_sa.style.display='flex';
  var _sb=document.getElementById('study-actbar');if(_sb)_sb.style.display='';
  const memo=document.getElementById('s-memo');if(memo)memo.value=(store.notes&&store.notes[q.id])||'';
  const ms=document.getElementById('memo-saved');if(ms)ms.classList.remove('on');
  const hintHost=document.getElementById('s-hint');
  if(hintHost){hintHost.style.display='';hintHost.innerHTML='<button type="button" class="hint-btn" id="s-hint-btn" onclick="showHint()">💡 ヒントを見る</button><div class="hint-list" id="s-hint-list"></div>';}
  if(loopMode){const mastered=Object.keys(loopStreak).filter(function(k){return loopStreak[k]>=2;}).length;setText('s-prog','🔂 重点ループ 習得'+mastered+'/'+loopTotal);document.getElementById('s-pfill').style.width=(loopTotal?Math.round(mastered/loopTotal*100):0)+'%';}
}
function selChoice(idx,isM){
  if(sRevealed)return;
  const q=sQueue[sCur];const need=q?q.answers.length:1;
  if(isM){const p=sSel.indexOf(idx);if(p>=0)sSel.splice(p,1);else{if(sSel.length>=need){toast(need+'つまで選べます');return;}sSel.push(idx);}}
  else sSel=[idx];
  document.querySelectorAll('#s-choices .choice').forEach(item=>{
    const oi=+item.dataset.oi,on=sSel.includes(oi);
    item.classList.toggle('sel',on);
    item.setAttribute('aria-pressed',on?'true':'false');
    item.querySelector('.cmark').textContent=on?(isM?'✓':item.dataset.num):item.dataset.num;
  });
  const chk=document.getElementById('s-check');
  chk.disabled=sSel.length!==need;
  if(isM){const rem=need-sSel.length;chk.textContent=rem>0?'あと'+rem+'つ選択':'解答する';}
}
function toggleConf(){
  if(sRevealed)return;
  sLowConf=!sLowConf;
  const cf=document.getElementById('s-conf');if(cf)cf.classList.toggle('on',sLowConf);
}
let _memoT=null;
function onMemoInput(){
  const q=sQueue[sCur];if(!q)return;
  const v=document.getElementById('s-memo').value;
  if(!store.notes)store.notes={};
  if(v.trim())store.notes[q.id]=v;else delete store.notes[q.id];
  clearTimeout(_memoT);
  _memoT=setTimeout(()=>{save();const ms=document.getElementById('memo-saved');if(ms){ms.classList.add('on');setTimeout(()=>ms.classList.remove('on'),1200);}},600);
}
function checkAnswer(){
  if(sRevealed)return;sRevealed=true;
  var _sh=document.getElementById('s-hint');if(_sh)_sh.style.display='none';
  const q=sQueue[sCur];
  const selTx=sSel.map(i=>q.choices[i]);
  const isOk=arrEq(selTx.slice().sort(),q.answers.slice().sort());
  document.querySelectorAll('#s-choices .choice').forEach(item=>{
    item.classList.add('done');
    const oi=+item.dataset.oi,ch=q.choices[oi],isSel=sSel.includes(oi),isAns=q.answers.includes(ch);
    if(isSel&&isAns)item.classList.add('correct');
    else if(isSel&&!isAns)item.classList.add('wrong');
    else if(!isSel&&isAns)item.classList.add('hint');
    item.setAttribute('aria-pressed',isSel?'true':'false');item.tabIndex=-1;
    item.querySelector('.cmark').textContent=isAns?'✓':(isSel?'✗':item.dataset.num);
  });
  const exp=document.getElementById('s-exp');
  exp.className='exp-box show '+(isOk?'exp-ok':'exp-ng');
  var _eh='<div class="exp-head"><span>'+(isOk?'✅':'❌')+'</span><span>'+(isOk?'正解！':'不正解')+'</span></div>';
  exp.innerHTML=_eh+'<div style="white-space:pre-wrap">'+escH(q.explanation||'解説なし')+'</div>';
  if(q.expFig)exp.innerHTML+=figHTML(q.expFig);
  if(q.reference_url){exp.innerHTML+='<br><a class="reflink" href="'+q.reference_url+'" target="_blank">🔗 Salesforce ヘルプを見る</a>';}
  if(!isOk){
    const wrDiv=document.createElement('div');wrDiv.className='wr-pick';
    wrDiv.innerHTML='<div class="wr-q">なぜ間違えた？（任意・分析に使います）</div>';
    const wrow=document.createElement('div');wrow.className='wr-row';
    [['unknown','🤔 知らなかった'],['careless','😵 ケアレスミス'],['narrow','🔀 2択で迷った']].forEach(pair=>{
      const b=document.createElement('button');b.type='button';b.className='wr-b';b.textContent=pair[1];
      if((store.hist[q.id]||{}).wr===pair[0])b.classList.add('on');
      b.onclick=function(){ if(!store.hist[q.id])store.hist[q.id]={c:0,w:0}; store.hist[q.id].wr=pair[0]; save(); wrow.querySelectorAll('.wr-b').forEach(x=>x.classList.toggle('on',x===b)); toast('記録しました'); };
      wrow.appendChild(b);
    });
    wrDiv.appendChild(wrow);exp.appendChild(wrDiv);
  }
  const rel=[];
  (q.keywords||[]).forEach(kw=>{
    CHDATA.forEach((ch,ci)=>{ch.terms.forEach((t,ti)=>{
      if((t.jaName&&t.jaName.includes(kw))||(t.title&&t.title.includes(kw))){
        if(!rel.find(r=>r.key===t.title))rel.push({...t,ci,ti,kw});
      }
    });});
  });
  if(rel.length){
    const rDiv=document.createElement('div');rDiv.style.marginTop='10px';
    rDiv.innerHTML='<div style="font-size:11px;color:var(--text-sub);font-weight:700;margin-bottom:5px">📚 関連用語（タップで詳細）</div>';
    rel.slice(0,4).forEach(t=>{
      const c=document.createElement('span');c.className='qchip';
      c.style.cssText='background:var(--purple-light);color:var(--purple);cursor:pointer';
      c.textContent=t.jaName||t.title;
      c.onclick=()=>showTD(t.ci,t.ti);rDiv.appendChild(c);
    });
    exp.appendChild(rDiv);
  }
  const kws=q.keywords||[];
  if(kws.length){
    const matched=new Set(rel.map(r=>r.kw));
    const kDiv=document.createElement('div');kDiv.style.marginTop='10px';
    kDiv.innerHTML='<div style="font-size:11px;color:var(--text-sub);font-weight:700;margin-bottom:5px">🏷️ キーワード</div>';
    kws.forEach(kw=>{
      const c=document.createElement('span');c.className='qchip';
      if(matched.has(kw)){
        c.style.cssText='background:var(--purple-light);color:var(--purple);cursor:pointer';
        c.title='用語詳細を開く';
        const hit=rel.find(r=>r.kw===kw);
        c.onclick=()=>showTD(hit.ci,hit.ti);
      } else {
        c.style.cssText='background:var(--bg-sub,#f3f4f6);color:var(--text-sub);cursor:pointer';
        c.title='このキーワードで絞り込み';
        c.onclick=()=>{
          fKw=kw;
          const sel=document.getElementById('f-kw'); if(sel){
            let has=Array.from(sel.options).some(o=>o.value===kw);
            if(!has){const o=document.createElement('option');o.value=kw;o.textContent='🏷️ '+kw;sel.appendChild(o);}
            sel.value=kw;
          }
          applyFilters(); goTo('home'); toast('🏷️ 「'+kw+'」で絞り込み');
        };
      }
      c.textContent=kw;
      kDiv.appendChild(c);
    });
    exp.appendChild(kDiv);
  }
  const relQ=relatedQuestions(q,3);
  if(relQ.length){
    const rqDiv=document.createElement('div');rqDiv.style.marginTop='10px';
    rqDiv.innerHTML='<div style="font-size:11px;color:var(--text-sub);font-weight:700;margin-bottom:5px">🧩 似た問題（タップで挑戦）</div>';
    relQ.forEach(function(o){const b=document.createElement('button');b.type='button';b.className='relq';b.textContent='Q'+o.id+'：'+(o.question.length>34?o.question.slice(0,34)+'…':o.question);b.onclick=function(){beginStudyWith([o]);};rqDiv.appendChild(b);});
    exp.appendChild(rqDiv);
  }
  (function(){
    const feyWrap=document.createElement('div');feyWrap.className='fey-wrap';
    feyWrap.innerHTML='<div class="fey-q">🧠 自分の言葉で説明（任意）</div>';
    const ta=document.createElement('textarea');ta.className='fey-box';ta.placeholder='例: なぜこの答えになるのか一言で…';
    ta.value=(store.sum&&store.sum[q.id])||'';
    let _ft=null;
    ta.oninput=function(){if(!store.sum)store.sum={};const v=ta.value;if(v.trim())store.sum[q.id]=v;else delete store.sum[q.id];clearTimeout(_ft);_ft=setTimeout(save,600);};
    feyWrap.appendChild(ta);exp.appendChild(feyWrap);
  })();
  const repDiv=document.createElement('div');repDiv.className='report-wrap';
  const repBtn=document.createElement('button');repBtn.type='button';repBtn.className='report-link';
  repBtn.textContent='⚠️ この問題を報告';repBtn.onclick=()=>reportQuestion(q.id);
  repDiv.appendChild(repBtn);exp.appendChild(repDiv);
  document.getElementById('s-check').disabled=true;
  document.getElementById('s-next-row').style.display='flex';
  var _sa2=document.getElementById('s-act');if(_sa2)_sa2.style.display='none';
  const _sec=Math.round((Date.now()-(sQStart||Date.now()))/1000);
  recStudyTime(domainOf(q.id),isOk,_sec);
  recH(q.id,isOk,sLowConf);
  if(loopMode){const _k=q.id;loopStreak[_k]=isOk?((loopStreak[_k]||0)+1):0;if((loopStreak[_k]||0)<2)sQueue.push(q);else toast('✓ 習得！');}
  if(isOk&&sLowConf)toast('🤔 自信なし → 復習リストに追加');
  if(isOk){sOk++;setText('sess-ok-txt','✓ '+sOk);}else{sNg++;setText('sess-ng-txt','✗ '+sNg);}
  setTimeout(()=>{const ex=document.getElementById('s-exp');if(ex)ex.scrollIntoView({behavior:'smooth',block:'nearest'});},90);
}
function nextSQ(){sCur++;renderSQ();window.scrollTo({top:0,behavior:'smooth'});}
function toggleBm(){
  const q=sQueue[sCur];if(!q)return;
  togBm(q.id);
  const on=isBm(q.id);
  setBmBtn(document.getElementById('s-bmbtn'),on);
  toast(on?'★ ブックマークに追加':'☆ ブックマーク解除');
}
function studyDone(){
  document.getElementById('s-card').style.display='none';
  document.getElementById('s-end').style.display='block';
  var _sb2=document.getElementById('study-actbar');if(_sb2)_sb2.style.display='none';
  const total=sOk+sNg,pct=total?Math.round(sOk/total*100):0;
  setText('s-end-score',pct+'%');
  setText('s-end-sub',total+'問中 '+sOk+'問正解');
  sLastWrong=sQueue.filter(q=>isWrong(q.id));
  const box=document.querySelector('#s-end .result-box');
  if(box){
    let rb=document.getElementById('s-end-redo');
    if(!rb){
      rb=document.createElement('button');rb.id='s-end-redo';rb.className='btn bd';
      rb.style.cssText='width:100%;margin:14px 0 0';rb.onclick=redoWrong;
      box.insertBefore(rb,box.lastElementChild);
    }
    if(sLastWrong.length){rb.style.display='block';rb.textContent='🔁 間違えた '+sLastWrong.length+' 問だけ復習';}
    else rb.style.display='none';
  }
  if(dcActive){
    if(!store.dc||typeof store.dc!=='object')store.dc={};
    store.dc.d=_today();store.dc.done=1;save();
    dcActive=false;
    try{renderDaily();}catch(e){}
    toast('🎉 デイリーチャレンジ完了！また明日');
  }
}
function redoWrong(){if(sLastWrong&&sLastWrong.length)beginStudyWith(sLastWrong.slice());}

function showHint(){
  const q=sQueue[sCur];if(!q||sRevealed)return;
  const list=document.getElementById('s-hint-list');if(!list)return;
  sHint++;
  if(sHint===1){
    list.insertAdjacentHTML('beforeend','<div class="hint-it">① 分野: <b>'+escH(domainDef(domainOf(q.id)).name)+'</b></div>');
  }else{
    const wrongOis=[];q.choices.forEach(function(ch,i){if(q.answers.indexOf(ch)<0)wrongOis.push(i);});
    const elim=shuffle(wrongOis.slice()).slice(0,Math.max(0,wrongOis.length-1));
    document.querySelectorAll('#s-choices .choice').forEach(function(item){if(elim.indexOf(+item.dataset.oi)>=0)item.classList.add('elim');});
    list.insertAdjacentHTML('beforeend','<div class="hint-it">② 明らかな誤りを薄く表示しました。残りから選んでください。</div>');
    const btn=document.getElementById('s-hint-btn');if(btn)btn.style.display='none';
  }
}
function relatedQuestions(q,limit){
  const kws={};(q.keywords||[]).forEach(function(k){kws[k]=1;});
  const dom=domainOf(q.id),scored=[];
  scopedQ().forEach(function(o){if(o.id===q.id)return;let s=0;(o.keywords||[]).forEach(function(k){if(kws[k])s+=2;});if(domainOf(o.id)===dom)s+=1;if(s>0)scored.push({q:o,s:s});});
  scored.sort(function(a,b){return b.s-a.s;});
  return scored.slice(0,limit||3).map(function(x){return x.q;});
}
function isLeech(id){const h=store.hist[id];if(!h)return false;return (h.w||0)>=2&&(h.last==='w'||h.lc===1);}
function leechList(){return scopedQ().filter(function(q){return isLeech(q.id);});}
function startLeech(){
  const ls=leechList();
  if(!ls.length){toast('🎉 つまずき問題はありません');return;}
  beginStudyWith(shuffle(ls),{loop:true});
  toast('🔂 重点ループ：2連続正解で習得');
}
function notebookEntries(){
  return scopedQ().filter(function(q){return needsReview(q.id);}).map(function(q){
    const h=store.hist[q.id]||{};
    return {q:q,wr:h.wr,sum:(store.sum&&store.sum[q.id])||'',note:(store.notes&&store.notes[q.id])||''};
  });
}
function openNotebook(){
  const entries=notebookEntries();
  let ov=document.getElementById('nb-ov');
  if(!ov){ov=document.createElement('div');ov.id='nb-ov';ov.className='nb-ov';ov.addEventListener('click',function(e){if(e.target===ov)closeNotebook();});document.body.appendChild(ov);}
  const rl={unknown:'🤔 知らなかった',careless:'😵 ケアレス',narrow:'🔀 迷った'};
  let body;
  if(!entries.length){body='<div class="nb-empty">まだ間違いはありません。間違えた問題・「自信なし」で正解した問題がここにまとまります。</div>';}
  else{
    body=entries.map(function(e){const q=e.q;
      return '<div class="nb-item"><div class="nb-q">Q'+q.id+'　'+escH(q.question)+'</div>'
        +'<div class="nb-a">✅ '+escH(q.answers.join(' ／ '))+'</div>'
        +(e.wr?'<span class="nb-tag">'+(rl[e.wr]||'')+'</span>':'')
        +(q.explanation?'<div class="nb-exp">'+escH(q.explanation.length>180?q.explanation.slice(0,180)+'…':q.explanation)+'</div>':'')
        +(e.sum?'<div class="nb-sum">🧠 '+escH(e.sum)+'</div>':'')
        +(e.note?'<div class="nb-note">📝 '+escH(e.note)+'</div>':'')
        +'<button class="nb-go" onclick=\'nbStudy('+JSON.stringify(q.id)+')\'>この問題を解く →</button></div>';
    }).join('');
  }
  ov.innerHTML='<div class="nb-card"><div class="nb-head"><span>📓 間違いノート（'+entries.length+'問）</span><button class="nb-close" onclick="closeNotebook()">✕</button></div><div class="nb-scroll">'+body+'</div>'
    +(entries.length?'<div class="nb-foot"><button class="btn bp" style="width:100%" onclick="nbReviewAll()">📖 ノートを全部復習（'+entries.length+'問）</button></div>':'')+'</div>';
  ov.classList.add('show');
  if(!_nbKeyH){_nbKeyH=function(e){if(e.key==='Escape')closeNotebook();};document.addEventListener('keydown',_nbKeyH);}
}
let _nbKeyH=null;
function closeNotebook(){const ov=document.getElementById('nb-ov');if(ov)ov.classList.remove('show');if(_nbKeyH){document.removeEventListener('keydown',_nbKeyH);_nbKeyH=null;}}
function nbStudy(id){closeNotebook();const q=allQ.find(function(x){return x.id===id;});if(q)beginStudyWith([q]);}
function nbReviewAll(){const ls=scopedQ().filter(function(q){return needsReview(q.id);});closeNotebook();beginStudyWith(shuffle(ls));}

function celebrate(){
  try{
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    var c=document.createElement('div');c.className='confetti';
    var cols=['#0176d3','#2e844a','#dd7a01','#ba0517','#7b5ea7','#0b827c'];
    for(var i=0;i<64;i++){var p=document.createElement('i');p.style.left=(Math.random()*100)+'%';p.style.background=cols[i%cols.length];p.style.animationDelay=(Math.random()*0.6).toFixed(2)+'s';p.style.animationDuration=(1.8+Math.random()*1.2).toFixed(2)+'s';c.appendChild(p);}
    document.body.appendChild(c);
    setTimeout(function(){if(c&&c.parentNode)c.parentNode.removeChild(c);},2800);
  }catch(e){}
}
function levelInfo(){
  var xp=store.xp||0,lvl=1,need=200,acc=0;
  while(xp>=acc+need&&lvl<99){acc+=need;lvl++;need=200+(lvl-1)*60;}
  return {lvl:lvl,cur:xp-acc,need:need,total:xp};
}
function snapReadiness(){
  var tc=0,tt=0;Object.values(store.hist).forEach(function(h){tc+=h.c||0;tt+=(h.c||0)+(h.w||0);});
  if(!tt)return;var p=Math.round(tc/tt*100),d=_today();
  if(!Array.isArray(store.rdz))store.rdz=[];
  var last=store.rdz[store.rdz.length-1];
  if(last&&last.d===d)last.p=p;else{store.rdz.push({d:d,p:p});if(store.rdz.length>180)store.rdz.shift();}
}
function maybeGoalCheer(){
  var goal=store.goal||0;if(goal<=0)return;
  var today=_today(),todayN=(store.daily&&store.daily[today])||0;
  if(todayN<goal)return;
  try{if(localStorage.getItem('sfq_goalcheer')===today)return;localStorage.setItem('sfq_goalcheer',today);}catch(e){}
  store.xp=(store.xp||0)+20;save();celebrate();toast('🎉 今日の目標達成！ +20XP');
}
function _weekStart(){var d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay());return d;}
function weekKey(){return _fmtD(_weekStart());}
function weeklyMissions(){
  var ws=_weekStart(),wsMs=ws.getTime(),daily=store.daily||{},ans=0,days=0;
  for(var i=0;i<7;i++){var dd=new Date(ws);dd.setDate(ws.getDate()+i);var v=daily[_fmtD(dd)]||0;if(v>0){days++;ans+=v;}}
  var exN=(store.exams||[]).filter(function(e){return e.ts&&e.ts>=wsMs;}).length;
  return [
    {id:'m1',ic:'📝',label:'今週 40問 解く',cur:Math.min(ans,40),tgt:40},
    {id:'m2',ic:'📅',label:'今週 3日 学習する',cur:Math.min(days,3),tgt:3},
    {id:'m3',ic:'⏱️',label:'今週 模試を1回受ける',cur:Math.min(exN,1),tgt:1}
  ];
}
function checkMissions(){
  if(!store.missions||typeof store.missions!=='object')store.missions={wk:'',claimed:{}};
  if(!store.missions.claimed)store.missions.claimed={};
  var wk=weekKey();
  if(store.missions.wk!==wk){store.missions.wk=wk;store.missions.claimed={};}
  var newly=null;
  weeklyMissions().forEach(function(m){if(m.cur>=m.tgt&&!store.missions.claimed[m.id]){store.missions.claimed[m.id]=1;store.xp=(store.xp||0)+50;newly=m;}});
  if(newly){save();celebrate();toast('🏅 ミッション達成！「'+newly.label+'」+50XP');}
}
function renderGame(){
  var host=document.getElementById('gamecard');if(!host)return;
  var li=levelInfo(),ms=weeklyMissions(),lvPct=Math.round(li.cur/li.need*100);
  var html='<div class="card game-card"><div class="gc-lv"><div class="gc-lvbadge">Lv.'+li.lvl+'</div>'
    +'<div class="gc-lvmain"><div class="gc-lvtop"><span>レベル '+li.lvl+'</span><span class="gc-xp">'+li.cur+' / '+li.need+' XP</span></div>'
    +'<div class="gc-bar"><div class="gc-fill" style="width:'+lvPct+'%"></div></div>'
    +'<div class="gc-tot">累計 '+li.total+' XP</div></div></div>';
  html+='<div class="gc-mtitle">🎯 今週のミッション</div>';
  ms.forEach(function(m){var done=m.cur>=m.tgt,p=Math.round(m.cur/m.tgt*100);
    html+='<div class="gc-m'+(done?' done':'')+'"><span class="gc-mic">'+(done?'✅':m.ic)+'</span><span class="gc-mlab">'+escH(m.label)+'</span>'
      +'<div class="gc-mbw"><div class="gc-mbf" style="width:'+p+'%"></div></div><span class="gc-mc">'+m.cur+'/'+m.tgt+'</span></div>';});
  html+='</div>';
  host.innerHTML=html;
}
function readinessTrendHTML(){
  var rz=(store.rdz||[]).slice(-30);
  if(rz.length<2)return '';
  var W=300,H=70,pad=5;
  var ps=rz.map(function(x){return x.p;});
  var min=Math.min.apply(null,ps),max=Math.max.apply(null,ps);
  min=Math.max(0,Math.min(min,PASS-5));max=Math.min(100,Math.max(max,PASS+5));
  if(max-min<10)max=min+10;
  var xs=function(i){return pad+i*(W-2*pad)/(rz.length-1);};
  var ys=function(p){return pad+(H-2*pad)*(1-(p-min)/(max-min));};
  var d=rz.map(function(x,i){return (i?'L':'M')+xs(i).toFixed(1)+' '+ys(x.p).toFixed(1);}).join(' ');
  var passY=ys(PASS).toFixed(1),last=rz[rz.length-1].p,first=rz[0].p,diff=last-first;
  return '<div class="card"><div class="sec-label" style="margin-top:0">📈 合格確度の推移</div>'
    +'<svg viewBox="0 0 '+W+' '+H+'" class="rdz-svg" preserveAspectRatio="none">'
    +'<line x1="0" y1="'+passY+'" x2="'+W+'" y2="'+passY+'" class="rdz-pass"/>'
    +'<path d="'+d+'" class="rdz-line"/></svg>'
    +'<div class="an-note">直近 '+rz.length+' 点。現在 <b>'+last+'%</b>（合格ライン '+PASS+'%）'+(diff>=0?'・期間 +'+diff+'pt':'・期間 '+diff+'pt')+'。横線＝合格ライン。</div></div>';
}

function caseList(){
  var map={},order=[];
  scopedQ().forEach(function(q){if(q.case){if(!map[q.case]){map[q.case]={id:q.case,scenario:q.scenario||'',qs:[]};order.push(q.case);}map[q.case].qs.push(q);}});
  return order.map(function(id){return map[id];});
}
function openCases(){
  var cs=caseList();
  var ov=document.getElementById('cs-ov');
  if(!ov){ov=document.createElement('div');ov.id='cs-ov';ov.className='nb-ov';ov.addEventListener('click',function(e){if(e.target===ov)closeCases();});document.body.appendChild(ov);}
  var body;
  if(!cs.length){body='<div class="nb-empty">ケーススタディはまだありません。</div>';}
  else{body=cs.map(function(c){return '<div class="nb-item"><div class="scn-tag">📋 ケーススタディ（'+c.qs.length+'問）</div><div class="nb-q" style="font-weight:500">'+escH(c.scenario)+'</div><button class="btn bp" style="width:100%;margin-top:8px" onclick="beginCase(\''+c.id+'\')">この設定で'+c.qs.length+'問に挑戦 →</button></div>';}).join('');}
  ov.innerHTML='<div class="nb-card"><div class="nb-head"><span>📋 ケーススタディ</span><button class="nb-close" onclick="closeCases()">✕</button></div><div class="nb-scroll">'+body+'</div></div>';
  ov.classList.add('show');
}
function closeCases(){var ov=document.getElementById('cs-ov');if(ov)ov.classList.remove('show');}
function beginCase(id){
  var qs=scopedQ().filter(function(q){return q.case===id;});
  if(!qs.length){toast('問題が見つかりません');return;}
  closeCases();
  beginStudyWith(qs);
}

const GUIDE=[
  {cat:'🎓 資格のステップ制', items:[
    {ic:'🔓',name:'資格は順番に解除',desc:'アドミニストレーター→アプリビルダー→デベロッパー→残りを1つずつ。前の資格を「取得済み」にすると次が解除されます。',act:'progress'},
    {ic:'🎓',name:'取得済みにする方法',desc:'ホームの「🎓 資格の取得」カード／マイページ／合格した模試の結果画面から。取得後は学習ロック（取り消せば再開）。',act:'progress'}
  ]},
  {cat:'📖 学習する', items:[
    {ic:'📖',name:'学習モード',desc:'1問ずつ解いて、解説をその場で確認。間違いは自動で復習キューへ。',act:'study'},
    {ic:'💡',name:'段階的ヒント',desc:'解答前に「分野→明らかな誤りを薄く」の順にヒント。学習中の「ヒントを見る」かHキーで。'},
    {ic:'🧠',name:'自分の言葉で説明',desc:'解答後に要点を書くと間違いノートに残り、記憶に定着（Feynman 効果）。'},
    {ic:'⚡',name:'高速めくり総ざらい',desc:'問題→答えをサッと確認。試験前日のチェックに最適。',act:'quick'},
    {ic:'🔍',name:'キーワード検索',desc:'問題文・選択肢・解説を横断検索して、ヒットした問題をそのまま学習。',act:'search'},
    {ic:'📚',name:'教科書',desc:'用語集・設定マップ・比較表。図解つきで体系的に理解。',act:'textbook'},
    {ic:'🔤',name:'用語帳',desc:'フラッシュカードで重要用語を暗記。覚えた／苦手で仕分け。',act:'vocab'}
  ]},
  {cat:'🔁 復習する', items:[
    {ic:'🗓️',name:'デイリーチャレンジ',desc:'毎日10問を自動編成。まずはこれで学習を習慣化。',act:'daily'},
    {ic:'🔁',name:'間違えた問題を復習',desc:'誤答とブックマークをまとめて復習（ホームの「今日やる」から）。'},
    {ic:'🧠',name:'SRS 復習',desc:'忘れる頃に再出題する間隔反復。期日が来た問題を出題（「今日やる」から）。'},
    {ic:'🔂',name:'重点ループ',desc:'何度もつまずく問題を、2連続正解するまで反復して確実に潰す（「今日やる」から）。'},
    {ic:'📓',name:'間違いノート',desc:'誤答・自信なし問題＋理由・要約・メモを1冊に集約。直前の見直しに。',act:'notebook'},
    {ic:'❌',name:'誤答理由タグ',desc:'間違えた理由（知らなかった／ケアレス／迷った）を記録すると傾向を分析できます。'}
  ]},
  {cat:'⏱️ 実力を測る', items:[
    {ic:'⏱️',name:'試験モード',desc:'本番形式60問・時間制限つき。ナビ・フラグ・採点・弱点表示。直近2回の模試に出た問題は出にくくなります。',act:'exam'},
    {ic:'🎛️',name:'カスタム模試',desc:'分野・問題数・時間制限を選んで自分専用の模試。',act:'custom'},
    {ic:'📋',name:'ケーススタディ',desc:'実務シナリオで関連問題を連続で解く実戦形式。',act:'cases'},
    {ic:'🟢',name:'難易度（易/標準/難）',desc:'問題ごとに難易度を表示。出題設定で難易度のしぼり込みもできます。'}
  ]},
  {cat:'📊 分析する（統計）', items:[
    {ic:'🎯',name:'合格可能性・推移',desc:'総合到達度と、合格確度の伸びを折れ線グラフで確認。',act:'stats'},
    {ic:'🔎',name:'弱点の根本原因',desc:'つまずき方・最も弱い分野・時間のかかる分野を診断して助言。'},
    {ic:'🧮',name:'分野×難易度ヒート',desc:'どの分野・難易度で取りこぼしているか一目で。'},
    {ic:'⏱️',name:'学習時間・時間帯',desc:'分野別の学習時間と、正答率の高い「好調な時間帯」。'},
    {ic:'📚',name:'学習カバレッジ',desc:'全問・全分野の網羅率。未着手をまとめて学習できます。'},
    {ic:'📅',name:'学習カレンダー',desc:'日々の学習量をヒートマップで可視化。'}
  ]},
  {cat:'🎮 続ける仕組み', items:[
    {ic:'🎮',name:'XP・レベル',desc:'解くほど経験値がたまりレベルアップ（ホームに表示）。'},
    {ic:'🎯',name:'今週のミッション',desc:'週ごとの目標を達成してXP獲得。達成時は紙吹雪でお祝い。'},
    {ic:'🔥',name:'ストリーク・目標',desc:'連続学習日数と1日の目標問題数。受験日を設定すると逆算ペース（1日ノルマ）も提案。達成でお祝い演出。'},
    {ic:'🏅',name:'実績バッジ',desc:'条件を満たすとバッジを獲得（統計ページで一覧）。',act:'stats'},
    {ic:'🎓',name:'資格取得の記録',desc:'本番に合格したらマイページで「取得済み」に。',act:'mypage'}
  ]},
  {cat:'⚙️ 設定・データ', items:[
    {ic:'🌓',name:'テーマ・文字サイズ',desc:'マイページで配色（ライト/ダーク）と本文サイズを調整。',act:'mypage'},
    {ic:'💾',name:'バックアップ',desc:'進捗をファイルに書き出し／読み込み（端末の移行・消失対策）。',act:'mypage'},
    {ic:'⌨️',name:'キーボード操作',desc:'PCのショートカット一覧（? キーでも開きます）。',act:'shortcut'},
    {ic:'🔔',name:'お知らせ',desc:'新機能の更新履歴をいつでも確認。',act:'news'},
    {ic:'🛠️',name:'不具合・ご意見の報告',desc:'問題の誤りや不具合、要望をアプリ内から送信できます（GitHub不要）。',act:'feedback'},
    {ic:'📲',name:'オフライン／アプリ追加',desc:'圏外でも学習でき、ホーム画面にアプリとして追加できます。'}
  ]}
];
function openGuide(){
  var ov=document.getElementById('guide-ov');
  if(!ov){ov=document.createElement('div');ov.id='guide-ov';ov.className='nb-ov';ov.addEventListener('click',function(e){if(e.target===ov)closeGuide();});document.body.appendChild(ov);}
  var body=GUIDE.map(function(g){
    return '<div class="gd-cat">'+g.cat+'</div>'+g.items.map(function(it){
      return '<div class="gd-item"><span class="gd-ic">'+it.ic+'</span><div class="gd-main"><div class="gd-name">'+escH(it.name)+'</div><div class="gd-desc">'+escH(it.desc)+'</div></div>'+(it.act?'<button class="gd-go" onclick="guideAct(\''+it.act+'\')">開く</button>':'')+'</div>';
    }).join('');
  }).join('');
  ov.innerHTML='<div class="nb-card"><div class="nb-head"><span>❓ 使い方ガイド</span><button class="nb-close" onclick="closeGuide()">✕</button></div><div class="nb-scroll"><div class="gd-intro">このアプリでできることの一覧です。「開く」を押すと実際に試せます。</div><button class="gd-tour" onclick="closeGuide();replayOnboarding()">🎬 はじめての方へ：かんたんツアーを見る</button>'+body+'</div></div>';
  ov.classList.add('show');
}
function closeGuide(){var ov=document.getElementById('guide-ov');if(ov)ov.classList.remove('show');}
function guideAct(a){
  closeGuide();
  try{
    if(a==='study')startStudy();
    else if(a==='quick')startQuick('all');
    else if(a==='search'){goTo('home');setTimeout(function(){var i=document.getElementById('f-text');if(i)i.focus();},80);}
    else if(a==='textbook')goTo('textbook');
    else if(a==='vocab')goTo('vocab');
    else if(a==='daily')startDaily();
    else if(a==='notebook')openNotebook();
    else if(a==='exam')startExam();
    else if(a==='custom')openCustomExam();
    else if(a==='cases')openCases();
    else if(a==='stats')goTo('stats');
    else if(a==='mypage')goTo('mypage');
    else if(a==='shortcut')toggleShortcutHelp(true);
    else if(a==='news')openNews();
    else if(a==='feedback')openFeedback();
    else if(a==='progress'){if(window.SFQ_PROG)SFQ_PROG.openInfo();}
  }catch(e){}
}

function startExam(opts){
  opts=opts||{};
  let universe=scopedQ();
  if(opts.weak){
    const ds=domainStats().filter(d=>d.t>0).sort((a,b)=>a.pct-b.pct).slice(0,3).map(d=>d.code);
    if(ds.length)universe=universe.filter(q=>ds.includes(domainOf(q.id)));
  }else if(opts.domains&&opts.domains.length){
    universe=universe.filter(q=>opts.domains.includes(domainOf(q.id)));
  }
  const custom=!!(opts.n||opts.weak||(opts.domains&&opts.domains.length)||opts.timed===false);
  if(!custom&&scopedQ().length<EXAM_N){toast('問題数が不足しています（出典フィルタを「すべて」にすると増えます）');return;}
  if(!universe.length){toast('対象の問題がありません（条件をゆるめてください）');return;}
  const want=opts.n||EXAM_N;
  eN=Math.min(want,universe.length);
  eTimed=opts.timed!==false;
  eQ=(opts.weak||(opts.domains&&opts.domains.length))?freshFirst(universe).slice(0,eN):pickWeightedExam(eN);
  eCur=0;eAns={};eFlag={};eQTime={};
  eBudget=Math.max(60,Math.round(EXAM_MIN*60*eN/EXAM_N));
  eSecs=eTimed?eBudget:0;
  eDispArr=eQ.map(q=> cshufOn()? shuffle(q.choices.map((_,i)=>i)) : q.choices.map((_,i)=>i));
  clearExamState();
  document.getElementById('e-result').style.display='none';
  document.getElementById('e-area').style.display='block';
  goTo('exam');startTimer();renderEQ();
}
function examQuota(defs,n,stock){
  const list=(defs||[]).filter(d=>d&&d.code);
  const out={};list.forEach(d=>out[d.code]=0);
  if(!list.length||!(n>0))return out;
  const totW=list.reduce((s,d)=>s+(d.weight||0),0);
  if(totW<=0)return out;
  const rem=[];let sum=0;
  list.forEach((d,i)=>{
    const ex=n*(d.weight||0)/totW,fl=Math.floor(ex);
    out[d.code]=fl;sum+=fl;rem.push({i:i,code:d.code,f:ex-fl,w:d.weight||0});
  });
  rem.sort((a,b)=>(b.f-a.f)||(b.w-a.w)||(a.i-b.i));
  for(let k=0;sum<n&&k<rem.length;k++){out[rem[k].code]++;sum++;}
  const cap=c=>Math.max(0,(stock&&stock[c])||0);
  let over=0;
  list.forEach(d=>{const c=cap(d.code);if(out[d.code]>c){over+=out[d.code]-c;out[d.code]=c;}});
  while(over>0){
    const room=list.filter(d=>out[d.code]<cap(d.code));
    if(!room.length)break;
    const w=room.reduce((s,d)=>s+(d.weight||0),0)||room.length;
    let moved=0;
    room.forEach(d=>{
      if(over-moved<=0)return;
      const share=Math.min(cap(d.code)-out[d.code],Math.max(1,Math.round(over*((d.weight||1))/w)),over-moved);
      out[d.code]+=share;moved+=share;
    });
    if(!moved)break;
    over-=moved;
  }
  return out;
}
function pickWeightedExam(n){
  const universe=scopedQ();
  const byD={};DOMAIN_DEFS.forEach(d=>byD[d.code]=[]);
  universe.forEach(q=>{const c=domainOf(q.id);(byD[c]||(byD[c]=[])).push(q);});
  Object.keys(byD).forEach(c=>byD[c]=freshFirst(byD[c]));
  const stock={};Object.keys(byD).forEach(c=>stock[c]=byD[c].length);
  const quota=examQuota(DOMAIN_DEFS,n,stock);
  const picked=[],used=new Set();
  DOMAIN_DEFS.forEach(d=>{
    (byD[d.code]||[]).slice(0,quota[d.code]||0).forEach(q=>{picked.push(q);used.add(q.id);});
  });
  if(picked.length<n){
    const rest=freshFirst(universe.filter(q=>!used.has(q.id)));
    for(const q of rest){if(picked.length>=n)break;picked.push(q);used.add(q.id);}
  }
  return shuffle(picked.slice(0,n));
}
function startTimer(){
  if(eTimer)clearInterval(eTimer);
  tickTimer();
  eTimer=setInterval(()=>{
    if(eQ[eCur])eQTime[eCur]=(eQTime[eCur]||0)+1;
    if(eTimed)eSecs--; else eSecs++;
    tickTimer();
    if(eSecs%5===0)saveExamState();
    if(eTimed&&eSecs<=0){clearInterval(eTimer);eTimer=null;finishExam();}
  },1000);
}
function tickTimer(){
  const s=Math.max(0,eSecs);
  const h=0|s/3600,m=0|(s%3600)/60,sec=s%60;
  const str=h?h+':'+pad(m)+':'+pad(sec):m+':'+pad(sec);
  const el=document.getElementById('e-timer');if(!el)return;
  if(eTimed){el.textContent='⏱ '+str;el.className='timer'+(eSecs<300?' warn':'');}
  else{el.textContent='⏱ '+str+' 経過';el.className='timer';}
}
function pad(n){return String(n).padStart(2,'0');}
function renderEQ(){
  const q=eQ[eCur];const isM=q.answers.length>1;
  setText('e-prog',(eCur+1)+' / '+eN);
  document.getElementById('e-pfill').style.width=((eCur+1)/eN*100)+'%';
  const badge=document.getElementById('e-badge');
  badge.textContent='Q'+(eCur+1)+(isM?' ★ '+q.answers.length+'つ選択':'');
  badge.className='qbadge'+(isM?' mbadge':'');
  setText('e-qtext',q.question);
  setFig('e-qfig',q.fig);
  const saved=eAns[eCur]||[];
  const order=eDispArr[eCur]||q.choices.map((_,i)=>i);
  const cel=document.getElementById('e-choices');cel.innerHTML='';
  order.forEach(oi=>{
    const ch=q.choices[oi],on=saved.includes(oi);
    const item=document.createElement('div');item.className='choice'+(on?' sel':'');item.dataset.oi=oi;
    item.setAttribute('role','button');item.setAttribute('aria-pressed',on?'true':'false');item.tabIndex=0;
    const mark=document.createElement('div');mark.className='cmark';
    mark.textContent=on?(isM?'☑':'●'):(isM?'□':'○');
    const span=document.createElement('span');span.textContent=ch;
    item.appendChild(mark);item.appendChild(span);
    item.addEventListener('click',()=>selEChoice(oi,isM));
    item.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();e.stopPropagation();selEChoice(oi,isM);}});
    cel.appendChild(item);
  });
  document.getElementById('e-prev').disabled=eCur===0;
  document.getElementById('e-next').style.display=eCur===eN-1?'none':'';
  const fb=document.getElementById('e-flag');
  if(fb){const on=!!eFlag[eCur];fb.classList.toggle('on',on);fb.textContent=on?'🚩 見直す':'🚩 後で';}
  renderNavPalette();
  updateFinishLabel();
  saveExamState();
}
function eAnsweredCount(){let n=0;for(let i=0;i<eN;i++){if((eAns[i]||[]).length>0)n++;}return n;}
function toggleEFlag(){eFlag[eCur]=!eFlag[eCur];renderEQ();}
function eJump(i){closeExamSheet();eCur=Math.max(0,Math.min(eN-1,i));renderEQ();window.scrollTo({top:0,behavior:'smooth'});}
function updateFinishLabel(){
  const b=document.getElementById('e-finish');if(!b)return;
  b.innerHTML='📝 採点する<span class="finish-cnt">'+eAnsweredCount()+'/'+eN+' 回答</span>';
}
function renderNavPalette(){
  const host=document.getElementById('e-navpal');if(!host)return;
  const done=eAnsweredCount();
  let h='<div class="navpal-head"><span>問題一覧</span><span class="navpal-cnt">'+done+' / '+eN+' 回答済</span></div>';
  h+='<div class="navgrid">';
  for(let i=0;i<eN;i++){
    let cls='ncell';
    if((eAns[i]||[]).length>0)cls+=' answered';
    if(i===eCur)cls+=' current';
    if(eFlag[i])cls+=' flagged';
    h+='<button type="button" class="'+cls+'" onclick="eJump('+i+')">'+(i+1)+'</button>';
  }
  h+='</div>';
  h+='<div class="navlegend"><span><i class="lg a"></i>回答済</span><span><i class="lg"></i>未回答</span><span><i class="lg c"></i>現在</span><span><i class="lg f"></i>🚩フラグ</span></div>';
  host.innerHTML=h;
}
function selEChoice(idx,isM){
  if(!eAns[eCur])eAns[eCur]=[];
  const s=eAns[eCur];const need=eQ[eCur].answers.length;
  if(isM){const p=s.indexOf(idx);if(p>=0)s.splice(p,1);else{if(s.length>=need){toast(need+'つまで選べます');return;}s.push(idx);}}
  else eAns[eCur]=[idx];
  renderEQ();
}
function eNav(d){eCur=Math.max(0,Math.min(eN-1,eCur+d));renderEQ();}
function confirmFinishExam(){
  const unans=[];for(let i=0;i<eN;i++){if((eAns[i]||[]).length===0)unans.push(i);}
  let flags=0;for(let i=0;i<eN;i++){if(eFlag[i])flags++;}
  if(unans.length===0&&flags===0){finishExam();return;}
  showExamSheet(unans,flags);
}
function showExamSheet(unans,flags){
  let dim=document.getElementById('e-sheet-dim');
  if(!dim){
    dim=document.createElement('div');dim.id='e-sheet-dim';dim.className='e-sheet-dim';
    dim.addEventListener('click',e=>{if(e.target===dim)closeExamSheet();});
    dim.innerHTML='<div class="e-sheet" role="dialog" aria-modal="true">'
      +'<h3>採点する前に確認</h3>'
      +'<p class="e-sheet-sub">未回答のまま採点すると不正解扱いになります。</p>'
      +'<div class="e-sheet-pills" id="e-sheet-pills"></div>'
      +'<div id="e-sheet-jump"></div>'
      +'<div class="e-sheet-btns"><button type="button" class="btn bg" onclick="closeExamSheet()">戻って見直す</button>'
      +'<button type="button" class="btn bd" onclick="closeExamSheet();finishExam()">このまま採点する</button></div>'
      +'</div>';
    document.body.appendChild(dim);
  }
  let pills='';
  pills+='<div class="e-wpill un"><span class="n">'+unans.length+'</span>問 未回答</div>';
  pills+='<div class="e-wpill fl"><span class="n">'+flags+'</span>問 🚩フラグ</div>';
  document.getElementById('e-sheet-pills').innerHTML=pills;
  const jw=document.getElementById('e-sheet-jump');
  if(unans.length){
    let h='<div class="e-jump-label">未回答にジャンプ（タップ）</div><div class="e-jump-wrap">';
    unans.forEach(i=>{h+='<button type="button" class="e-jumpchip" onclick="eJump('+i+')">Q'+(i+1)+'</button>';});
    h+='</div>';jw.innerHTML=h;
  }else jw.innerHTML='';
  dim.classList.add('open');
}
function closeExamSheet(){const d=document.getElementById('e-sheet-dim');if(d)d.classList.remove('open');}
function renderWeakCallout(byd){
  const host=document.getElementById('e-weak-callout');if(!host)return;
  const weak=DOMAIN_DEFS.filter(d=>{const b=byd[d.code];return b&&b.t&&Math.round(b.c/b.t*100)<PASS;});
  if(!weak.length){host.innerHTML='<div class="e-callout ok">🎉 全分野で合格ラインを超えています！</div>';return;}
  const names=weak.map(d=>d.name).join('・');
  host.innerHTML='<div class="e-callout">弱点は <b>'+escH(names)+'</b>。'
    +'<button type="button" class="e-callout-btn" onclick="startWeakDomains()">弱点分野を出題 →</button></div>';
}
function renderScoreRing(pct,pass){
  const host=document.getElementById('e-ring');if(!host){setText('e-pct',pct+'%');return;}
  const r=68,c=2*Math.PI*r,off=c*(1-pct/100);
  const col=pass?'var(--success)':'var(--danger)';
  host.innerHTML='<svg width="160" height="160" viewBox="0 0 160 160">'
    +'<circle cx="80" cy="80" r="'+r+'" fill="none" stroke="var(--border)" stroke-width="14"/>'
    +'<circle cx="80" cy="80" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="14" stroke-linecap="round" '
    +'stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'" transform="rotate(-90 80 80)"/>'
    +'</svg><div class="ring-num"><span class="big" id="e-pct" style="color:'+col+'">'+pct+'%</span><span class="lab">正答率</span></div>';
}
function finishExam(){
  if(eTimer){clearInterval(eTimer);eTimer=null;}
  closeExamSheet();
  let ok=0;const byd={};
  eQ.forEach((q,i)=>{
    const sel=(eAns[i]||[]).map(idx=>q.choices[idx]);
    const isOk=arrEq(sel.slice().sort(),q.answers.slice().sort());
    if(isOk)ok++;
    const c=domainOf(q.id);if(!byd[c])byd[c]={c:0,t:0};byd[c].t++;if(isOk)byd[c].c++;
    recH(q.id,isOk,false,{defer:true});
  });
  const pct=Math.round(ok/eN*100),pass=pct>=PASS;
  const secsUsed=eTimed?(eBudget-Math.max(0,eSecs)):Math.max(0,eSecs);
  if(!store.exams)store.exams=[];
  store.exams.push({ts:Date.now(),pct:pct,ok:ok,n:eN,pass:pass,byd:byd,secsUsed:secsUsed,custom:(eN!==EXAM_N||!eTimed)});
  if(store.exams.length>50)store.exams=store.exams.slice(-50);
  try{pushRecentExam(eQ.map(q=>q.id));}catch(e){}
  store.xp=(store.xp||0)+30+(pass?100:0);
  save();
  checkBadges();
  try{maybeGoalCheer();}catch(e){}
  try{checkMissions();}catch(e){}
  if(pass)try{celebrate();}catch(e){}
  document.getElementById('e-area').style.display='none';
  document.getElementById('e-result').style.display='block';
  renderScoreRing(pct,pass);
  setText('e-detail',eN+'問中 '+ok+'問正解'+(eTimed?'':' ・ 時間無制限'));
  const pill=document.getElementById('e-pill');
  pill.textContent=(pass?'合格 🎉':'不合格 📖')+'（合格ライン '+PASS+'%）';
  pill.className='pass-pill '+(pass?'pass':'fail');
  renderExamDomains(byd);
  renderWeakCallout(byd);
  renderExamAcq(pass);
  eWrongOnly=false;
  const wt=document.getElementById('e-wrong-toggle');if(wt)wt.classList.remove('on');
  renderExamResultList();
  renderPaceCard(secsUsed);
  clearExamState();
}
function renderExamDomains(byd){
  const host=document.getElementById('e-domains');if(!host)return;host.innerHTML='';
  DOMAIN_DEFS.forEach(d=>{
    const b=byd[d.code];if(!b||!b.t)return;
    const pct=Math.round(b.c/b.t*100);
    const col=pct>=PASS?'var(--success)':pct>=50?'var(--warning)':'var(--danger)';
    const row=document.createElement('div');row.className='edom-row';
    row.innerHTML='<span class="dom-emoji">'+d.emoji+'</span>'
      +'<span class="dom-name">'+escH(d.name)+'</span>'
      +'<div class="dom-bw"><div class="dom-bf" style="width:'+pct+'%;background:'+col+'"></div></div>'
      +'<span class="dom-pct" style="color:'+col+'">'+pct+'%<span class="dom-frac">'+b.c+'/'+b.t+'</span></span>';
    host.appendChild(row);
  });
}
function renderExamResultList(){
  const list=document.getElementById('e-rlist');list.innerHTML='';
  let shown=0;
  eQ.forEach((q,i)=>{
    const sel=(eAns[i]||[]).map(idx=>q.choices[idx]);
    const isOk=arrEq(sel.slice().sort(),q.answers.slice().sort());
    if(eWrongOnly&&isOk)return;
    shown++;
    const wrap=document.createElement('div');wrap.className='erow-wrap';
    const row=document.createElement('div');row.className='erow';
    const _t=eQTime[i]||0;
    row.innerHTML='<span class="erow-ic">'+(isOk?'✅':'❌')+'</span>'
      +'<span class="erow-q">Q'+(i+1)+'. '+escH(q.question)+'</span>'
      +(_t?'<span class="erow-time">'+fmtSec(_t)+'</span>':'')
      +'<span class="erow-ar">▾</span>';
    const det=document.createElement('div');det.className='erow-det';
    row.addEventListener('click',()=>{
      const open=wrap.classList.toggle('open');
      if(open&&!det.dataset.built){det.innerHTML=examReviewHTML(q,i,isOk);det.dataset.built='1';}
    });
    wrap.appendChild(row);wrap.appendChild(det);list.appendChild(wrap);
  });
  if(shown===0){list.innerHTML='<div style="text-align:center;color:var(--text-sub);font-size:13px;padding:20px 0">🎉 間違えた問題はありません！</div>';}
}
function examReviewHTML(q,i,isOk){
  const sel=eAns[i]||[];
  const isM=q.answers.length>1;
  let h='<div class="erev-q">'+escH(q.question)+(isM?'<span class="erev-multi">★ '+q.answers.length+'つ選択</span>':'')+'</div>';
  h+='<div class="erev-choices">';
  q.choices.forEach((ch,idx)=>{
    const isSel=sel.includes(idx),isAns=q.answers.includes(ch);
    let cls='erev-c',ic=isM?'□':'○';
    if(isAns){cls+=' c-correct';ic='✓';}
    else if(isSel){cls+=' c-wrong';ic='✗';}
    h+='<div class="'+cls+'"><span class="erev-cm">'+ic+'</span><span class="erev-ct">'+escH(ch)+'</span>'+(isSel?'<span class="erev-you">あなたの解答</span>':'')+'</div>';
  });
  h+='</div>';
  h+='<div class="erev-exp '+(isOk?'exp-ok':'exp-ng')+'"><div class="exp-head"><span>'+(isOk?'✅':'❌')+'</span><span>'+(isOk?'正解':'不正解')+'</span></div><div style="white-space:pre-wrap">'+escH(q.explanation||'解説なし')+'</div>';
  if(q.expFig||q.fig)h+=figHTML(q.expFig||q.fig);
  if(q.reference_url)h+='<br><a class="reflink" href="'+q.reference_url+'" target="_blank">🔗 Salesforce ヘルプを見る</a>';
  h+='<div style="margin-top:10px"><button class="btn bg btn-sm" style="width:auto" onclick="event.stopPropagation();jumpQ('+q.id+')">この問題を学習 →</button></div>';
  h+='</div>';
  return h;
}
function toggleExamWrong(){
  eWrongOnly=!eWrongOnly;
  const wt=document.getElementById('e-wrong-toggle');if(wt)wt.classList.toggle('on',eWrongOnly);
  renderExamResultList();
}

function startReview(){
  const bad=scopedQ().filter(q=>needsReview(q.id)||isBm(q.id));
  if(!bad.length){toast('復習する問題がありません');return;}
  beginStudyWith(shuffle(bad));
}
function startWeakDomains(){
  const ds=domainStats();
  const ranked=ds.filter(d=>d.t>0).sort((a,b)=>a.pct-b.pct);
  if(!ranked.length){toast('まず何問か解いてください');return;}
  const weak=ranked.slice(0,3).map(d=>d.code);
  const pool=scopedQ().filter(q=>weak.includes(domainOf(q.id)));
  if(!pool.length){toast('対象の問題がありません');return;}
  beginStudyWith(shuffle(pool));
  toast('🎯 弱点分野を出題: '+weak.map(c=>domainDef(c).name).join('・'));
}

function renderStats(){
  renderStatsSummary();
  renderCoverage();
  renderAnalysis();
  renderHeatmap();
  renderWeekly();renderDomainList();renderBadges();
  const allH=store.hist;let tc=0,tw=0;
  Object.values(allH).forEach(h=>{tc+=h.c;tw+=h.w;});
  const tt=tc+tw;
  setText('st2-total',tt);
  setText('st2-acc',tt?Math.round(tc/tt*100)+'%':'—');
  setText('st2-streak',store.streak||0);
  const kws={};
  allQ.forEach(q=>{const h=getH(q.id);(q.keywords||[]).forEach(k=>{if(!kws[k])kws[k]={c:0,w:0};kws[k].c+=h.c;kws[k].w+=h.w;});});
  const kwList=Object.entries(kws).filter(([,v])=>v.c+v.w>0).sort((a,b)=>{const pa=a[1].c/(a[1].c+a[1].w),pb=b[1].c/(b[1].c+b[1].w);return pa-pb;});
  const kwEl=document.getElementById('st-kw');kwEl.innerHTML='';
  if(!kwList.length){kwEl.innerHTML='<div style="color:var(--text-sub);font-size:13px;padding:16px 0;text-align:center">まだデータがありません</div>';}
  kwList.forEach(([kw,h])=>{
    const t=h.c+h.w,pct=Math.round(h.c/t*100);
    const col=pct>=80?'var(--success)':pct>=60?'var(--warning)':'var(--danger)';
    const row=document.createElement('div');row.className='kw-row';
    row.innerHTML='<span class="kw-name">'+escH(kw)+'</span><div class="kw-bw"><div class="kw-bf" style="width:'+pct+'%;background:'+col+'"></div></div><span class="kw-pct" style="color:'+col+'">'+pct+'%</span>';
    kwEl.appendChild(row);
  });
  const qList=document.getElementById('st-q');qList.innerHTML='';
  const answered=allQ.filter(q=>{const h=getH(q.id);return h.c+h.w>0;});
  if(!answered.length){qList.innerHTML='<div style="color:var(--text-sub);font-size:13px;padding:16px 0;text-align:center">まだデータがありません</div>';return;}
  answered.sort((a,b)=>{const ha=getH(a.id),hb=getH(b.id);return ha.c/(ha.c+ha.w)-hb.c/(hb.c+hb.w);});
  answered.forEach(q=>{
    const h=getH(q.id),t=h.c+h.w,pct=Math.round(h.c/t*100);
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;cursor:pointer';
    row.innerHTML='<span style="color:var(--text-sub);flex-shrink:0">Q'+q.id+(isBm(q.id)?' ★':'')+'</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escH(q.question.slice(0,40))+'</span><span style="color:'+(pct>=70?'var(--success)':'var(--danger)')+';font-weight:700;flex-shrink:0">'+pct+'%</span>';
    row.onclick=()=>jumpQ(q.id);qList.appendChild(row);
  });
}

function renderAnalysis(){
  const host=document.getElementById('analysis');if(!host)return;
  const html=readinessTrendHTML()+rootCauseHTML()+diffHeatHTML()+timeHTML()+calibHTML();
  host.innerHTML=html;
}
function rootCauseHTML(){
  const insights=[];
  const reasons={unknown:0,careless:0,narrow:0};let rTot=0;
  Object.values(store.hist).forEach(h=>{ if(h&&h.wr&&h.last==='w'){reasons[h.wr]=(reasons[h.wr]||0)+1;rTot++;} });
  if(rTot>=3){
    const top=Object.entries(reasons).sort((a,b)=>b[1]-a[1])[0];
    const lab={unknown:'知らなかった',careless:'ケアレスミス',narrow:'2択で迷った'};
    const adv={unknown:'まず教科書・用語集で基礎を固めましょう。',careless:'解答前に設問の条件（最上級・否定・複数選択）を一呼吸おいて確認を。',narrow:'迷った論点は「違いの一言」を間違いノートに残すと定着します。'};
    if(top[1]>0)insights.push('❌ 誤答の傾向: <b>'+lab[top[0]]+'</b> が最多（'+top[1]+'件）。'+adv[top[0]]);
  }
  const ds=domainStats().filter(d=>d.t>=3).sort((a,b)=>a.pct-b.pct);
  if(ds.length){const w=ds[0];if(w.pct<70)insights.push('🎯 最も弱い分野: <b>'+escH(domainDef(w.code).name)+'</b>（'+w.pct+'%）。<button class="an-act" onclick="startWeakDomains()">弱点を出題 →</button>');}
  const t=store.time||{};
  if(t.dom){
    const per=[];Object.entries(t.dom).forEach(([code,v])=>{if(v&&v.n>=3)per.push({code,avg:v.sec/v.n});});
    if(per.length>=2){per.sort((a,b)=>b.avg-a.avg);const s=per[0];if(s.avg>=25)insights.push('🐢 時間がかかる分野: <b>'+escH(domainDef(s.code).name)+'</b>（1問平均 '+Math.round(s.avg)+'秒）。反射的に解けるよう反復を。');}
  }
  if(!insights.length)return '';
  return '<div class="card"><div class="sec-label" style="margin-top:0">🔎 弱点の根本原因</div><ul class="an-ins">'+insights.map(i=>'<li>'+i+'</li>').join('')+'</ul></div>';
}
function timeHTML(){
  const t=store.time||{tot:0,dom:{},hour:{}};
  if(!t.tot)return '';
  const fmtM=s=>{s=Math.round(s||0);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?(h+'時間'+m+'分'):(m?(m+'分'):(s+'秒'));};
  const doms=Object.entries(t.dom||{}).map(([code,v])=>[code,(v&&v.sec)||0]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxD=doms.length?doms[0][1]:1;let domBars='';
  doms.forEach(pair=>{const def=domainDef(pair[0]);domBars+='<div class="an-row"><span class="an-lab">'+escH(def.emoji+' '+def.name)+'</span><div class="an-bw"><div class="an-bf" style="width:'+Math.round(pair[1]/maxD*100)+'%;background:var(--primary)"></div></div><span class="an-pct">'+fmtM(pair[1])+'</span></div>';});
  const hours=Object.entries(t.hour||{}).map(e=>({h:+e[0],c:e[1].c||0,w:e[1].w||0})).map(x=>({h:x.h,c:x.c,w:x.w,t:x.c+x.w})).filter(x=>x.t>=3);
  let hourNote='';
  if(hours.length>=2){
    hours.forEach(x=>x.pct=Math.round(x.c/x.t*100));
    const best=hours.slice().sort((a,b)=>b.pct-a.pct)[0],worst=hours.slice().sort((a,b)=>a.pct-b.pct)[0];
    if(best.h!==worst.h)hourNote='⏰ 好調な時間帯: <b>'+best.h+'時台</b>（'+best.pct+'%）／不調: '+worst.h+'時台（'+worst.pct+'%）';
  }
  return '<div class="card"><div class="sec-label" style="margin-top:0">⏱️ 学習時間（総 '+fmtM(t.tot)+'）</div>'
    +(domBars||'<div class="an-note">分野別の学習時間がここに表示されます。</div>')
    +(hourNote?'<div class="an-note">'+hourNote+'</div>':'')+'</div>';
}
function calibHTML(){
  let cy={c:0,w:0},cn={c:0,w:0};
  Object.values(store.hist).forEach(h=>{
    if(!h||!h.last)return;const ok=h.last==='c';
    if(h.lc===1){if(ok)cn.c++;else cn.w++;}else{if(ok)cy.c++;else cy.w++;}
  });
  const ty=cy.c+cy.w,tn=cn.c+cn.w;
  if(ty+tn===0)return '';
  const py=ty?Math.round(cy.c/ty*100):0,pn=tn?Math.round(cn.c/tn*100):0;
  const bar=(label,p,tt,col)=>'<div class="an-row"><span class="an-lab">'+label+' <span class="an-n">'+tt+'問</span></span><div class="an-bw"><div class="an-bf" style="width:'+(tt?p:0)+'%;background:'+col+'"></div></div><span class="an-pct" style="color:'+col+'">'+(tt?p+'%':'—')+'</span></div>';
  let diag;
  if(ty>=5&&py<70)diag='⚠️ 「自信あり」でも正答率が'+py+'%。思い込みに注意し根拠まで確認を（過信ぎみ）。';
  else if(tn>=5&&pn>=80)diag='💡 「自信なし」でも'+pn+'%正解。知識は付いています、自信を持ってOK（過小評価ぎみ）。';
  else if(ty>=5&&tn>=5&&(py-pn)>=25)diag='✅ 自信と正答がよく一致。自己評価は正確です。';
  else diag='自信あり／なしで正答率を比べ、自己評価のズレを見ます（直近の解答ベース）。';
  return '<div class="card"><div class="sec-label" style="margin-top:0">🎯 自信と正答（キャリブレーション）</div>'
    +bar('😎 自信あり',py,ty,py>=70?'var(--success)':'var(--danger)')
    +bar('🤔 自信なし',pn,tn,'var(--warning)')
    +'<div class="an-note">'+diag+'</div></div>';
}
function diffHeatHTML(){
  const agg={};let any=false;
  scopedQ().forEach(function(q){const h=store.hist[q.id];if(!h)return;const t=(h.c||0)+(h.w||0);if(!t)return;any=true;const dom=domainOf(q.id),b=qDiff(q);agg[dom]=agg[dom]||{};agg[dom][b]=agg[dom][b]||{c:0,w:0};agg[dom][b].c+=h.c||0;agg[dom][b].w+=h.w||0;});
  if(!any)return '';
  const cell=function(o){if(!o||(o.c+o.w)===0)return '<td class="dh-cell dh-na">—</td>';const p=Math.round(o.c/(o.c+o.w)*100);const col=p>=80?'var(--success)':p>=60?'var(--warning)':'var(--danger)';return '<td class="dh-cell" style="background:'+col+'">'+p+'</td>';};
  let rows='';
  DOMAIN_DEFS.forEach(function(d){const a=agg[d.code];if(!a)return;rows+='<tr><td class="dh-dom">'+escH(d.emoji+' '+d.name)+'</td>'+cell(a[1])+cell(a[2])+cell(a[3])+'</tr>';});
  if(!rows)return '';
  return '<div class="card"><div class="sec-label" style="margin-top:0">🧮 分野×難易度（正答率）</div>'
    +'<table class="dh-table"><thead><tr><th></th><th>易</th><th>標準</th><th>難</th></tr></thead><tbody>'+rows+'</tbody></table>'
    +'<div class="an-note">セル＝その分野・難易度での正答率。難で苦戦＝理解不足、易で取りこぼし＝注意不足のサイン。難易度はデータ設定値（未設定は正答率から推定）。</div></div>';
}

function renderStatsSummary(){
  const host=document.getElementById('stats-summary');if(!host)return;
  const ds=domainStats().filter(d=>d.t>0);
  if(!ds.length){host.innerHTML='';return;}
  let g=0,y=0,r=0;
  ds.forEach(d=>{if(d.pct>=PASS)g++;else if(d.pct>=50)y++;else r++;});
  let tc=0,tt=0;Object.values(store.hist).forEach(h=>{tc+=h.c;tt+=h.c+h.w;});
  const overall=tt?Math.round(tc/tt*100):0,pass=overall>=PASS;
  const col=pass?'var(--success)':overall>=PASS-10?'var(--warning)':'var(--danger)';
  const label=pass?'合格圏に到達':overall>=PASS-10?'合格まであと少し':'基礎固めが必要';
  const c=2*Math.PI*19,off=c*(1-overall/100);
  const weak=ds.filter(d=>d.pct<50).map(d=>domainDef(d.code).name);
  host.innerHTML='<div class="card"><div class="stat-summary">'
    +'<div class="ss-ring"><svg width="54" height="54" viewBox="0 0 54 54">'
    +'<circle cx="27" cy="27" r="19" fill="none" stroke="var(--border)" stroke-width="6"/>'
    +'<circle cx="27" cy="27" r="19" fill="none" stroke="'+col+'" stroke-width="6" stroke-linecap="round" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'" transform="rotate(-90 27 27)"/>'
    +'</svg><div class="ss-t" style="color:'+col+'">'+overall+'%</div></div>'
    +'<div><div class="ss-lab">'+label+'</div><div class="ss-sub">総合到達度（合格ライン '+PASS+'%）</div></div></div>'
    +'<div class="ss-pills"><div class="ss-pill g"><div class="n">'+g+'</div><div class="l">合格圏</div></div>'
    +'<div class="ss-pill y"><div class="n">'+y+'</div><div class="l">あと一歩</div></div>'
    +'<div class="ss-pill r"><div class="n">'+r+'</div><div class="l">要強化</div></div></div>'
    +(weak.length?'<div class="ss-note">要強化：<b>'+escH(weak.join('・'))+'</b> <button class="dom-focus-btn" onclick="startWeakDomains()">弱点を出題 →</button></div>':'')
    +'</div>';
}

function domainStats(){
  const agg={};DOMAIN_DEFS.forEach(d=>agg[d.code]={code:d.code,c:0,w:0});
  allQ.forEach(q=>{const c=domainOf(q.id),h=store.hist[q.id];if(!agg[c])agg[c]={code:c,c:0,w:0};if(h){agg[c].c+=h.c||0;agg[c].w+=h.w||0;}});
  return DOMAIN_DEFS.map(d=>{const a=agg[d.code]||{c:0,w:0};const t=a.c+a.w;return{code:d.code,c:a.c,w:a.w,t:t,pct:t?Math.round(a.c/t*100):0};});
}
function renderDomainList(){
  const host=document.getElementById('dom-list');if(!host)return;host.innerHTML='';
  const ds=domainStats();
  const poolCnt={}; allQ.forEach(q=>{const c=domainOf(q.id);poolCnt[c]=(poolCnt[c]||0)+1;});
  const poolN=allQ.length||1;
  ds.forEach(d=>{
    const def=domainDef(d.code),answered=d.t>0;
    const col=!answered?'var(--border)':d.pct>=80?'var(--success)':d.pct>=60?'var(--warning)':'var(--danger)';
    const cur=Math.round((poolCnt[d.code]||0)*100/poolN);
    const gap=cur-def.weight;
    const gapTxt=Math.abs(gap)>=5?(gap>0?' <span style="color:var(--warning)">（プール+'+gap+')</span>':' <span style="color:var(--danger)">（プール'+gap+'）</span>'):'';
    const row=document.createElement('div');row.className='dom-row';
    row.innerHTML='<span class="dom-emoji">'+def.emoji+'</span>'
      +'<span class="dom-name">'+escH(def.name)+'<span class="dn-sub"> ・公式'+def.weight+'% / 現'+cur+'%'+gapTxt+'</span></span>'
      +'<div class="dom-bw"><div class="dom-bf" style="width:'+(answered?d.pct:0)+'%;background:'+col+'"></div></div>'
      +'<span class="dom-pct" style="color:'+(answered?col:'var(--text-sub)')+'">'+(answered?d.pct+'%':'—')+'</span>';
    host.appendChild(row);
  });
  const note=document.createElement('div');
  note.style.cssText='font-size:11px;color:var(--text-sub);margin-top:6px;line-height:1.5';
  note.innerHTML='公式 = 試験の出題比率　／　現 = 現在のプールでの分野割合。試験モードは公式比で出題するので、現%が小さい分野ほど同じ問題が反復されやすい。';
  host.appendChild(note);
  const btn=document.getElementById('dom-focus-all');if(btn)btn.disabled=!ds.some(d=>d.t>0);
}

function _fmtD(x){return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}
function dayStreak(){
  const daily=store.daily||{};let n=0;const d=new Date();d.setHours(0,0,0,0);
  if(!daily[_fmtD(d)])d.setDate(d.getDate()-1);
  while(daily[_fmtD(d)]){n++;d.setDate(d.getDate()-1);}
  return n;
}
function renderStreakBanner(){
  const n=dayStreak();
  const hs=document.getElementById('hh-streak');
  if(hs){ if(n>=1){hs.style.display='';hs.textContent='🔥 '+n+'日連続';} else hs.style.display='none'; return; }
}
const OB_VERSION='2';
const OB_STEPS=[
  {ic:'🎉',t:'ようこそ！',d:'このアプリひとつで合格まで。「学ぶ → 実力を測る → 復習で定着 → 続ける」をまるごとサポートします。まずは流れを30秒で。'},
  {ic:'📖',t:'学ぶ',d:'学習モードは1問ずつ解いて、解説で「なぜ正解／不正解か」を確認。迷ったらヒント、教科書・用語帳・高速めくりも使えます。'},
  {ic:'⏱️',t:'実力を測る',d:'本番形式の試験、分野や問題数を選ぶカスタム模試、実務シナリオのケーススタディで合格力をチェックできます。'},
  {ic:'🔁',t:'復習で定着',d:'間違えた問題は自動で復習キューへ。間違いノート・重点ループ・SRS・デイリーチャレンジで、間違えるほど賢くなります。'},
  {ic:'🎮',t:'続ける＆ぜんぶ見る',d:'XP・レベルや今週のミッションで楽しく継続。統計で弱点も丸わかり。すべての機能は「使い方ガイド」でいつでも確認できます。'}
];
let _obI=0;
function maybeOnboard(){
  try{if(localStorage.getItem('sfq_onboarded')===OB_VERSION)return;}catch(e){return;}
  _obI=0;showOnboard();
}
function replayOnboarding(){_obI=0;showOnboard();}
function showOnboard(){
  let dim=document.getElementById('ob-dim');
  if(!dim){
    dim=document.createElement('div');dim.id='ob-dim';
    dim.style.cssText='position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:24px';
    dim.innerHTML='<div id="ob-card" style="background:var(--card);color:var(--text);border-radius:16px;max-width:340px;width:100%;padding:24px 20px;box-shadow:0 12px 40px rgba(0,0,0,.35);text-align:center"></div>';
    document.body.appendChild(dim);
  }
  obRender();
}
function obRender(){
  const c=document.getElementById('ob-card');if(!c)return;const s=OB_STEPS[_obI];
  let dots='';for(let i=0;i<OB_STEPS.length;i++){dots+='<span style="height:7px;border-radius:4px;background:'+(i===_obI?'var(--primary)':'var(--border)')+';width:'+(i===_obI?'18px':'7px')+'"></span>';}
  const last=_obI===OB_STEPS.length-1;
  c.innerHTML='<div style="font-size:46px;margin-bottom:8px">'+s.ic+'</div>'
    +'<div style="font-size:17px;font-weight:800;margin-bottom:8px">'+escH(s.t)+'</div>'
    +'<div style="font-size:13px;color:var(--text-sub);line-height:1.7;margin-bottom:18px">'+escH(s.d)+'</div>'
    +'<div style="display:flex;gap:6px;justify-content:center;margin-bottom:18px">'+dots+'</div>'
    +(last?'<button onclick="obClose();openGuide()" style="width:100%;background:var(--primary-light);color:var(--primary-dark);border:1px solid var(--primary);border-radius:8px;font-size:13px;font-weight:700;padding:10px;cursor:pointer;margin-bottom:12px">📖 使い方ガイドで全機能を見る</button>':'')
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">'
    +'<button onclick="obClose()" style="background:none;border:none;color:var(--text-sub);font-size:13px;cursor:pointer">スキップ</button>'
    +'<button onclick="obNext()" style="background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;padding:10px 20px;cursor:pointer">'+(last?'はじめる 🚀':'次へ →')+'</button>'
    +'</div>';
}
function obNext(){if(_obI<OB_STEPS.length-1){_obI++;obRender();}else obClose();}
function obClose(){try{localStorage.setItem('sfq_onboarded',OB_VERSION);}catch(e){}const d=document.getElementById('ob-dim');if(d)d.remove();}
function renderWeekly(){
  const host=document.getElementById('weekly');if(!host)return;
  const daily=store.daily||{};
  const sumRange=(start,days)=>{let s=0;const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-start);for(let i=0;i<days;i++){s+=daily[_fmtD(d)]||0;d.setDate(d.getDate()-1);}return s;};
  const thisWk=sumRange(0,7),lastWk=sumRange(7,7),diff=thisWk-lastWk;
  let studyDays=0;{const d=new Date();d.setHours(0,0,0,0);for(let i=0;i<7;i++){if(daily[_fmtD(d)])studyDays++;d.setDate(d.getDate()-1);}}
  const ds=domainStats().filter(d=>d.t>0).sort((a,b)=>a.pct-b.pct);
  const weak=ds.slice(0,2).map(d=>domainDef(d.code).name+'('+d.pct+'%)');
  const due=(typeof srsDueCount==='function')?srsDueCount():0;
  let h='<div class="wk-grid">';
  h+='<div class="wk-cell"><div class="wn">'+thisWk+'</div><div class="wl">今週の解答数</div>'
    +'<div class="wd '+(diff>=0?'wk-up':'wk-down')+'">'+(diff>=0?'▲ +'+diff:'▼ '+diff)+' vs 先週</div></div>';
  h+='<div class="wk-cell"><div class="wn">'+studyDays+'<span style="font-size:13px">/7</span></div><div class="wl">学習した日数</div>'
    +'<div class="wd">🔥 連続 '+dayStreak()+'日</div></div>';
  h+='</div>';
  h+='<div class="wk-weak">📌 SRS復習待ち <b>'+due+'</b> 問';
  if(weak.length)h+='　／　弱点: <b>'+escH(weak.join('・'))+'</b>';
  h+='</div>';
  host.innerHTML=h;
}

const BADGES=[
  {id:'first',emoji:'🌱',title:'はじめの一歩',desc:'1問解答',test:s=>totalAnswered()>=1},
  {id:'q50',emoji:'📗',title:'50問',desc:'累計50問',test:s=>totalAnswered()>=50},
  {id:'q100',emoji:'📘',title:'100問',desc:'累計100問',test:s=>totalAnswered()>=100},
  {id:'qall',emoji:'📚',title:'全問挑戦',desc:'全問に挑戦',test:s=>answeredCount()>=allQ.length},
  {id:'acc80',emoji:'🎯',title:'高正答率',desc:'正答率80%(50問+)',test:s=>{const a=accStats();return a.t>=50&&a.pct>=80;}},
  {id:'streak10',emoji:'🔥',title:'10連正解',desc:'連続10問正解',test:s=>(s.streak||0)>=10},
  {id:'days3',emoji:'📅',title:'3日連続',desc:'3日連続学習',test:s=>dayStreak()>=3},
  {id:'days7',emoji:'🗓️',title:'7日連続',desc:'7日連続学習',test:s=>dayStreak()>=7},
  {id:'pass1',emoji:'🏆',title:'模試合格',desc:'模試で合格',test:s=>(s.exams||[]).some(e=>e.pass)},
  {id:'domAll',emoji:'🧠',title:'全分野80%',desc:'全分野80%(各5問+)',test:s=>domainStats().every(d=>d.t>=5&&d.pct>=80)},
  {id:'vocab50',emoji:'🔤',title:'用語50',desc:'50用語を習得',test:s=>Object.values(s.vm||{}).filter(v=>v>=2).length>=50},
];
function totalAnswered(){let t=0;Object.values(store.hist).forEach(h=>{t+=(h.c||0)+(h.w||0);});return t;}
function answeredCount(){return Object.keys(store.hist).filter(id=>{const h=store.hist[id];return (h.c||0)+(h.w||0)>0;}).length;}
function accStats(){let c=0,w=0;Object.values(store.hist).forEach(h=>{c+=h.c||0;w+=h.w||0;});const t=c+w;return{c:c,w:w,t:t,pct:t?Math.round(c/t*100):0};}
function safeTest(b){try{return b.test(store);}catch(e){return false;}}
function checkBadges(){
  if(!store.badges)store.badges={};let last=null;
  BADGES.forEach(b=>{if(!store.badges[b.id]&&safeTest(b)){store.badges[b.id]=_today();last=b;store.xp=(store.xp||0)+30;}});
  if(last){save();try{celebrate();}catch(e){}toast('🏅 バッジ獲得: '+last.title+' +30XP');}
}
function renderBadges(){
  const host=document.getElementById('badge-grid');if(!host)return;host.innerHTML='';
  if(!store.badges)store.badges={};let earned=0,changed=false;
  BADGES.forEach(b=>{
    let got=!!store.badges[b.id];
    if(!got&&safeTest(b)){store.badges[b.id]=_today();got=true;changed=true;}
    if(got)earned++;
    const el=document.createElement('div');el.className='badge'+(got?' earned':'');
    el.innerHTML='<div class="bem">'+b.emoji+'</div><div class="bti">'+escH(b.title)+'</div><div class="bds">'+escH(b.desc)+'</div>';
    host.appendChild(el);
  });
  if(changed)save();
  const cnt=document.getElementById('badge-count');if(cnt)cnt.textContent='（'+earned+' / '+BADGES.length+'）';
}

function paceReco(daysLeft){
  const pool=scopedQ();
  const remain=pool.filter(q=>isUnseen(q.id)||needsReview(q.id)).length;
  return {remain:remain,perDay:(daysLeft>0&&remain>0)?Math.ceil(remain/daysLeft):0};
}
function adoptPace(n){
  if(!(n>0))return;
  store.goal=n;save();
  renderPlan();try{renderMypage();}catch(e){}
  toast('🎯 1日の目標を '+n+'問 に設定しました');
}
function renderPlan(){
  const cd=document.getElementById('plan-cd');if(!cd)return;
  const goalWrap=document.getElementById('plan-goal');
  const ed=store.examDate||'';let daysLeft=null;
  if(ed){const t=new Date();t.setHours(0,0,0,0);const e=new Date(ed+'T00:00:00');daysLeft=Math.round((e-t)/86400000);}
  if(ed&&daysLeft>=0)cd.innerHTML='<span class="big">受験まで あと'+daysLeft+'日</span><span class="sub">🎯 '+escH(ed)+'</span>';
  else if(ed)cd.innerHTML='<span class="big">受験日は過ぎました</span><span class="sub">🎯 '+escH(ed)+'</span>';
  else cd.innerHTML='<span class="big">受験日 未設定</span><span class="sub">⚙️ から受験日と目標を設定</span>';
  const goal=store.goal||0,todayN=(store.daily&&store.daily[_today()])||0;
  if(goal>0){
    goalWrap.style.display='block';
    setText('goal-txt',todayN+' / '+goal+' 問'+(todayN>=goal?' ✅':''));
    document.getElementById('goal-fill').style.width=Math.min(100,Math.round(todayN/goal*100))+'%';
    setText('plan-pace','今日の残り '+Math.max(0,goal-todayN)+'問');
  }else goalWrap.style.display='none';
  let reco=document.getElementById('plan-reco');
  if(!reco){reco=document.createElement('div');reco.id='plan-reco';reco.className='plan-reco';cd.parentNode.insertBefore(reco,cd.nextSibling);}
  let html='';
  if(ed&&daysLeft>0){
    const pr=paceReco(daysLeft);
    if(pr.remain>0){
      html='📐 逆算ペース：残り'+pr.remain+'問 ÷ '+daysLeft+'日 ＝ <b>1日'+pr.perDay+'問</b>'
        +(goal===pr.perDay?'':' <button class="plan-reco-btn" type="button" onclick="adoptPace('+pr.perDay+')">目標にする</button>');
    }else html='📐 未着手・要復習は0問。仕上げの模試と総ざらいへ 🎉';
  }
  reco.innerHTML=html;reco.style.display=html?'':'none';
}
function togglePlanEdit(){
  const e=document.getElementById('plan-edit');if(!e)return;e.classList.toggle('on');
  if(e.classList.contains('on')){const din=document.getElementById('exam-date-in');if(din)din.value=store.examDate||'';const gin=document.getElementById('goal-in');if(gin)gin.value=store.goal||'';}
}
function savePlan(){
  const d=document.getElementById('exam-date-in').value;
  const g=parseInt(document.getElementById('goal-in').value,10);
  store.examDate=d||'';store.goal=(g>0?g:0);save();
  document.getElementById('plan-edit').classList.remove('on');
  renderPlan();toast('✅ 学習計画を保存');
}
function clearPlan(){
  store.examDate='';store.goal=0;save();
  const din=document.getElementById('exam-date-in');if(din)din.value='';
  const gin=document.getElementById('goal-in');if(gin)gin.value='';
  document.getElementById('plan-edit').classList.remove('on');renderPlan();toast('学習計画をクリア');
}

function renderMypage(){
  const host=document.getElementById('mypage-body');if(!host)return;
  const acc=(typeof window.__sfqAccount==='function')?window.__sfqAccount():{loggedIn:false,local:true};
  let tc=0,tt=0;Object.values(store.hist).forEach(h=>{tc+=h.c;tt+=h.c+h.w;});
  const overall=tt?Math.round(tc/tt*100):0,pass=overall>=PASS;
  const ringCol=pass?'var(--success)':overall>=PASS-10?'var(--warning)':'var(--danger)';
  const ringLab=pass?'合格圏に到達':overall>=PASS-10?'合格まであと少し':'基礎固めが必要';
  const c=2*Math.PI*26,off=c*(1-overall/100);
  const answered=answeredCount();
  const days=Object.keys(store.daily||{}).filter(k=>(store.daily[k]||0)>0).length;
  const mastered=Object.values(store.vm||{}).filter(v=>v>=2).length;
  const exams=store.exams||[];const best=exams.reduce((m,e)=>Math.max(m,e.pct||0),0);
  const passed=exams.filter(e=>e.pass).length;const streak=dayStreak();
  let accHtml;
  if(acc.loggedIn){
    accHtml='<div class="acct"><div class="mp-avatar">👤</div><div><div class="mp-name">'+escH(acc.name||'ユーザー')+'</div>'
      +'<div class="mp-asub"><span class="mp-dot"></span>'+escH(acc.status||'同期済み')+(acc.email?' ・ ID: '+escH(acc.email.split('@')[0]):'')+'</div></div></div>'
      +'<div class="mp-aact">'+(acc.isAdmin?'<button class="mp-b mp-admin" onclick="window.__sfqOpenAdmin&&window.__sfqOpenAdmin()">👑 管理者ビュー</button>':'')
      +'<button class="mp-b mp-logout" onclick="window.__sfqLogout&&window.__sfqLogout()">ログアウト</button></div>'
      +(acc.isAdmin?'<div class="mp-admtools"><button class="mp-csvlink" onclick="exportBookmarksCsv()" title="ブックマークした問題の問題・選択肢・答えをCSVで書き出します">★ ブックマークをCSVで書き出し</button></div>':'');
  }else if(acc.local){
    accHtml='<div class="acct"><div class="mp-avatar" style="background:linear-gradient(135deg,#64748b,#94a3b8)">💻</div><div><div class="mp-name">ローカルモード</div><div class="mp-asub">この端末内に保存（クラウド同期なし）</div></div></div>';
  }else{
    accHtml='<div class="acct"><div class="mp-avatar">👤</div><div><div class="mp-name">未ログイン</div><div class="mp-asub">ホームからログインすると進捗が同期されます</div></div></div>';
  }
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const seg=(on,label,fn)=>'<button class="'+(on?'on':'')+'" onclick="'+fn+'">'+label+'</button>';
  const fs=(function(){try{return localStorage.getItem('sfq_fontsize')||'normal';}catch(e){return 'normal';}})();
  const installRow=window.__deferredInstall
    ? '<div class="mp-opt"><span class="mp-ic">📲</span><span class="mp-main">アプリを追加<div class="mp-osub">ホーム画面に追加してすばやく起動</div></span><span class="mp-seg"><button onclick="installPWA()">追加</button></span></div>'
    : '';
  const trendHtml=(typeof examTrendHTML==='function')?examTrendHTML():'';
  const ed=store.examDate||'',goal=store.goal||0;let planInfo='';
  if(ed){const t=new Date();t.setHours(0,0,0,0);const e=new Date(ed+'T00:00:00');const dl=Math.round((e-t)/86400000);const unans=allQ.length-answered;
    planInfo=dl>=0?('受験まで あと '+dl+'日'+(dl>0&&unans>0?' ・ 未着手 '+unans+'問 → 目安 '+Math.ceil(unans/dl)+'問/日':'')):'受験日は過ぎました';}
  const acqHtml=store.acquiredDate
    ? '<div class="mp-acqdone"><span class="mp-acqic">🎓</span><span class="mp-main"><div class="mp-acqt">この資格は取得済みです 🎉</div><div class="mp-osub">取得日: '+escH(store.acquiredDate)+'</div></span></div>'
    : '<div class="mp-opt" style="border:none;padding:0"><span class="mp-ic">🎓</span><span class="mp-main">資格の取得<div class="mp-osub">本番試験に合格したら記録しましょう</div></span><button class="mp-acqbtn" onclick="acquireCert()">取得済みにする</button></div>';
  host.innerHTML=
    '<div class="card">'+accHtml+'</div>'
    +'<button class="mp-guidebtn" onclick="openGuide()">❓ 使い方ガイド（すべての機能の説明）</button>'
    +'<div class="sec-label">資格の取得</div>'
    +'<div class="card">'+acqHtml
    +'<div class="mp-acqhint">資格は<b>ステップ制</b>です。取得済みにすると次の資格が解除されます。<button class="mp-acqinfo" onclick="if(window.SFQ_PROG)SFQ_PROG.openInfo()">❓ くわしく</button></div>'
    +'</div>'
    +'<div class="sec-label">学習の記録</div>'
    +'<div class="card"><div class="mp-sumtop"><div class="mp-ring"><svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="'+ringCol+'" stroke-width="7" stroke-linecap="round" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'" transform="rotate(-90 32 32)"/></svg><div class="mp-rt" style="color:'+ringCol+'">'+overall+'%</div></div>'
    +'<div><div class="mp-sumlab">'+ringLab+'</div><div class="mp-sumsub">総合到達度（合格ライン '+PASS+'%）</div></div></div>'
    +'<div class="mp-grid">'
    +'<div class="mp-mini"><div class="n">'+answered+'</div><div class="l">解答済み</div></div>'
    +'<div class="mp-mini"><div class="n">🔥'+streak+'</div><div class="l">連続日数</div></div>'
    +'<div class="mp-mini"><div class="n">'+days+'</div><div class="l">学習日数</div></div>'
    +'<div class="mp-mini"><div class="n">'+mastered+'</div><div class="l">習得用語</div></div>'
    +'<div class="mp-mini"><div class="n">'+(exams.length?best+'%':'—')+'</div><div class="l">試験ベスト</div></div>'
    +'<div class="mp-mini"><div class="n">'+passed+'</div><div class="l">合格回数</div></div>'
    +'</div></div>'
    +(trendHtml?('<div class="sec-label">模試の記録</div>'+trendHtml):'')
    +'<div class="sec-label">学習計画</div>'
    +'<div class="card"><div class="mp-field"><label>🎯 受験予定日</label><input type="date" id="mp-exam" value="'+escH(ed)+'"></div>'
    +'<div class="mp-field"><label>📅 1日の目標問題数</label><input type="number" id="mp-goal" min="0" max="999" value="'+(goal||'')+'" placeholder="例: 20"></div>'
    +(planInfo?'<div class="mp-planinfo">'+escH(planInfo)+'</div>':'')
    +'<div class="mp-saverow"><button class="mp-b mp-save" onclick="saveMyPlan()">保存</button><button class="mp-b mp-clear" onclick="clearMyPlan()">クリア</button></div></div>'
    +'<div class="sec-label">サポート</div>'
    +'<div class="card"><div class="mp-opt"><span class="mp-ic">🛠️</span><span class="mp-main">不具合・ご意見を報告<div class="mp-osub">問題の誤り・バグ・要望をアプリ内から送信（運営が確認します）</div></span><span class="mp-seg"><button onclick="openFeedback()">報告</button></span></div></div>'
    +'<div class="sec-label">表示・データ</div>'
    +'<div class="card">'
    +'<div class="mp-opt"><span class="mp-ic">🌓</span><span class="mp-main">テーマ<div class="mp-osub">画面の配色</div></span><span class="mp-seg">'+seg(!dark,'ライト','setDarkMode(false)')+seg(dark,'ダーク','setDarkMode(true)')+'</span></div>'
    +'<div class="mp-opt"><span class="mp-ic">🔠</span><span class="mp-main">文字サイズ<div class="mp-osub">問題・選択肢・解説などの本文</div></span><span class="mp-seg">'+seg(fs==='small','小',"applyFontSize('small');renderMypage()")+seg(fs==='normal','標準',"applyFontSize('normal');renderMypage()")+seg(fs==='large','大',"applyFontSize('large');renderMypage()")+'</span></div>'
    +((function(){const avail=SRC_KEYS.filter(s=>allQ.some(q=>q&&q.source===s));if(avail.length<2)return '';return '<div class="mp-opt"><span class="mp-ic">📚</span><span class="mp-main">既定の出典<div class="mp-osub">学習・試験で出す問題（複数選べます）</div></span><span class="mp-seg">'+seg(srcSel.size===0,"すべて","setSrcFilter('all');renderMypage()")+avail.map(s=>seg(srcSel.has(s),SRC_LABEL[s],"setSrcFilter('"+s+"');renderMypage()")).join('')+'</span></div>';})())
    +'<div class="mp-opt"><span class="mp-ic">⌨️</span><span class="mp-main">キーボード操作<div class="mp-osub">PCショートカット一覧（<b>?</b> キーでも開く）</div></span><span class="mp-seg"><button onclick="toggleShortcutHelp(true)">表示</button></span></div>'
    +'<div class="mp-opt"><span class="mp-ic">💾</span><span class="mp-main">バックアップ<div class="mp-osub">進捗をファイルに保存／復元（端末移行・消失対策）</div></span><span class="mp-seg"><button onclick="exportProgress()">書出</button><button onclick="document.getElementById(\'mp-import\').click()">読込</button></span></div>'
    +'<input type="file" id="mp-import" accept="application/json,.json" style="display:none" onchange="importProgress(this)">'
    +'<div class="mp-opt"><span class="mp-ic">🔄</span><span class="mp-main">アプリを更新<div class="mp-osub">最新版の取得を確認して再読み込み</div></span><span class="mp-seg"><button onclick="updateApp()">更新</button></span></div>'
    +installRow
    +'<div class="mp-opt"><span class="mp-ic">🗑️</span><span class="mp-main">進捗データ<div class="mp-osub">この資格の履歴・設定を初期化</div></span><button class="mp-danger" onclick="resetAll()">リセット</button></div>'
    +'</div>';
}
function saveMyPlan(){
  const d=document.getElementById('mp-exam').value;
  const g=parseInt(document.getElementById('mp-goal').value,10);
  store.examDate=d||'';store.goal=(g>0?g:0);save();
  renderPlan();renderMypage();toast('✅ 学習計画を保存');
}
function clearMyPlan(){store.examDate='';store.goal=0;save();renderPlan();renderMypage();toast('学習計画をクリア');}
function setDarkMode(on){applyDark(on);try{localStorage.setItem('dark',on?'1':'0');}catch(e){}renderMypage();}
window.__sfqOnAccount=function(){var p=document.getElementById('pg-mypage');if(p&&p.classList.contains('active'))renderMypage();};

function __notifyProgress(){
  try{
    var slug=(window.CERT_CONFIG&&CERT_CONFIG.slug)||'';
    if(!slug)return;
    if(!window.SFQ_PROGRESS)window.SFQ_PROGRESS={acquired:{},locked:{},elective:''};
    if(!window.SFQ_PROGRESS.acquired)window.SFQ_PROGRESS.acquired={};
    if(!window.SFQ_PROGRESS.locked)window.SFQ_PROGRESS.locked={};
    if(store.acquiredDate)window.SFQ_PROGRESS.acquired[slug]=store.acquiredDate;
    else delete window.SFQ_PROGRESS.acquired[slug];
    if(store.acquiredDate&&store.acqLock)window.SFQ_PROGRESS.locked[slug]=1;
    else delete window.SFQ_PROGRESS.locked[slug];
    window.dispatchEvent(new Event('sfq-progress'));
  }catch(e){}
}
function acquireCert(){
  showAcqConfirm();
}
function hideAcqConfirm(){var ov=document.getElementById('acq-confirm-ov');if(ov)ov.classList.remove('on');}
function showAcqConfirm(){
  var ov=document.getElementById('acq-confirm-ov');
  if(!ov){
    ov=document.createElement('div');ov.id='acq-confirm-ov';ov.className='acq-ov';
    ov.innerHTML='<div class="acq-box" role="dialog" aria-modal="true">'
      +'<div class="acq-ic">🎓</div>'
      +'<div class="acq-t">この資格を「取得済み」にしますか？</div>'
      +'<div class="acq-msg">・一度「取得済み」にすると<b>取り消せません</b>。<br>・この資格の問題は学習・解答ができなくなります。<br>・次の資格が解除されます。</div>'
      +'<div class="acq-actions"><button class="acq-cancel" id="acq-cancel">キャンセル</button><button class="acq-ok" id="acq-ok">🎓 取得済みにする</button></div>'
      +'</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click',function(e){if(e.target===ov)hideAcqConfirm();});
  }
  document.getElementById('acq-cancel').onclick=hideAcqConfirm;
  document.getElementById('acq-ok').onclick=function(){hideAcqConfirm();doAcquireCert();};
  ov.classList.add('on');
}
function doAcquireCert(){
  store.acquiredDate=_today();store.acqLock=1;save();
  homeStats();renderMypage();
  try{if(document.getElementById('pg-exam').classList.contains('active'))renderExamAcq(true);}catch(e){}
  __notifyProgress();
  toast('🎓 取得済みにしました！おめでとうございます 🎉');
}
function renderHomeProgress(){
  const home=document.getElementById('pg-home');if(!home)return;
  let card=document.getElementById('home-progress');
  if(store.acquiredDate){ if(card)card.style.display='none'; return; }
  if(!card){
    card=document.createElement('div');
    card.id='home-progress';
    card.className='card home-progress';
    const hero=home.querySelector('.home-hero');
    if(hero&&hero.parentNode)hero.parentNode.insertBefore(card,hero.nextSibling);
    else home.insertBefore(card,home.firstChild);
  }
  card.style.display='';
  card.innerHTML=
    '<div class="hp-row"><span class="hp-ic">🎓</span><div class="hp-main">'
    +'<div class="hp-t">合格したら「取得済み」にして次へ進もう</div>'
    +'<div class="hp-sub"><b>次の資格が解除</b>されます（⚠️ 取り消し不可）。</div>'
    +'</div></div>'
    +'<div class="hp-actions">'
    +'<button class="hp-acqbtn" onclick="acquireCert()">🎓 取得済みにする</button>'
    +'<button class="hp-infobtn" onclick="if(window.SFQ_PROG)SFQ_PROG.openInfo()">❓ ステップ制とは？</button>'
    +'</div>';
}
function renderHomeAcq(){
  const on=!!store.acquiredDate;
  const badge=document.getElementById('hh-acq'),rib=document.getElementById('hh-ribbon'),hero=document.querySelector('.home-hero');
  if(badge){ if(on){badge.style.display='';badge.textContent='🎓 取得済み・'+store.acquiredDate;} else badge.style.display='none'; }
  if(rib)rib.style.display=on?'':'none';
  if(hero)hero.classList.toggle('acq',on);
}
function renderExamAcq(pass){
  const host=document.getElementById('e-acq');if(!host)return;
  if(store.acquiredDate){host.innerHTML='<div class="e-acq-done">🎓 取得済み（'+escH(store.acquiredDate)+'）</div>';}
  else if(pass){host.innerHTML='<button class="btn e-acq-btn" onclick="acquireCert()">🎓 この資格を取得済みにする</button>';}
  else host.innerHTML='';
}

function lessonsAvailable(){return Array.isArray(LESSDATA)&&LESSDATA.length>0;}
function lessonById(id){return (LESSDATA||[]).find(function(l){return l&&l.id===id;});}
function lessonProg(id){if(!store.lessons)store.lessons={};return store.lessons[id]||{done:0,last:0};}
function revealLessonEntry(){const b=document.getElementById('lesson-entry');if(b)b.style.display=lessonsAvailable()?'':'none';}

function renderLessonList(){
  const el=document.getElementById('les-list'); if(!el)return;
  const player=document.getElementById('les-player'); if(player)player.style.display='none';
  el.style.display='';
  if(!lessonsAvailable()){el.innerHTML='<div class="cram-empty">🎓 この資格の授業は準備中です。</div>';return;}
  let h='<div class="les-intro">🎓 スライドを順番にめくって、基礎からイチから学べます。各レッスンの最後に理解度チェックがあります。</div>';
  LESSDATA.forEach(function(l){
    if(!l||!l.id)return;
    const p=lessonProg(l.id), dd=domainDef(l.domain), n=(l.slides||[]).length;
    let badge='';
    if(p.done)badge='<span class="les-done">✓ 修了</span>';
    else if((p.last||0)>0)badge='<span class="les-pos">途中 '+Math.min((p.last||0)+1,n)+'/'+n+'</span>';
    h+='<button class="les-card" onclick="openLesson(\''+l.id+'\')">'
      +'<div class="les-card-top"><span class="les-dom">'+escH((dd&&dd.emoji)||'📘')+' '+escH((dd&&dd.name)||'')+'</span>'+badge+'</div>'
      +'<div class="les-card-title">'+escH(l.title||'')+'</div>'
      +'<div class="les-card-meta">🖼️ '+n+'枚'+(l.est?' ・ 約'+l.est+'分':'')+'</div>'
      +'</button>';
  });
  el.innerHTML=h;
  window.scrollTo(0,0);
}

function openLesson(id){
  const l=lessonById(id); if(!l){toast('レッスンが見つかりません');return;}
  lesCur=id;
  const p=lessonProg(id), n=(l.slides||[]).length;
  lesIdx=p.done?0:Math.max(0,Math.min(p.last||0,n-1));
  goTo('lessons');
  renderLessonSlide();
}

function renderLessonSlide(){
  const l=lessonById(lesCur); if(!l)return;
  const list=document.getElementById('les-list'); if(list)list.style.display='none';
  const player=document.getElementById('les-player'); if(!player)return;
  player.style.display='';
  const slides=l.slides||[], n=slides.length;
  if(lesIdx<0)lesIdx=0; if(lesIdx>n-1)lesIdx=n-1;
  const s=slides[lesIdx]||{}, isLast=lesIdx===n-1;
  if(!store.lessons)store.lessons={};
  const prog=store.lessons[lesCur]||(store.lessons[lesCur]={done:0,last:0});
  if(lesIdx>(prog.last||0)){prog.last=lesIdx;save();}
  let dots='';
  for(let i=0;i<n;i++)dots+='<span class="les-dot'+(i===lesIdx?' on':(i<lesIdx?' seen':''))+'" onclick="lesGo('+i+')"></span>';
  let body='';
  if(s.fig)body+=figHTML(s.fig,s.figCap||'');
  if(s.body)body+='<div class="les-body">'+cramMd(s.body)+'</div>';
  if(s.code)body+='<pre class="les-code"><code>'+escH(s.code)+'</code></pre>';
  if(Array.isArray(s.checkIds)&&s.checkIds.length)
    body+='<button class="btn bp les-check" onclick="lessonCheck(\''+lesCur+'\','+lesIdx+')">📝 関連問題を解く（'+s.checkIds.length+'問）</button>';
  const prevBtn='<button class="btn bg" '+(lesIdx===0?'disabled':'')+' onclick="lesNav(-1)">‹ 前へ</button>';
  const nextBtn=isLast
    ? '<button class="btn bs- les-finish" onclick="finishLesson()">✓ 修了する</button>'
    : '<button class="btn bp" onclick="lesNav(1)">次へ ›</button>';
  player.innerHTML=
    '<div class="les-head"><button class="les-back" onclick="exitLesson()">‹ 一覧</button>'
    +'<span class="les-htitle">'+escH(l.title||'')+'</span>'
    +'<span class="les-count">'+(lesIdx+1)+' / '+n+'</span></div>'
    +'<div class="les-dots">'+dots+'</div>'
    +'<div class="card les-slide"><h2 class="les-stitle">'+escH(s.title||'')+'</h2>'+body+'</div>'
    +'<div class="les-nav">'+prevBtn+nextBtn+'</div>';
  window.scrollTo(0,0);
}
function lesNav(d){lesGo(lesIdx+d);}
function lesGo(i){const l=lessonById(lesCur);if(!l)return;const n=(l.slides||[]).length;lesIdx=Math.max(0,Math.min(n-1,i));renderLessonSlide();}
function exitLesson(){renderLessonList();}
function finishLesson(){
  if(!lesCur)return;
  if(!store.lessons)store.lessons={};
  const prog=store.lessons[lesCur]||(store.lessons[lesCur]={done:0,last:0});
  const already=prog.done;
  prog.done=1;
  if(!already){store.xp=(store.xp||0)+20;toast('🎓 レッスン修了！ +20XP');}
  else toast('🎓 おさらい完了');
  save();
  try{homeStats();}catch(e){}
  renderLessonList();
}
function lessonCheck(id,idx){
  const l=lessonById(id); if(!l)return;
  const s=(l.slides||[])[idx]||{}, ids=s.checkIds||[];
  const qs=ids.map(function(x){return allQ.find(function(q){return q.id===x;});}).filter(Boolean);
  if(!qs.length){toast('関連問題が見つかりません');return;}
  beginStudyWith(qs);
}

function resetAll(){
  if(!confirm('進捗データをすべてリセットしますか？'))return;
  store={bm:[],hist:{},streak:0,vm:{},tbm:{},srs:{},daily:{},notes:{},examDate:'',goal:0,exams:[],badges:{},dc:{},acquiredDate:'',acqLock:0,time:{tot:0,dom:{},hour:{}},sum:{},xp:0,missions:{wk:'',claimed:{}},rdz:[],lessons:{}};save();homeStats();renderTextbook();renderMypage();toast('🗑️ リセットしました');
}

function _today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function _addDays(n){const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function srsUpdate(id,ok,low){
  if(!store.srs)store.srs={};
  const s=store.srs[id]||{ivl:0,ease:2.5,reps:0};
  if(ok&&low){
    s.reps=Math.max(1,s.reps||0);
    s.ivl=1;
    s.ease=Math.max(1.3,(s.ease||2.5)-0.05);
    s.due=_addDays(1);
  }else if(ok){
    s.reps=(s.reps||0)+1;
    if(s.reps<=1)s.ivl=1;
    else if(s.reps===2)s.ivl=3;
    else s.ivl=Math.max(1,Math.round((s.ivl||1)*(s.ease||2.5)));
    s.ease=Math.min(3.0,(s.ease||2.5)+0.1);
    s.due=_addDays(s.ivl);
  }else{
    s.reps=0;s.ivl=0;
    s.ease=Math.max(1.3,(s.ease||2.5)-0.2);
    s.due=_today();
  }
  store.srs[id]=s;
}
function srsDue(id){const s=store.srs&&store.srs[id];if(!s)return false;return (s.due||'9999-99-99')<=_today();}
function srsDueList(){return scopedQ().filter(q=>srsDue(q.id));}
function srsDueCount(){return srsDueList().length;}
function updateSrsBtn(){
  const n=srsDueCount();
  const el=document.getElementById('srs-count');if(el){el.textContent=n?(' '+n):'';}
  const el2=document.getElementById('next-srs');if(el2){el2.textContent=n;}
}
function beginStudyWith(arr,opts){
  if(!arr||!arr.length){toast('対象の問題がありません');return;}
  dcActive=!!(opts&&opts.daily);
  loopMode=!!(opts&&opts.loop);loopStreak={};if(loopMode)loopTotal=arr.length;
  sQueue=arr;sCur=0;sOk=0;sNg=0;sRevealed=false;fShuf=true;
  document.getElementById('s-end').style.display='none';
  document.getElementById('s-card').style.display='block';
  setText('sess-ok-txt','✓ 0');setText('sess-ng-txt','✗ 0');
  goTo('study');renderSQ();
}
function startSRS(){
  const due=srsDueList();
  if(!due.length){toast('🎉 今日の復習はありません');return;}
  beginStudyWith(shuffle(due));
}

function bumpDaily(){if(!store.daily)store.daily={};const t=_today();store.daily[t]=(store.daily[t]||0)+1;}
function renderHeatmap(){
  const host=document.getElementById('heatmap');if(!host)return;
  const daily=store.daily||{};
  const WEEKS=20;
  const today=new Date();today.setHours(0,0,0,0);
  const fmt=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const cur=new Date(today);cur.setDate(cur.getDate()-(WEEKS*7-1));cur.setDate(cur.getDate()-cur.getDay());
  const cols=[];
  while(cur.getTime()<=today.getTime()){
    const col=[];
    for(let i=0;i<7;i++){
      const ds=fmt(cur),future=cur.getTime()>today.getTime(),v=daily[ds]||0;
      col.push({ds,v,future});
      cur.setDate(cur.getDate()+1);
    }
    cols.push(col);
  }
  let html='<div class="hm-grid">';
  cols.forEach(col=>{
    html+='<div class="hm-col">';
    col.forEach(c=>{
      let lvl=0;
      if(c.v>=10)lvl=4;else if(c.v>=6)lvl=3;else if(c.v>=3)lvl=2;else if(c.v>=1)lvl=1;
      const cls=c.future?'hm-cell hm-future':'hm-cell hm-l'+lvl;
      html+='<div class="'+cls+'" title="'+c.ds+'：'+c.v+'問"></div>';
    });
    html+='</div>';
  });
  html+='</div>';
  host.innerHTML=html;
  let days=0,ans=0;Object.values(daily).forEach(v=>{if(v>0){days++;ans+=v;}});
  const sub=document.getElementById('hm-sub');if(sub)sub.textContent=days+'日 / 計'+ans+'問';
}


function onQSearch(){
  try{applyFilters();}catch(e){}
  const i=document.getElementById('f-text');
  const v=i?(i.value||'').trim():'';
  const go=document.getElementById('f-text-go');
  const cl=document.getElementById('f-text-clear');
  if(cl)cl.style.display=v?'':'none';
  if(go){
    if(!v){go.style.display='none';go.disabled=false;}
    else{go.style.display='';go.disabled=(filtQ.length===0);go.textContent=filtQ.length?('学習 '+filtQ.length+'問'):'0問';}
  }
}
function clearQSearch(){const i=document.getElementById('f-text');if(i)i.value='';onQSearch();i&&i.focus();}

function toggleShortcutHelp(force){
  let ov=document.getElementById('sc-help');
  if(!ov){
    ov=document.createElement('div');ov.id='sc-help';ov.className='sc-help';
    const row=(k,d)=>'<div class="sc-row"><span class="sc-keys">'+k+'</span><span>'+d+'</span></div>';
    ov.innerHTML=
      '<div class="sc-box" role="dialog" aria-modal="true" aria-label="キーボードショートカット">'
      +'<div class="sc-head"><span>⌨️ キーボードショートカット</span><button class="sc-close" type="button" onclick="toggleShortcutHelp(false)" aria-label="閉じる">✕</button></div>'
      +'<div class="sc-body">'
      +'<div class="sc-grp">学習モード</div>'
      +row('<kbd>1</kbd>〜<kbd>9</kbd>','選択肢を選ぶ')
      +row('<kbd>0</kbd>','「自信なし」を切替')
      +row('<kbd>Enter</kbd>','解答する／次の問題へ')
      +'<div class="sc-grp">試験モード</div>'
      +row('<kbd>1</kbd>〜<kbd>9</kbd>','選択肢を選ぶ')
      +row('<kbd>←</kbd> <kbd>→</kbd>','前／次の問題へ')
      +row('<kbd>Enter</kbd>','次の問題へ')
      +row('<kbd>F</kbd>','フラグ（後で見直す）')
      +'<div class="sc-grp">全体</div>'
      +row('<kbd>?</kbd>','このヘルプを開く')
      +row('<kbd>Esc</kbd>','閉じる')
      +'</div></div>';
    ov.addEventListener('click',e=>{if(e.target===ov)toggleShortcutHelp(false);});
    document.body.appendChild(ov);
  }
  const open=(force==null)?!ov.classList.contains('on'):!!force;
  ov.classList.toggle('on',open);
}

function reportQuestion(id){ openFeedback({qid:id}); }

const FB_CATS=[
  {k:'bug',label:'🐞 不具合・バグ'},
  {k:'answer',label:'❌ 正解が誤り'},
  {k:'exp',label:'📝 解説が誤り・古い'},
  {k:'choice',label:'🔀 選択肢の不備'},
  {k:'japanese',label:'🗾 日本語が不自然'},
  {k:'request',label:'💡 機能の要望'},
  {k:'other',label:'＊ その他'}
];
let fbQid='', fbCat='bug', fbBusy=false;
function openFeedback(opts){
  opts=opts||{};
  fbQid=opts.qid?String(opts.qid):'';
  fbCat=fbQid?'answer':'bug';
  let ov=document.getElementById('fb-modal');
  if(!ov){
    ov=document.createElement('div');ov.id='fb-modal';ov.className='sc-help';
    ov.addEventListener('click',function(e){if(e.target===ov)closeFeedback();});
    document.body.appendChild(ov);
  }
  var _old=document.getElementById('fb-msg');if(_old)_old.value='';
  ov.classList.add('on');renderFeedback();
  setTimeout(function(){var t=document.getElementById('fb-msg');if(t)t.focus();},60);
}
function closeFeedback(){const ov=document.getElementById('fb-modal');if(ov)ov.classList.remove('on');}
function fbSetCat(k){fbCat=k;renderFeedback();}
function renderFeedback(){
  const ov=document.getElementById('fb-modal');if(!ov)return;
  const acc=(typeof window.__sfqAccount==='function')?window.__sfqAccount():{loggedIn:false,local:true};
  let ctx='';
  if(fbQid){
    const q=allQ.find(x=>String(x.id)===fbQid);
    ctx='<div class="fb-ctx">対象: <b>'+escH(CFG.shortName||CFG.slug||'')+'</b> ・ Q'+escH(fbQid)
      +(q?'<div class="fb-qx">'+escH((q.question||'').slice(0,90))+(q.question&&q.question.length>90?'…':'')+'</div>':'')+'</div>';
  }
  const chips=FB_CATS.map(c=>'<button type="button" class="fb-chip'+(fbCat===c.k?' on':'')+'" onclick="fbSetCat(\''+c.k+'\')">'+c.label+'</button>').join('');
  const prev=(document.getElementById('fb-msg')||{}).value||'';
  let note='';
  if(acc.local)note='<div class="fb-note">💻 ローカルモードのため、いまは端末に保存され、ログイン時にまとめて送信されます。</div>';
  else if(!acc.loggedIn)note='<div class="fb-note">未ログインのため、いったん端末に保存し、ログイン後に自動送信します。</div>';
  ov.innerHTML='<div class="sc-box fb-box" role="dialog" aria-modal="true" aria-label="不具合・ご意見の報告">'
    +'<div class="sc-head"><span>🛠️ 不具合・ご意見の報告</span><button class="sc-close" type="button" onclick="closeFeedback()" aria-label="閉じる">✕</button></div>'
    +'<div class="sc-body">'
    +ctx
    +'<div class="fb-label">種類</div><div class="fb-chips">'+chips+'</div>'
    +'<div class="fb-label">内容</div>'
    +'<textarea id="fb-msg" class="fb-ta" rows="5" placeholder="気づいた点・再現手順・期待する動作などをご記入ください。">'+escH(prev)+'</textarea>'
    +note
    +'<div class="fb-actions"><button type="button" class="fb-cancel" onclick="closeFeedback()">キャンセル</button>'
    +'<button type="button" class="fb-submit" onclick="submitFeedback()">送信する</button></div>'
    +'<div class="fb-foot">送信内容は改善のため運営（管理者）が確認します。お名前と環境情報が一緒に送られます。</div>'
    +'</div></div>';
}
function fbAppVer(){try{var s=document.querySelector('script[src*="quiz-engine.js"]');var m=s&&s.src.match(/[?&]v=([^&]+)/);return m?('?v='+m[1]):'';}catch(e){return '';}}
function submitFeedback(){
  if(fbBusy)return;
  const ta=document.getElementById('fb-msg');
  const msg=((ta&&ta.value)||'').trim();
  if(!msg){toast('内容を入力してください');if(ta)ta.focus();return;}
  let qtext='',ref='';
  if(fbQid){const q=allQ.find(x=>String(x.id)===fbQid);if(q){qtext=(q.question||'').slice(0,300);ref=q.reference_url||'';}}
  const report={
    fid:'f'+Date.now()+'-'+Math.random().toString(36).slice(2,8),
    ts:Date.now(),
    cert:CFG.slug||'',
    qid:fbQid||'',
    cat:fbCat,
    msg:msg.slice(0,2000),
    qtext:qtext,
    ref:ref,
    ua:(navigator.userAgent||'').slice(0,300),
    ver:fbAppVer(),
    url:(location.href||'').slice(0,300)
  };
  fbBusy=true;
  function stashLocal(){try{var a=JSON.parse(localStorage.getItem('sfq_feedback_pending')||'[]');a.push(report);localStorage.setItem('sfq_feedback_pending',JSON.stringify(a));}catch(e){}}
  function done(cloud){fbBusy=false;closeFeedback();toast(cloud?'📨 送信しました。ご協力ありがとうございます！':'📝 保存しました。ログイン後に送信されます。');}
  const res=(typeof window.__cloudSubmitFeedback==='function')?window.__cloudSubmitFeedback(report):false;
  if(res&&typeof res.then==='function'){res.then(function(){done(true);}).catch(function(){stashLocal();done(false);});}
  else{stashLocal();done(false);}
}

function exportProgress(){
  try{
    const blob=new Blob([JSON.stringify(store,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='sfquiz-'+(CFG.slug||'data')+'-'+_today()+'.json';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('💾 進捗をダウンロードしました');
  }catch(e){toast('書き出しに失敗しました');}
}
function importProgress(input){
  const f=input&&input.files&&input.files[0];
  if(!f){return;}
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const o=JSON.parse(rd.result);
      if(!o||typeof o!=='object'||(o.hist==null&&o.bm==null&&o.vm==null&&o.srs==null)){
        toast('対応していないファイルです');input.value='';return;
      }
      if(!confirm('現在の進捗を、読み込んだデータで置き換えます。よろしいですか？')){input.value='';return;}
      window.__setStore(o);
      save();
      try{window.__refreshUI&&window.__refreshUI();}catch(e){}
      try{homeStats();}catch(e){}
      try{renderMypage();}catch(e){}
      toast('✅ 進捗を復元しました');
    }catch(e){toast('読み込みに失敗しました（JSON 解析エラー）');}
    input.value='';
  };
  rd.readAsText(f);
}

const DAILY_N=10;
function buildDailySet(){
  const today=_today();
  const dc=store.dc;
  if(dc&&dc.d===today&&Array.isArray(dc.ids)&&dc.ids.length){
    const reuse=dc.ids.map(id=>allQ.find(q=>q.id===id)).filter(Boolean);
    if(reuse.length)return reuse;
  }
  const inS=scopedQ();
  const pick=[],used=new Set();
  const take=list=>{shuffle(list).forEach(q=>{if(pick.length<DAILY_N&&!used.has(q.id)){used.add(q.id);pick.push(q);}});};
  take(inS.filter(q=>srsDue(q.id)));
  take(inS.filter(q=>needsReview(q.id)));
  let weak=[];
  try{weak=domainStats().filter(d=>d.t>0).sort((a,b)=>a.pct-b.pct).slice(0,3).map(d=>d.code);}catch(e){}
  if(weak.length)take(inS.filter(q=>weak.includes(domainOf(q.id))));
  take(inS.filter(q=>isUnseen(q.id)));
  take(inS);
  const set=pick.slice(0,DAILY_N);
  store.dc={d:today,ids:set.map(q=>q.id),done:0};save();
  return set;
}
function startDaily(){
  const set=buildDailySet();
  if(!set.length){toast('問題がありません');return;}
  beginStudyWith(shuffle(set),{daily:true});
}
function renderDaily(){
  const today=_today();
  const dc=(store.dc&&store.dc.d===today)?store.dc:null;
  const done=!!(dc&&dc.done);
  const sub=document.getElementById('dc-sub');
  const badge=document.getElementById('next-dc');
  const row=document.querySelector('.dc-row');
  const n=(dc&&dc.ids&&dc.ids.length)?dc.ids.length:DAILY_N;
  if(done){
    if(sub)sub.textContent='今日は完了！また明日 🎉';
    if(badge)badge.textContent='✓';
    if(row)row.classList.add('dc-done');
  }else{
    if(sub)sub.textContent='今日の'+n+'問にチャレンジ';
    if(badge)badge.textContent=n;
    if(row)row.classList.remove('dc-done');
  }
}


function fmtSec(s){s=Math.max(0,Math.round(s));if(s<60)return s+'秒';const m=Math.floor(s/60),x=s%60;return m+':'+String(x).padStart(2,'0');}

function renderPaceCard(secsUsed){
  const host=document.getElementById('e-pace');if(!host)return;
  const used=secsUsed||0;
  const target=EXAM_MIN*60/EXAM_N;
  const avg=used/Math.max(1,eN);
  const within=avg<=target;
  const col=within?'var(--success)':avg<=target*1.2?'var(--warning)':'var(--danger)';
  const times=[];for(let i=0;i<eN;i++){if(eQTime[i])times.push({i:i,t:eQTime[i],q:eQ[i]});}
  const slow=times.slice().sort((a,b)=>b.t-a.t).slice(0,3).filter(x=>x.t>target&&x.q);
  let h='<div class="sec-label" style="margin-top:0">⏱️ 時間の使い方</div>'
    +'<div class="pace-grid">'
    +'<div class="pace-cell"><div class="pace-n">'+fmtSec(used)+'</div><div class="pace-l">使用時間</div></div>'
    +'<div class="pace-cell"><div class="pace-n" style="color:'+col+'">'+fmtSec(avg)+'</div><div class="pace-l">1問平均</div></div>'
    +'<div class="pace-cell"><div class="pace-n">'+fmtSec(target)+'</div><div class="pace-l">目安ペース</div></div>'
    +'</div>'
    +'<div class="pace-msg '+(within?'ok':'warn')+'">'+(within
      ?'✅ 目安ペース内。本番でも時間に余裕を持てそうです。'
      :'⏳ 目安よりやや時間がかかっています。本番は1問 '+fmtSec(target)+' 目安で。')+'</div>';
  if(slow.length){
    h+='<div class="pace-slow-h">時間をかけすぎた問題（タップで学習）</div>';
    slow.forEach(x=>{
      const ok=arrEq((eAns[x.i]||[]).map(idx=>x.q.choices[idx]).slice().sort(),x.q.answers.slice().sort());
      h+='<button type="button" class="pace-slow" onclick="jumpQ('+x.q.id+')">'
        +'<span class="pace-slow-ic">'+(ok?'✅':'❌')+'</span>'
        +'<span class="pace-slow-q">Q'+(x.i+1)+'. '+escH(x.q.question.slice(0,38))+'…</span>'
        +'<span class="pace-slow-t">'+fmtSec(x.t)+'</span></button>';
    });
  }
  host.innerHTML=h;
}

function saveExamState(){
  if(!(eQ&&eQ.length))return;
  try{localStorage.setItem(EXAM_SAVE_KEY,JSON.stringify({v:2,ids:eQ.map(q=>q.id),ans:eAns,flag:eFlag,cur:eCur,secs:eSecs,disp:eDispArr,qt:eQTime,n:eN,timed:eTimed,budget:eBudget,ts:Date.now()}));}catch(e){}
}
function clearExamState(){try{localStorage.removeItem(EXAM_SAVE_KEY);}catch(e){}}
function loadExamState(){try{const r=localStorage.getItem(EXAM_SAVE_KEY);if(r)return JSON.parse(r);}catch(e){}return null;}
function hasResumableExam(){
  const st=loadExamState();
  if(!st||!Array.isArray(st.ids)||!st.ids.length)return false;
  const n=st.n||EXAM_N;
  if(st.ids.length!==n)return false;
  if(st.timed!==false&&!(st.secs>0))return false;
  return st.ids.every(id=>allQ.some(q=>q.id===id));
}
function resumeExam(){
  const st=loadExamState();
  if(!st){toast('再開できる試験がありません');return;}
  const n=st.n||EXAM_N;
  const qs=st.ids.map(id=>allQ.find(q=>q.id===id)).filter(Boolean);
  if(qs.length!==n){toast('問題が変わったため再開できません');clearExamState();renderResumeBanner();return;}
  eQ=qs;eAns=st.ans||{};eFlag=st.flag||{};eN=n;eTimed=st.timed!==false;eBudget=st.budget||EXAM_MIN*60;
  eCur=Math.min(eN-1,Math.max(0,st.cur||0));
  eSecs=eTimed?Math.max(1,st.secs||0):(st.secs||0);eQTime=st.qt||{};
  eDispArr=(Array.isArray(st.disp)&&st.disp.length===eN)?st.disp:eQ.map(q=>cshufOn()?shuffle(q.choices.map((_,i)=>i)):q.choices.map((_,i)=>i));
  eWrongOnly=false;
  document.getElementById('e-result').style.display='none';
  document.getElementById('e-area').style.display='block';
  goTo('exam');startTimer();renderEQ();
  toast('▶ 試験を再開しました');
}
function discardExam(){if(!confirm('中断した試験を破棄しますか？'))return;clearExamState();renderResumeBanner();toast('中断した試験を破棄しました');}
function renderResumeBanner(){
  const host=document.getElementById('resume-banner');if(!host)return;
  if(!hasResumableExam()){host.innerHTML='';return;}
  const st=loadExamState();
  const n=st.n||EXAM_N;
  const ans=Object.keys(st.ans||{}).filter(k=>(st.ans[k]||[]).length).length;
  const mm=Math.max(1,Math.round((st.secs||0)/60));
  const timeTxt=(st.timed!==false)?('残り約 '+mm+'分'):('経過 '+mm+'分・時間無制限');
  host.innerHTML='<div class="resume-card"><div class="resume-main"><div class="resume-t">⏸️ 中断した試験があります</div>'
    +'<div class="resume-sub">'+ans+' / '+n+'問 回答済 ・ '+timeTxt+'</div></div>'
    +'<div class="resume-btns"><button type="button" class="resume-go" onclick="resumeExam()">再開</button>'
    +'<button type="button" class="resume-x" onclick="discardExam()">破棄</button></div></div>';
}

function examTrendHTML(){
  const ex=(store.exams||[]).filter(e=>e&&typeof e.pct==='number');
  if(!ex.length)return '';
  const full=ex.filter(e=>(e.n||EXAM_N)===EXAM_N);
  const gsrc=full.length?full:ex;
  const data=gsrc.slice(-20),n=data.length;
  const W=300,H=120,padX=8,padY=12;
  const X=i=> n<=1? W/2 : padX+i*(W-2*padX)/(n-1);
  const Y=p=> H-padY-(p/100)*(H-2*padY);
  const passY=Y(PASS).toFixed(1);
  const line=data.map((e,i)=>X(i).toFixed(1)+','+Y(e.pct).toFixed(1)).join(' ');
  let dots='';data.forEach((e,i)=>{dots+='<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(e.pct).toFixed(1)+'" r="3.2" fill="'+(e.pass?'var(--success)':'var(--danger)')+'"/>';});
  const statSrc=full.length?full:ex;
  const best=Math.max.apply(null,statSrc.map(e=>e.pct));
  const passed=statSrc.filter(e=>e.pass).length;
  const svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="120" preserveAspectRatio="none" style="overflow:visible">'
    +'<line x1="'+padX+'" y1="'+passY+'" x2="'+(W-padX)+'" y2="'+passY+'" stroke="var(--text-sub)" stroke-width="1" stroke-dasharray="4 3" opacity=".6"/>'
    +'<text x="'+(W-padX)+'" y="'+(Y(PASS)-4).toFixed(1)+'" font-size="9" fill="var(--text-sub)" text-anchor="end">合格 '+PASS+'%</text>'
    +'<polyline points="'+line+'" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
    +dots+'</svg>';
  let rows='';
  ex.slice().reverse().slice(0,8).forEach(e=>{
    const d=new Date(e.ts||0),ds=(d.getMonth()+1)+'/'+d.getDate();
    const col=e.pass?'var(--success)':'var(--danger)';
    const tag=((e.n||EXAM_N)!==EXAM_N)?'<span class="extr-tag">'+e.n+'問</span>':'';
    rows+='<div class="extrow"><span class="extr-d">'+ds+'</span>'+tag
      +'<span class="extr-bar"><span class="extr-bf" style="width:'+e.pct+'%;background:'+col+'"></span></span>'
      +'<span class="extr-p" style="color:'+col+'">'+e.pct+'%</span>'
      +'<span class="extr-badge '+(e.pass?'p':'f')+'">'+(e.pass?'合格':'不合格')+'</span></div>';
  });
  return '<div class="card"><div class="ext-top">'
    +'<div><div class="ext-n">'+full.length+'</div><div class="ext-l">本番形式</div></div>'
    +'<div><div class="ext-n">'+(statSrc.length?best+'%':'—')+'</div><div class="ext-l">ベスト</div></div>'
    +'<div><div class="ext-n">'+passed+'</div><div class="ext-l">合格回数</div></div></div>'
    +'<div class="ext-graph">'+svg+'</div><div class="ext-list">'+rows+'</div></div>';
}

function applyFontSize(size){
  if(size!=='small'&&size!=='large')size='normal';
  if(document.body)document.body.setAttribute('data-fs',size);
  try{localStorage.setItem('sfq_fontsize',size);}catch(e){}
}

function renderOnlineState(){
  let bar=document.getElementById('offline-bar');
  const off=(typeof navigator!=='undefined')&&navigator.onLine===false;
  if(off){
    if(!bar){bar=document.createElement('div');bar.id='offline-bar';bar.className='offline-bar';bar.textContent='📴 オフライン — 保存済みデータで学習できます';document.body.appendChild(bar);}
    bar.classList.add('on');
  }else if(bar){bar.classList.remove('on');}
}
function installPWA(){
  const dp=window.__deferredInstall;
  if(!dp){toast('この環境では追加できません（対応ブラウザのメニューからホーム画面に追加してください）');return;}
  dp.prompt();
  if(dp.userChoice&&dp.userChoice.then){dp.userChoice.then(function(){window.__deferredInstall=null;try{renderMypage();}catch(e){}});}
  else window.__deferredInstall=null;
}
if(typeof window!=='undefined'){
  window.addEventListener('online',function(){try{renderOnlineState();}catch(e){}});
  window.addEventListener('offline',function(){try{renderOnlineState();}catch(e){}});
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__deferredInstall=e;try{var p=document.getElementById('pg-mypage');if(p&&p.classList.contains('active'))renderMypage();}catch(_){}});
  window.addEventListener('appinstalled',function(){window.__deferredInstall=null;try{renderMypage();}catch(_){}try{toast('✅ アプリを追加しました');}catch(_){}});
}

function qkPool(mode){
  const s=scopedQ();
  if(mode==='bm')return s.filter(q=>isBm(q.id));
  if(mode==='wrong')return s.filter(q=>needsReview(q.id));
  if(mode==='weak'){
    const ds=domainStats().filter(d=>d.t>0).sort((a,b)=>a.pct-b.pct).slice(0,3).map(d=>d.code);
    if(!ds.length)return s;
    return s.filter(q=>ds.includes(domainOf(q.id)));
  }
  return s;
}
function startQuick(mode){
  qkMode=(mode==='bm'||mode==='wrong'||mode==='weak')?mode:'all';
  const pool=qkPool(qkMode);
  if(!pool.length){toast('対象の問題がありません');return;}
  qkQueue=shuffle(pool);qkCur=0;qkRevealed=false;
  const d=document.getElementById('qk-done');if(d)d.style.display='none';
  const c=document.getElementById('qk-card');if(c)c.style.display='';
  goTo('quick');renderQK();
}
function setQkMode(m){startQuick(m);}
function syncQkChips(){['all','wrong','bm','weak'].forEach(m=>{const e=document.getElementById('qk-f-'+m);if(e)e.classList.toggle('on',m===qkMode);});}
function renderQK(){
  syncQkChips();
  const ab=document.getElementById('qk-actbar');if(ab)ab.style.display='';
  if(qkCur>=qkQueue.length){qkDone();return;}
  const q=qkQueue[qkCur];qkRevealed=false;
  const isM=q.answers.length>1;
  setText('qk-prog',(qkCur+1)+' / '+qkQueue.length);
  const pf=document.getElementById('qk-pfill');if(pf)pf.style.width=(qkCur/qkQueue.length*100)+'%';
  const badge=document.getElementById('qk-badge');
  if(badge){badge.textContent='Q'+q.id+' '+domainDef(domainOf(q.id)).emoji+(isM?' ★ '+q.answers.length+'つ':'');badge.className='qbadge'+(isM?' mbadge':'');}
  setText('qk-q',q.question);
  const ansEl=document.getElementById('qk-ans');if(ansEl){ansEl.innerHTML='';ansEl.classList.remove('show');}
  setText('qk-hint','タップで答えを表示 👆');
  setBmBtn(document.getElementById('qk-bm'),isBm(q.id));
}
function qkReveal(){
  if(qkCur>=qkQueue.length)return;
  if(qkRevealed){qkNav(1);return;}
  qkRevealed=true;
  const q=qkQueue[qkCur];
  const ansEl=document.getElementById('qk-ans');if(!ansEl)return;
  let h='<div class="qk-correct">'+q.answers.map(a=>'<span class="qk-c">✓ '+escH(a)+'</span>').join('')+'</div>';
  let kp=(q.explanation||'').split('\n').map(s=>s.trim()).filter(Boolean)[0]||'';
  kp=kp.replace(/^[\s□○◯●✓✔✗✘・\-\*]+/,'');
  q.answers.forEach(a=>{if(a&&kp.indexOf(a)===0)kp=kp.slice(a.length).replace(/^[\s　:：]+/,'');});
  if(kp)h+='<div class="qk-kp">'+escH(kp.slice(0,180))+(kp.length>180?'…':'')+'</div>';
  if(q.expFig||q.fig)h+=figHTML(q.expFig||q.fig);
  if(q.reference_url)h+='<a class="reflink" href="'+q.reference_url+'" target="_blank" onclick="event.stopPropagation()">🔗 ヘルプ</a>';
  ansEl.innerHTML=h;ansEl.classList.add('show');
  setText('qk-hint','タップで次へ →');
}
function qkNav(d){
  if(!qkQueue.length)return;
  qkCur=qkCur+d;
  if(qkCur<0)qkCur=0;
  if(qkCur>=qkQueue.length){qkDone();return;}
  renderQK();window.scrollTo({top:0,behavior:'smooth'});
}
function qkToggleBm(){
  const q=qkQueue[qkCur];if(!q)return;
  togBm(q.id);const on=isBm(q.id);
  setBmBtn(document.getElementById('qk-bm'),on);
  toast(on?'★ ブックマークに追加':'☆ ブックマーク解除');
}
function qkDone(){
  const c=document.getElementById('qk-card');if(c)c.style.display='none';
  const ab=document.getElementById('qk-actbar');if(ab)ab.style.display='none';
  const d=document.getElementById('qk-done');if(d)d.style.display='block';
  setText('qk-done-sub','全 '+qkQueue.length+' 問を見終えました');
}

const CHANGELOG=(typeof window!=='undefined'&&window.SFQ_CHANGELOG)||[];
function newsLatestId(){return CHANGELOG.length?CHANGELOG[0].id:'';}
function hasUnseenNews(){try{return !!CHANGELOG.length&&localStorage.getItem('sfq_news_seen')!==newsLatestId();}catch(e){return false;}}
function markNewsSeen(){try{localStorage.setItem('sfq_news_seen',newsLatestId());}catch(e){} try{if(window.__cloudMarkNews)window.__cloudMarkNews(newsLatestId());}catch(e){}}
if(typeof window!=='undefined')window.SFQ_syncNews=function(){try{renderNews();}catch(e){}};
function renderNews(){
  const has=hasUnseenNews();
  const dot=document.getElementById('news-dot');
  if(dot)dot.style.display=has?'':'none';
  const bell=document.getElementById('btn-news');
  if(bell)bell.setAttribute('title',has?'お知らせ（新着あり）':'お知らせ');
}
function buildNewsModal(){
  let ov=document.getElementById('news-modal');
  if(ov)return ov;
  ov=document.createElement('div');ov.id='news-modal';ov.className='sc-help';
  let body='';
  CHANGELOG.forEach((e,i)=>{
    body+='<div class="news-entry'+(i===0?' latest':'')+'">'
      +'<div class="news-entry-head"><span class="news-date">'+escH(e.date)+'</span><span class="news-etitle">'+escH(e.title)+'</span>'+(i===0?'<span class="news-new">NEW</span>':'')+'</div>'
      +'<ul class="news-items">'+e.items.map(it=>'<li>'+escH(it)+'</li>').join('')+'</ul></div>';
  });
  ov.innerHTML='<div class="sc-box news-box" role="dialog" aria-modal="true" aria-label="アップデート情報">'
    +'<div class="sc-head"><span>📣 アップデート情報</span><button class="sc-close" type="button" onclick="closeNews()" aria-label="閉じる">✕</button></div>'
    +'<div class="sc-body news-body">'+body+'</div></div>';
  ov.addEventListener('click',function(e){if(e.target===ov)closeNews();});
  document.body.appendChild(ov);
  return ov;
}
function openNews(){
  buildNewsModal();
  const ov=document.getElementById('news-modal');if(ov)ov.classList.add('on');
  markNewsSeen();renderNews();
}
function closeNews(){const ov=document.getElementById('news-modal');if(ov)ov.classList.remove('on');}


let ceN=20, ceRange='all', ceTimed=true, ceDoms={};
function openCustomExam(){
  let ov=document.getElementById('ce-modal');
  if(!ov){
    ov=document.createElement('div');ov.id='ce-modal';ov.className='sc-help';
    ov.addEventListener('click',function(e){if(e.target===ov)closeCustomExam();});
    document.body.appendChild(ov);
  }
  ov.classList.add('on');renderCustomExam();
}
function closeCustomExam(){const ov=document.getElementById('ce-modal');if(ov)ov.classList.remove('on');}
function ceSet(k,v){ if(k==='n')ceN=v; else if(k==='range')ceRange=v; else if(k==='timed')ceTimed=v; renderCustomExam(); }
function ceToggleDom(code){ ceDoms[code]=!ceDoms[code]; renderCustomExam(); }
function ceComputeUniverse(){
  let u=scopedQ();
  if(ceRange==='weak'){
    const ds=domainStats().filter(d=>d.t>0).sort((a,b)=>a.pct-b.pct).slice(0,3).map(d=>d.code);
    if(ds.length)u=u.filter(q=>ds.includes(domainOf(q.id)));
  }else if(ceRange==='select'){
    const picked=Object.keys(ceDoms).filter(k=>ceDoms[k]);
    if(picked.length)u=u.filter(q=>picked.includes(domainOf(q.id)));
  }
  return u;
}
function renderCustomExam(){
  const ov=document.getElementById('ce-modal');if(!ov)return;
  const chip=(on,label,fn)=>'<button type="button" class="ce-chip'+(on?' on':'')+'" onclick="'+fn+'">'+label+'</button>';
  const avail=ceComputeUniverse().length;
  const realN=Math.min(ceN,avail);
  const mins=Math.max(1,Math.round(EXAM_MIN*realN/EXAM_N));
  let domBoxes='';
  if(ceRange==='select'){
    domBoxes='<div class="ce-doms">'+DOMAIN_DEFS.map(d=>'<button type="button" class="ce-dom'+(ceDoms[d.code]?' on':'')+'" onclick="ceToggleDom(\''+d.code+'\')">'+d.emoji+' '+escH(d.name)+'</button>').join('')+'</div>';
  }
  ov.innerHTML='<div class="sc-box" role="dialog" aria-modal="true" aria-label="カスタム模試">'
    +'<div class="sc-head"><span>🎛️ カスタム模試</span><button class="sc-close" type="button" onclick="closeCustomExam()" aria-label="閉じる">✕</button></div>'
    +'<div class="sc-body">'
    +'<div class="ce-label">問題数</div><div class="ce-row">'+[10,20,30,60].map(x=>chip(ceN===x,x+'問',"ceSet('n',"+x+")")).join('')+'</div>'
    +'<div class="ce-label">出題範囲</div><div class="ce-row">'+chip(ceRange==='all','すべて',"ceSet('range','all')")+chip(ceRange==='weak','弱点分野',"ceSet('range','weak')")+chip(ceRange==='select','分野を選ぶ',"ceSet('range','select')")+'</div>'
    +domBoxes
    +'<div class="ce-label">時間制限</div><div class="ce-row">'+chip(ceTimed,'あり',"ceSet('timed',true)")+chip(!ceTimed,'なし',"ceSet('timed',false)")+'</div>'
    +'<div class="ce-avail">出題できる問題: '+avail+'問'+(avail<ceN?'（'+realN+'問で実施）':'')+' ・ '+(ceTimed?('制限 '+mins+'分'):'時間無制限')+'</div>'
    +'<button class="btn bp ce-start" type="button" onclick="startCustomExam()"'+(avail<1?' disabled':'')+'>この内容で開始</button>'
    +'</div></div>';
}
function startCustomExam(){
  if(!ceComputeUniverse().length){toast('対象の問題がありません');return;}
  const opts={n:ceN,timed:ceTimed};
  if(ceRange==='weak')opts.weak=true;
  else if(ceRange==='select'){const picked=Object.keys(ceDoms).filter(k=>ceDoms[k]);if(!picked.length){toast('分野を1つ以上選んでください');return;}opts.domains=picked;}
  closeCustomExam();
  startExam(opts);
}

function renderCoverage(){
  const host=document.getElementById('coverage');if(!host)return;
  const pool=scopedQ();const total=pool.length;
  if(!total){host.innerHTML='';return;}
  const seen=pool.filter(q=>!isUnseen(q.id)).length;
  const pct=Math.round(seen/total*100);
  const unseen=total-seen;
  const domTotal=DOMAIN_DEFS.length;
  const domSeen=domainStats().filter(d=>d.t>0).length;
  const domPct=domTotal?Math.round(domSeen/domTotal*100):0;
  host.innerHTML='<div class="card"><div class="sec-label" style="margin-top:0">📚 学習カバレッジ</div>'
    +'<div class="cov-row"><span class="cov-lab">全問</span><div class="cov-bar"><div class="cov-fill" style="width:'+pct+'%"></div></div><span class="cov-val">'+pct+'%</span></div>'
    +'<div class="cov-sub">'+seen+' / '+total+' 問に解答'+(unseen?' ・ 未着手 '+unseen+'問':' ・ 全問制覇 🎉')+'</div>'
    +'<div class="cov-row" style="margin-top:10px"><span class="cov-lab">分野</span><div class="cov-bar"><div class="cov-fill teal" style="width:'+domPct+'%"></div></div><span class="cov-val">'+domSeen+'/'+domTotal+'</span></div>'
    +'<div class="cov-sub">'+(domSeen>=domTotal?'全分野に着手済み 👍':'着手した分野 '+domSeen+' / '+domTotal)+'</div>'
    +(unseen?'<button class="btn bd cov-btn" type="button" onclick="startUnseen()">🆕 未着手 '+unseen+'問を学習</button>':'')
    +'</div>';
}
function startUnseen(){
  const pool=scopedQ().filter(q=>isUnseen(q.id));
  if(!pool.length){toast('未着手の問題はありません');return;}
  beginStudyWith(shuffle(pool));
}

async function updateApp(){
  toast('🔄 最新版に更新しています…');
  try{
    if(window.caches){const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));}
    if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.update().catch(function(){})));}
  }catch(e){}
  setTimeout(function(){location.reload();},900);
}

