/* =====================================================================
 * quiz-engine.js — SF資格 学習アプリ 共通クイズエンジン
 * 各資格ページは window.CERT_CONFIG を定義してこの1ファイルだけを読み込む。
 * データ（問題・分野・用語・設定マップ）は CERT_CONFIG.dataDir 配下の
 *   questions.json / domains.json / vocab.json / navmap.json を実行時 fetch。
 * 機能・配置・UI は全資格共通（sf-admin のフル機能を踏襲）。
 * HTML の inline onclick が依存するためグローバル関数のまま（IIFEで包まない）。
 * ===================================================================== */
let QDATA=[], CHDATA=[], NAVDATA=[], CRAMDATA=[], COMPDATA=[];
const CFG=(typeof window!=='undefined'&&window.CERT_CONFIG)||{};
const EXAM_N=CFG.examN||60, EXAM_MIN=CFG.examMin||105, PASS=CFG.pass||65, SKEY=CFG.storageKey||'sfq_default';
const DATA_DIR=CFG.dataDir||'data/';
/* ===== 分野定義は data/domains.json から実行時に読み込む（下の変数へ格納） ===== */
let DOMAIN_DEFS=[];
let QDOMAIN={};
let DOMAIN_BY={};
function domainOf(id){return QDOMAIN[id]||(DOMAIN_DEFS[0]?DOMAIN_DEFS[0].code:'');}
function domainDef(code){return DOMAIN_BY[code]||DOMAIN_BY[(DOMAIN_DEFS[0]||{}).code]||(DOMAIN_DEFS[0]||{code:'',name:'',weight:1,emoji:''});}
/* 追加機能の状態 */
let sDisp=[], eDispArr=[], sLowConf=false;
function cshufOn(){return localStorage.getItem('sfq_cshuf')!=='0';}
/* 問題報告のリポジトリ（全資格共通。CERT_CONFIG.repoUrl で上書き可） */
const REPO_URL=(CFG.repoUrl)||'https://github.com/cfn0eft/sf-exam';
/* デイリーチャレンジ進行中フラグ（studyDone で完了判定に使用） */
let dcActive=false;

// --- state ---
let allQ=[], filtQ=[];
let certName=CFG.certName||'';
let store=loadStore();
// study
let sQueue=[],sCur=0,sOk=0,sNg=0,sSel=[],sRevealed=false,sLastWrong=[];
// exam
let eQ=[],eCur=0,eAns={},eTimer=null,eSecs=0,eWrongOnly=false,eFlag={};
// filters
let fBm=false,fShuf=true,fMulti=false,fKw='',fWrong=false;
// 出典フィルタ（tyson=タイソンブログ / gen=生成 / all=両方）
let srcFilter=(function(){try{const v=localStorage.getItem('sfq_src');return (v==='tyson'||v==='gen')?v:'all';}catch(e){return 'all';}})();
function inScope(q){return srcFilter==='all'||(q&&q.source===srcFilter);}
function scopedQ(){return allQ.filter(inScope);}
// vocab
let vQueue=[],vCur=0,vFilter='all',vFlipped=false;

// --- storage ---
function loadStore(){
  try{const r=localStorage.getItem(SKEY);if(r)return JSON.parse(r);}catch(e){}
  return{bm:[],hist:{},streak:0,vm:{},tbm:{},srs:{},daily:{},notes:{},examDate:'',goal:0,exams:[],badges:{},dc:{},acquiredDate:''};
}
function save(){try{localStorage.setItem(SKEY,JSON.stringify(store));}catch(e){} if(window.__cloudSave)window.__cloudSave();}
// --- クラウド同期アダプタ（cloud-sync.js から呼ばれる） ---
window.__getStore=function(){return store;};
window.__setStore=function(o){ if(!o||typeof o!=='object')return; store=o; if(!store.bm)store.bm=[]; if(!store.hist)store.hist={}; if(!store.vm)store.vm={}; if(!store.tbm)store.tbm={}; if(!store.srs)store.srs={}; if(!store.daily)store.daily={}; if(store.streak==null)store.streak=0; if(!store.notes)store.notes={}; if(!store.exams)store.exams=[]; if(!store.badges)store.badges={}; if(!store.dc||typeof store.dc!=='object')store.dc={}; if(store.examDate==null)store.examDate=''; if(store.goal==null)store.goal=0; if(store.acquiredDate==null)store.acquiredDate=''; try{localStorage.setItem(SKEY,JSON.stringify(store));}catch(e){} };
window.__refreshUI=function(){ try{buildKwFilter();}catch(e){} try{applyFilters();}catch(e){} try{homeStats();}catch(e){} try{renderTextbook();}catch(e){} try{renderNavMap();}catch(e){} try{renderChapNav();}catch(e){} };
function getH(id){return store.hist[id]||{c:0,w:0};}
function recH(id,ok,low){
  if(!store.hist[id])store.hist[id]={c:0,w:0};
  if(ok){store.hist[id].c++;store.streak=(store.streak||0)+1;}
  else{store.hist[id].w++;store.streak=0;}
  store.hist[id].last=ok?'c':'w';
  store.hist[id].lc=low?1:0;
  srsUpdate(id,ok,low);
  bumpDaily();
  save();
  if(typeof checkBadges==='function')checkBadges();
}
// 直近の解答が不正解か（=復習対象）。正解すると自動で外れる。
// last 未記録の旧データは w>0 をフォールバック判定。
function isWrong(id){const h=store.hist[id];if(!h)return false;if(h.last)return h.last==='w';return h.w>0;}
// 未回答＝解答履歴が無い（正誤いずれもまだ記録されていない）問題。
function isUnseen(id){const h=store.hist[id];return !h||(h.c+h.w)===0;}
// 要復習＝間違えた問題、または「自信なし」で正解した問題（まぐれ）。
function needsReview(id){const h=store.hist[id];if(!h)return false;if(isWrong(id))return true;return h.last==='c'&&h.lc===1;}
function isLowConfCorrect(id){const h=store.hist[id];return !!(h&&h.last==='c'&&h.lc===1);}
function isBm(id){return store.bm.includes(id);}
function togBm(id){const i=store.bm.indexOf(id);if(i>=0)store.bm.splice(i,1);else store.bm.push(id);save();}
function getVM(k){return store.vm[k]||0;}
function setVM(k,v){store.vm[k]=v;save();}

// --- init ---
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
  allQ=[...QDATA];filtQ=[...allQ];
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
  try{applyFilters();}catch(e){}
  try{homeStats();}catch(e){}
  try{renderTextbook();}catch(e){}
  try{renderNavMap();}catch(e){}
  try{renderChapNav();}catch(e){}
  try{renderCram();}catch(e){}
  if(typeof updateSrsBtn==='function')updateSrsBtn();
  if(localStorage.getItem('dark')==='1')applyDark(true);
  try{maybeOnboard();}catch(e){}
  document.addEventListener('keydown',handleKey);
  try{var _hv=(location.hash||'').replace('#','');if(['cram','textbook','vocab','stats'].indexOf(_hv)>=0)goTo(_hv);}catch(e){}
});

// --- キーボード操作 ---
function handleKey(e){
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const tag=(e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select')return;
  // ? でショートカット一覧、Esc で閉じる（全モード共通）
  if(e.key==='?'){toggleShortcutHelp();e.preventDefault();return;}
  if(e.key==='Escape'){const _h=document.getElementById('sc-help');if(_h&&_h.classList.contains('on')){toggleShortcutHelp(false);e.preventDefault();return;}}
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
      if(!sRevealed){if(sSel.length>0)checkAnswer();}
      else nextSQ();
    }
  }else if(examActive){
    if(document.getElementById('e-area').style.display==='none')return;
    const q=eQ[eCur];if(!q)return;
    const isM=q.answers.length>1;
    if(/^[1-9]$/.test(e.key)){
      const oi=(eDispArr[eCur]||[])[parseInt(e.key,10)-1];
      if(oi!=null){selEChoice(oi,isM);e.preventDefault();}
    }else if(e.key==='ArrowRight'||e.key==='Enter'){
      if(eCur<EXAM_N-1){eNav(1);e.preventDefault();}
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
  sel.innerHTML='<option value="">🏷️ キーワードで絞り込み（全て）</option>';
  sorted.forEach(([k,n])=>{
    const o=document.createElement('option');o.value=k;o.textContent=k+'（'+n+'問）';sel.appendChild(o);
  });
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
  const scoped=scopedQ();
  filtQ=scoped.filter(q=>{
    if(fNew&&!isUnseen(q.id))return false;
    if(fWrong&&!isWrong(q.id))return false;
    if(fLc&&!isLowConfCorrect(q.id))return false;
    if(fBm&&!isBm(q.id))return false;
    if(fMulti&&q.answers.length<2)return false;
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
  // 「次にやる」カード用ミラー
  const nwEl=document.getElementById('next-wrong');
  if(nwEl)nwEl.textContent=wc;
  const lc=scoped.filter(q=>isLowConfCorrect(q.id)).length;
  const lcEl=document.getElementById('lc-count');
  if(lcEl)lcEl.textContent=lc?' '+lc:'';
  const el=document.getElementById('f-count');
  if(el)el.textContent='対象: '+filtQ.length+' 問';
}
// 出典フィルタの切替（HTMLのchipから呼ばれる）
function setSrcFilter(v){
  if(v!=='all'&&v!=='tyson'&&v!=='gen')v='all';
  srcFilter=v;
  try{localStorage.setItem('sfq_src',v);}catch(e){}
  syncSrcChips();
  try{applyFilters();}catch(e){}
  try{updateSrsBtn();}catch(e){}
  try{homeStats();}catch(e){}
}
function syncSrcChips(){
  ['all','tyson','gen'].forEach(s=>{
    const c=document.getElementById('chip-src-'+s);
    if(c)c.classList.toggle('on',s===srcFilter);
  });
  // 件数表示
  const ta=allQ.filter(q=>q.source==='tyson').length;
  const ga=allQ.filter(q=>q.source==='gen').length;
  const setBadge=(id,n)=>{const el=document.getElementById(id);if(el)el.textContent=n?' '+n:'';};
  setBadge('src-all-count',allQ.length);
  setBadge('src-tyson-count',ta);
  setBadge('src-gen-count',ga);
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
  // 「次にやる」カードの弱点件数（弱点分野の問題プール数）
  try{
    const ds=domainStats().filter(d=>d.t>0).sort((a,b)=>a.pct-b.pct);
    const weak=ds.slice(0,3).map(d=>d.code);
    const pool=weak.length?scopedQ().filter(q=>weak.includes(domainOf(q.id))).length:0;
    const nwk=document.getElementById('next-weak');
    if(nwk)nwk.textContent=pool||'';
  }catch(e){}
  try{renderStreakBanner();}catch(e){}
  try{renderHomeAcq();}catch(e){}
  try{renderDaily();}catch(e){}
  renderPlan();
}

// --- nav ---
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
  if(name==='mypage')renderMypage();
  if(name==='textbook'){
    document.getElementById('td-view').classList.remove('on');
    document.getElementById('tb-list').style.display='';
  }
  window.scrollTo(0,0);
}
function goBack(){
  if(eTimer){if(!confirm('試験を中断しますか？'))return;clearInterval(eTimer);eTimer=null;}
  goTo('home');
}

// --- dark mode ---
function applyDark(on){
  document.documentElement.setAttribute('data-theme',on?'dark':'');
  document.getElementById('btn-dark').textContent=on?'☀️':'🌙';
}
function toggleDark(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  applyDark(!isDark);
  localStorage.setItem('dark',isDark?'0':'1');
}

// --- toast ---
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}

// --- inline markdown ---
function mdInline(s){
  if(!s)return'';
  return s
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>');
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

// --- helpers ---
function shuffle(a){const r=[...a];for(let i=r.length-1;i>0;i--){const j=0|Math.random()*(i+1);[r[i],r[j]]=[r[j],r[i]];}return r;}
function arrEq(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function setText(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}

// ===== TEXTBOOK =====
let tbTab='guide';
function switchTbTab(t){
  tbTab=t;
  const ids=['guide','nav','cmp'];
  ids.forEach(k=>{
    const pane=document.getElementById('tb-'+k); if(pane)pane.style.display=(t===k?'':'none');
    const btn=document.getElementById('tt-'+k); if(btn)btn.classList.toggle('on',t===k);
  });
  if(t==='cmp'){
    renderCompare();
    // 学習ガイド専用UIは比較表タブでは非表示（sf-admin側の挙動は維持）
    const chNav=document.getElementById('ch-nav'); if(chNav)chNav.style.display='none';
    const sw=document.querySelector('#pg-textbook .search-wrap'); if(sw)sw.style.display='none';
    const mf=document.getElementById('tb-mark-filter'); if(mf)mf.style.display='none';
  } else {
    const chNav=document.getElementById('ch-nav'); if(chNav)chNav.style.display='';
    const sw=document.querySelector('#pg-textbook .search-wrap'); if(sw)sw.style.display='';
    // mark-filter は renderTextbook 内で表示制御しているので、ここでは触らない
  }
}
// ===== COMPARE（比較表ハブ） =====
function renderCompare(){
  const el=document.getElementById('tb-cmp'); if(!el)return;
  if(!COMPDATA||!COMPDATA.length){el.innerHTML='<div class="cram-empty">📊 この資格の比較表は準備中です。</div>';return;}
  el.innerHTML='';

  // ── ドメイン別ジャンプチップ（章を自動展開してからスクロール）──
  const navWrap=document.createElement('div');
  navWrap.className='filter-bar';
  navWrap.style.margin='0 0 12px';
  COMPDATA.forEach((s,i)=>{
    const def=domainDef(s.domain||'');
    const emo=def.emoji||'•';
    const btn=document.createElement('button');
    btn.className='chip';
    btn.innerHTML=emo+' '+escH(s.title);
    btn.addEventListener('click',()=>{
      const target=document.getElementById('cmp-sec-'+i);
      if(!target)return;
      target.classList.add('open');
      target.scrollIntoView({behavior:'smooth',block:'start'});
    });
    navWrap.appendChild(btn);
  });
  el.appendChild(navWrap);

  // ── 章ごと折りたたみで各セクションを並べる ──
  COMPDATA.forEach((sec,i)=>{
    if(!sec||!sec.content)return;
    const def=domainDef(sec.domain||'');
    const badge=def.name?'<span class="dom-tag" style="font-size:11px;color:var(--text-sub);margin-left:6px">'+def.emoji+' '+escH(def.name)+'</span>':'';

    const wrap=document.createElement('div');
    wrap.className='ch-item';wrap.id='cmp-sec-'+i;
    const head=document.createElement('div');head.className='ch-head';
    head.innerHTML=
      '<div class="ch-head-left"><span>'+escH(sec.title)+'</span>'+badge+'</div>'+
      '<div class="ch-head-right"><span class="ch-arrow">›</span></div>';
    head.addEventListener('click',()=>wrap.classList.toggle('open'));
    const bodyEl=document.createElement('div');bodyEl.className='ch-body';
    bodyEl.innerHTML='<div class="cram-sec" style="margin:0;padding:12px 14px">'+cramMd(sec.content)+'</div>';
    wrap.appendChild(head);wrap.appendChild(bodyEl);el.appendChild(wrap);
  });
}

// ===== TEXTBOOK MARK =====
function getTBM(k){return store.tbm[k]||0;}
function setTBM(k,v){store.tbm[k]=v;save();}
function cycleTBM(k){setTBM(k,(getTBM(k)+1)%3);}
const MARK_ICON=[' ','🔖','✓'];
const MARK_CLASS=['','bm','done'];

// ─── 章ナビゲーションピル ───
let currentTbChap=-1;
let markFilter='all'; // 'all','bm','undone','done'

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
  // open it
  if(!el.classList.contains('open'))el.classList.add('open');
  el.scrollIntoView({behavior:'smooth',block:'start'});
  // highlight pill
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

// ─── 章まとめモーダル ───
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
    // Exam point hint
    if(t.examPoints&&t.examPoints.length){
      const hint=document.createElement('div');hint.className='sum-sep';
      hint.textContent='⚡ '+escH(t.examPoints[0].replace(/\*\*/g,'').slice(0,50));
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

// ─── 章プログレス更新 ───
function updateChapProgress(ci){
  const ch=CHDATA[ci];
  const total=ch.terms.length;
  const done=ch.terms.filter(t=>getTBM(t.title||t.jaName)===2).length;
  const bm=ch.terms.filter(t=>getTBM(t.title||t.jaName)===1).length;
  const el=document.getElementById('chp-'+ci);
  if(el)el.textContent=done?('✓'+done+'/'+total):(bm?('🔖'+bm):(''+total+'用語'));
  const fill=document.getElementById('chfill-'+ci);
  if(fill)fill.style.width=(total?Math.round(done/total*100):0)+'%';
  // pill
  const pill=document.getElementById('cp-'+ci);
  if(pill){
    pill.querySelector('.pill-prog').textContent=done>0?(' '+done+'/'+total):'';
  }
}

// 用語詳細 前後ナビ用
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
    // Filter terms by markFilter
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

    // ── Chapter header ──
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
    // まとめボタン
    head.querySelector('.ch-summary-btn').addEventListener('click',ev=>openSummary(ci,ev));
    head.addEventListener('click',()=>wrap.classList.toggle('open'));

    // ── Progress bar ──
    const pbar=document.createElement('div');pbar.className='ch-prog-bar';
    pbar.innerHTML='<div class="ch-prog-fill" id="chfill-'+ci+'" style="width:'+(ch.terms.length?Math.round(done/ch.terms.length*100):0)+'%"></div>';

    // ── Term list ──
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
function escH(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function renderNavMap(){
  const el=document.getElementById('tb-nav');el.innerHTML='';
  NAVDATA.forEach((sec,si)=>{
    if(!sec.content.trim())return;

    // ── 本文ビルド（旧ロジックを踏襲）──
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

    // ── 章ごと折りたたみで包む ──
    const wrap=document.createElement('div');
    wrap.className='ch-item';wrap.id='nm-sec-'+si;
    const head=document.createElement('div');head.className='ch-head';
    head.innerHTML=
      '<div class="ch-head-left"><span>'+escH(sec.title)+'</span></div>'+
      '<div class="ch-head-right"><span class="ch-arrow">›</span></div>';
    head.addEventListener('click',()=>wrap.classList.toggle('open'));
    const bodyEl=document.createElement('div');bodyEl.className='ch-body';
    bodyEl.innerHTML='<div class="nm-sec" style="margin:0;padding:12px 14px;box-shadow:none;border-radius:0">'+body+'</div>';
    wrap.appendChild(head);wrap.appendChild(bodyEl);el.appendChild(wrap);
  });
}
// ===== CRAM（直前まとめ）=====
// cram.json は navmap.json と同じく [{title, content}]。content は簡易Markdown
// （### 小見出し / | テーブル | / - 箇条書き / 1. 番号 / > 引用・注意 / **強調**）。
function cramMd(text){
  const lines=String(text||'').split('\n');
  let out='',listType=null,i=0;
  const closeList=()=>{ if(listType){out+='</'+listType+'>';listType=null;} };
  const cellsOf=r=>r.split('|').filter((_,idx,a)=>idx>0&&idx<a.length-1).map(c=>c.trim());
  const isSep=r=>/^\s*\|?[\s:|-]+\|?\s*$/.test(r)&&r.indexOf('-')>=0;
  while(i<lines.length){
    const raw=lines[i], t=raw.trim();
    // table（ヘッダ行 + 区切り行）
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

  // ── 章ジャンプチップ（タップで自動展開＋スクロール）──
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

  // ── 章ごと折りたたみ ──
  CRAMDATA.forEach((sec,i)=>{
    if(!sec)return;
    const wrap=document.createElement('div');
    wrap.className='ch-item';wrap.id='cram-sec-'+i;
    const head=document.createElement('div');head.className='ch-head';
    head.innerHTML=
      '<div class="ch-head-left"><span>'+escH(sec.title||'（無題）')+'</span></div>'+
      '<div class="ch-head-right"><span class="ch-arrow">›</span></div>';
    head.addEventListener('click',()=>wrap.classList.toggle('open'));
    const bodyEl=document.createElement('div');bodyEl.className='ch-body';
    bodyEl.innerHTML='<div class="cram-sec" style="margin:0;padding:12px 14px">'+cramMd(sec.content||'')+'</div>';
    wrap.appendChild(head);wrap.appendChild(bodyEl);el.appendChild(wrap);
  });
}
function tbSearch(q){
  const query=q.toLowerCase().trim();
  const clearBtn=document.getElementById('tb-clear');
  if(clearBtn)clearBtn.style.display=query?'':'none';
  document.querySelectorAll('.ch-item').forEach(c=>c.classList.remove('open'));
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
  // Prev/Next nav
  const prevBtn=document.getElementById('td-prev');
  const nextBtn=document.getElementById('td-next');
  const posEl=document.getElementById('td-pos');
  if(prevBtn)prevBtn.disabled=ti===0;
  if(nextBtn)nextBtn.disabled=ti===total-1;
  if(posEl)posEl.textContent=escH(CHDATA[ci].chapter.replace(/^第\d+章[:：]\s*/,''))+'  '+(ti+1)+'/'+total;
  refreshTDMark();
  document.getElementById('tb-list').style.display='none';
  document.getElementById('td-view').classList.add('on');
  window.scrollTo(0,0);
}
function closeTD(){
  document.getElementById('td-view').classList.remove('on');
  document.getElementById('tb-list').style.display='';
}
function jumpQ(qid){
  const q=allQ.find(q=>q.id===qid);if(!q){toast('問題が見つかりません');return;}
  sQueue=[q];sCur=0;sOk=0;sNg=0;dcActive=false;
  document.getElementById('s-end').style.display='none';
  document.getElementById('s-card').style.display='block';
  setText('sess-ok-txt','✓ 0');setText('sess-ng-txt','✗ 0');
  goTo('study');renderSQ();toast('Q'+qid+' を表示中');
}

// ===== VOCAB =====
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

// ===== STUDY MODE =====
function startStudy(){
  applyFilters();
  if(filtQ.length===0){toast('対象の問題がありません');return;}
  sQueue=fShuf?shuffle([...filtQ]):[...filtQ];
  sCur=0;sOk=0;sNg=0;sRevealed=false;dcActive=false;
  document.getElementById('s-end').style.display='none';
  document.getElementById('s-card').style.display='block';
  setText('sess-ok-txt','✓ 0');setText('sess-ng-txt','✗ 0');
  goTo('study');renderSQ();
}
function renderSQ(){
  if(sCur>=sQueue.length){studyDone();return;}
  const q=sQueue[sCur];sSel=[];sRevealed=false;sLowConf=false;
  const isM=q.answers.length>1;
  setText('s-prog',(sCur+1)+' / '+sQueue.length);
  document.getElementById('s-pfill').style.width=(sCur/sQueue.length*100)+'%';
  const badge=document.getElementById('s-badge');
  badge.textContent='Q'+q.id+' '+domainDef(domainOf(q.id)).emoji+(isM?' ★ '+q.answers.length+'つ選択':'');
  badge.className='qbadge'+(isM?' mbadge':'');
  setText('s-qtext',q.question);
  const bmbtn=document.getElementById('s-bmbtn');
  bmbtn.textContent=isBm(q.id)?'★':'☆';
  bmbtn.className='bmbtn'+(isBm(q.id)?' on':'');
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
  document.getElementById('s-check').disabled=true;
  const cf=document.getElementById('s-conf');if(cf)cf.classList.remove('on');
  const expEl=document.getElementById('s-exp');
  expEl.className='exp-box';expEl.innerHTML='';expEl.setAttribute('aria-live','polite');
  document.getElementById('s-next-row').style.display='none';
  var _sa=document.getElementById('s-act');if(_sa)_sa.style.display='flex';
  var _sb=document.getElementById('study-actbar');if(_sb)_sb.style.display='';
  const memo=document.getElementById('s-memo');if(memo)memo.value=(store.notes&&store.notes[q.id])||'';
  const ms=document.getElementById('memo-saved');if(ms)ms.classList.remove('on');
}
function selChoice(idx,isM){
  if(sRevealed)return;
  if(isM){const p=sSel.indexOf(idx);if(p>=0)sSel.splice(p,1);else sSel.push(idx);}
  else sSel=[idx];
  document.querySelectorAll('#s-choices .choice').forEach(item=>{
    const oi=+item.dataset.oi,on=sSel.includes(oi);
    item.classList.toggle('sel',on);
    item.setAttribute('aria-pressed',on?'true':'false');
    item.querySelector('.cmark').textContent=on?(isM?'✓':item.dataset.num):item.dataset.num;
  });
  document.getElementById('s-check').disabled=sSel.length===0;
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
  exp.innerHTML='<div class="exp-head"><span>'+(isOk?'✅':'❌')+'</span><span>'+(isOk?'正解！':'不正解')+'</span></div>'
    +'<div style="white-space:pre-wrap">'+escH(q.explanation||'解説なし')+'</div>';
  if(q.reference_url){exp.innerHTML+='<br><a class="reflink" href="'+q.reference_url+'" target="_blank">🔗 Salesforce ヘルプを見る</a>';}
  // related terms（vocab に一致した用語）
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
  // 全キーワード（vocab未収録のものも見える化）
  const kws=q.keywords||[];
  if(kws.length){
    const matched=new Set(rel.map(r=>r.kw));
    const kDiv=document.createElement('div');kDiv.style.marginTop='10px';
    kDiv.innerHTML='<div style="font-size:11px;color:var(--text-sub);font-weight:700;margin-bottom:5px">🏷️ キーワード</div>';
    kws.forEach(kw=>{
      const c=document.createElement('span');c.className='qchip';
      if(matched.has(kw)){
        // 関連用語にあれば、用語詳細にジャンプ
        c.style.cssText='background:var(--purple-light);color:var(--purple);cursor:pointer';
        c.title='用語詳細を開く';
        const hit=rel.find(r=>r.kw===kw);
        c.onclick=()=>showTD(hit.ci,hit.ti);
      } else {
        // 未マッチでも分野統計/絞り込みのトリガーになる
        c.style.cssText='background:var(--bg-sub,#f3f4f6);color:var(--text-sub);cursor:pointer';
        c.title='このキーワードで絞り込み';
        c.onclick=()=>{
          fKw=kw;
          const sel=document.getElementById('f-kw'); if(sel){
            // optionが無ければ作って選択
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
  // 問題報告リンク（内容が誤り/古いと思ったら GitHub Issue をプリフィルで起票）
  const repDiv=document.createElement('div');repDiv.className='report-wrap';
  const repBtn=document.createElement('button');repBtn.type='button';repBtn.className='report-link';
  repBtn.textContent='⚠️ この問題を報告';repBtn.onclick=()=>reportQuestion(q.id);
  repDiv.appendChild(repBtn);exp.appendChild(repDiv);
  document.getElementById('s-check').disabled=true;
  document.getElementById('s-next-row').style.display='flex';
  var _sa2=document.getElementById('s-act');if(_sa2)_sa2.style.display='none';
  recH(q.id,isOk,sLowConf);
  if(isOk&&sLowConf)toast('🤔 自信なし → 復習リストに追加');
  if(isOk){sOk++;setText('sess-ok-txt','✓ '+sOk);}else{sNg++;setText('sess-ng-txt','✗ '+sNg);}
  setTimeout(()=>{const ex=document.getElementById('s-exp');if(ex)ex.scrollIntoView({behavior:'smooth',block:'nearest'});},90);
}
function nextSQ(){sCur++;renderSQ();window.scrollTo({top:0,behavior:'smooth'});}
function toggleBm(){
  const q=sQueue[sCur];if(!q)return;
  togBm(q.id);
  const on=isBm(q.id);
  const btn=document.getElementById('s-bmbtn');
  btn.textContent=on?'★':'☆';btn.className='bmbtn'+(on?' on':'');
  toast(on?'★ ブックマークに追加':'☆ ブックマーク解除');
}
function studyDone(){
  document.getElementById('s-card').style.display='none';
  document.getElementById('s-end').style.display='block';
  var _sb2=document.getElementById('study-actbar');if(_sb2)_sb2.style.display='none';
  const total=sOk+sNg,pct=total?Math.round(sOk/total*100):0;
  setText('s-end-score',pct+'%');
  setText('s-end-sub',total+'問中 '+sOk+'問正解');
  // このセッションで間違えた問題だけを即復習する導線
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
  // デイリーチャレンジを完走したら本日分を完了マーク
  if(dcActive){
    if(!store.dc||typeof store.dc!=='object')store.dc={};
    store.dc.d=_today();store.dc.done=1;save();
    dcActive=false;
    try{renderDaily();}catch(e){}
    toast('🎉 デイリーチャレンジ完了！また明日');
  }
}
// 直近セッションの誤答だけで学習を再開
function redoWrong(){if(sLastWrong&&sLastWrong.length)beginStudyWith(sLastWrong.slice());}

// ===== EXAM =====
function startExam(){
  if(scopedQ().length<EXAM_N){toast('問題数が不足しています（出典フィルタを「すべて」にすると増えます）');return;}
  eQ=pickWeightedExam(EXAM_N);eCur=0;eAns={};eFlag={};eSecs=EXAM_MIN*60;
  eDispArr=eQ.map(q=> cshufOn()? shuffle(q.choices.map((_,i)=>i)) : q.choices.map((_,i)=>i));
  document.getElementById('e-result').style.display='none';
  document.getElementById('e-area').style.display='block';
  goTo('exam');startTimer();renderEQ();
}
// 公式出題比率（分野の weight）に沿って EXAM_N 問を抽出。不足分は全体から補填。
function pickWeightedExam(n){
  const universe=scopedQ();
  const byD={};DOMAIN_DEFS.forEach(d=>byD[d.code]=[]);
  universe.forEach(q=>{const c=domainOf(q.id);(byD[c]||(byD[c]=[])).push(q);});
  Object.keys(byD).forEach(c=>byD[c]=shuffle(byD[c]));
  const totW=DOMAIN_DEFS.reduce((s,d)=>s+d.weight,0);
  const picked=[],used=new Set();
  DOMAIN_DEFS.forEach(d=>{
    const want=Math.round(n*d.weight/totW);
    (byD[d.code]||[]).slice(0,want).forEach(q=>{picked.push(q);used.add(q.id);});
  });
  if(picked.length<n){
    const rest=shuffle(universe.filter(q=>!used.has(q.id)));
    for(const q of rest){if(picked.length>=n)break;picked.push(q);used.add(q.id);}
  }
  return shuffle(picked.slice(0,n));
}
function startTimer(){
  if(eTimer)clearInterval(eTimer);
  tickTimer();
  eTimer=setInterval(()=>{eSecs--;tickTimer();if(eSecs<=0){clearInterval(eTimer);eTimer=null;finishExam();}},1000);
}
function tickTimer(){
  const h=0|eSecs/3600,m=0|(eSecs%3600)/60,s=eSecs%60;
  const str=h?h+':'+pad(m)+':'+pad(s):m+':'+pad(s);
  const el=document.getElementById('e-timer');
  el.textContent='⏱ '+str;el.className='timer'+(eSecs<300?' warn':'');
}
function pad(n){return String(n).padStart(2,'0');}
function renderEQ(){
  const q=eQ[eCur];const isM=q.answers.length>1;
  setText('e-prog',(eCur+1)+' / '+EXAM_N);
  document.getElementById('e-pfill').style.width=((eCur+1)/EXAM_N*100)+'%';
  const badge=document.getElementById('e-badge');
  badge.textContent='Q'+(eCur+1)+(isM?' ★ '+q.answers.length+'つ選択':'');
  badge.className='qbadge'+(isM?' mbadge':'');
  setText('e-qtext',q.question);
  const saved=eAns[eCur]||[];
  const order=eDispArr[eCur]||q.choices.map((_,i)=>i);
  const cel=document.getElementById('e-choices');cel.innerHTML='';
  order.forEach(oi=>{
    const ch=q.choices[oi],on=saved.includes(oi);
    const item=document.createElement('div');item.className='choice'+(on?' sel':'');item.dataset.oi=oi;
    const mark=document.createElement('div');mark.className='cmark';
    mark.textContent=on?(isM?'☑':'●'):(isM?'□':'○');
    const span=document.createElement('span');span.textContent=ch;
    item.appendChild(mark);item.appendChild(span);
    item.addEventListener('click',()=>selEChoice(oi,isM));
    cel.appendChild(item);
  });
  document.getElementById('e-prev').disabled=eCur===0;
  document.getElementById('e-next').style.display=eCur===EXAM_N-1?'none':'';
  const fb=document.getElementById('e-flag');
  if(fb){const on=!!eFlag[eCur];fb.classList.toggle('on',on);fb.textContent=on?'🚩 見直す':'🚩 後で';}
  renderNavPalette();
  updateFinishLabel();
}
// 解答済み問題数
function eAnsweredCount(){let n=0;for(let i=0;i<EXAM_N;i++){if((eAns[i]||[]).length>0)n++;}return n;}
// フラグの切替
function toggleEFlag(){eFlag[eCur]=!eFlag[eCur];renderEQ();}
// 任意の問題へジャンプ
function eJump(i){closeExamSheet();eCur=Math.max(0,Math.min(EXAM_N-1,i));renderEQ();window.scrollTo({top:0,behavior:'smooth'});}
// 採点ボタンに解答済み件数を表示
function updateFinishLabel(){
  const b=document.getElementById('e-finish');if(!b)return;
  b.innerHTML='📝 採点する<span class="finish-cnt">'+eAnsweredCount()+'/'+EXAM_N+' 回答</span>';
}
// 問題ナビゲータ（一覧グリッド）
function renderNavPalette(){
  const host=document.getElementById('e-navpal');if(!host)return;
  const done=eAnsweredCount();
  let h='<div class="navpal-head"><span>問題一覧</span><span class="navpal-cnt">'+done+' / '+EXAM_N+' 回答済</span></div>';
  h+='<div class="navgrid">';
  for(let i=0;i<EXAM_N;i++){
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
  const s=eAns[eCur];
  if(isM){const p=s.indexOf(idx);if(p>=0)s.splice(p,1);else s.push(idx);}
  else eAns[eCur]=[idx];
  renderEQ();
}
function eNav(d){eCur=Math.max(0,Math.min(EXAM_N-1,eCur+d));renderEQ();}
// 採点ボタン押下時：未回答／フラグがあれば確認シートを出し、無ければ即採点
function confirmFinishExam(){
  const unans=[];for(let i=0;i<EXAM_N;i++){if((eAns[i]||[]).length===0)unans.push(i);}
  let flags=0;for(let i=0;i<EXAM_N;i++){if(eFlag[i])flags++;}
  if(unans.length===0&&flags===0){finishExam();return;}
  showExamSheet(unans,flags);
}
// 採点前確認シート（DOMは初回に動的生成しbodyへ）
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
// 弱点分野コールアウト（合格ライン未満の分野を抽出）
function renderWeakCallout(byd){
  const host=document.getElementById('e-weak-callout');if(!host)return;
  const weak=DOMAIN_DEFS.filter(d=>{const b=byd[d.code];return b&&b.t&&Math.round(b.c/b.t*100)<PASS;});
  if(!weak.length){host.innerHTML='<div class="e-callout ok">🎉 全分野で合格ラインを超えています！</div>';return;}
  const names=weak.map(d=>d.name).join('・');
  host.innerHTML='<div class="e-callout">弱点は <b>'+escH(names)+'</b>。'
    +'<button type="button" class="e-callout-btn" onclick="startWeakDomains()">弱点分野を出題 →</button></div>';
}
// スコアリング（円グラフ）描画
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
    recH(q.id,isOk);
  });
  const pct=Math.round(ok/EXAM_N*100),pass=pct>=PASS;
  if(!store.exams)store.exams=[];
  store.exams.push({ts:Date.now(),pct:pct,ok:ok,n:EXAM_N,pass:pass,byd:byd});
  if(store.exams.length>50)store.exams=store.exams.slice(-50);
  save();
  checkBadges();
  document.getElementById('e-area').style.display='none';
  document.getElementById('e-result').style.display='block';
  renderScoreRing(pct,pass);
  setText('e-detail',EXAM_N+'問中 '+ok+'問正解');
  const pill=document.getElementById('e-pill');
  pill.textContent=(pass?'合格 🎉':'不合格 📖')+'（合格ライン '+PASS+'%）';
  pill.className='pass-pill '+(pass?'pass':'fail');
  renderExamDomains(byd);
  renderWeakCallout(byd);
  renderExamAcq(pass);
  eWrongOnly=false;
  const wt=document.getElementById('e-wrong-toggle');if(wt)wt.classList.remove('on');
  renderExamResultList();
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
    row.innerHTML='<span class="erow-ic">'+(isOk?'✅':'❌')+'</span>'
      +'<span class="erow-q">Q'+(i+1)+'. '+escH(q.question)+'</span>'
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

// ===== REVIEW =====
function startReview(){
  const bad=scopedQ().filter(q=>needsReview(q.id)||isBm(q.id));
  if(!bad.length){toast('復習する問題がありません');return;}
  beginStudyWith(shuffle(bad));
}
// 弱点分野（正答率の低い分野）を狙い撃ちで出題
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

// ===== STATS =====
function renderStats(){
  renderStatsSummary();
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

/* ===== 統計：合格可能性サマリー ===== */
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

/* ===== 分野別の習熟度 ===== */
function domainStats(){
  const agg={};DOMAIN_DEFS.forEach(d=>agg[d.code]={code:d.code,c:0,w:0});
  allQ.forEach(q=>{const c=domainOf(q.id),h=store.hist[q.id];if(!agg[c])agg[c]={code:c,c:0,w:0};if(h){agg[c].c+=h.c||0;agg[c].w+=h.w||0;}});
  return DOMAIN_DEFS.map(d=>{const a=agg[d.code]||{c:0,w:0};const t=a.c+a.w;return{code:d.code,c:a.c,w:a.w,t:t,pct:t?Math.round(a.c/t*100):0};});
}
function renderDomainList(){
  const host=document.getElementById('dom-list');if(!host)return;host.innerHTML='';
  const ds=domainStats();
  // 現プールの分野構成（公式比との乖離を可視化する）
  const poolCnt={}; allQ.forEach(q=>{const c=domainOf(q.id);poolCnt[c]=(poolCnt[c]||0)+1;});
  const poolN=allQ.length||1;
  ds.forEach(d=>{
    const def=domainDef(d.code),answered=d.t>0;
    const col=!answered?'var(--border)':d.pct>=80?'var(--success)':d.pct>=60?'var(--warning)':'var(--danger)';
    const cur=Math.round((poolCnt[d.code]||0)*100/poolN);
    const gap=cur-def.weight; // +なら過剰、−なら不足
    const gapTxt=Math.abs(gap)>=5?(gap>0?' <span style="color:var(--warning)">（プール+'+gap+')</span>':' <span style="color:var(--danger)">（プール'+gap+'）</span>'):'';
    const row=document.createElement('div');row.className='dom-row';
    row.innerHTML='<span class="dom-emoji">'+def.emoji+'</span>'
      +'<span class="dom-name">'+escH(def.name)+'<span class="dn-sub"> ・公式'+def.weight+'% / 現'+cur+'%'+gapTxt+'</span></span>'
      +'<div class="dom-bw"><div class="dom-bf" style="width:'+(answered?d.pct:0)+'%;background:'+col+'"></div></div>'
      +'<span class="dom-pct" style="color:'+(answered?col:'var(--text-sub)')+'">'+(answered?d.pct+'%':'—')+'</span>';
    host.appendChild(row);
  });
  // 凡例（公式比 vs 現プール比 の意味を明示）
  const note=document.createElement('div');
  note.style.cssText='font-size:11px;color:var(--text-sub);margin-top:6px;line-height:1.5';
  note.innerHTML='公式 = 試験の出題比率　／　現 = 現在のプールでの分野割合。試験モードは公式比で出題するので、現%が小さい分野ほど同じ問題が反復されやすい。';
  host.appendChild(note);
  const btn=document.getElementById('dom-focus-all');if(btn)btn.disabled=!ds.some(d=>d.t>0);
}

/* ===== 週次レポート ===== */
function _fmtD(x){return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}
function dayStreak(){
  const daily=store.daily||{};let n=0;const d=new Date();d.setHours(0,0,0,0);
  if(!daily[_fmtD(d)])d.setDate(d.getDate()-1);
  while(daily[_fmtD(d)]){n++;d.setDate(d.getDate()-1);}
  return n;
}
// ヒーロー内の学習ストリーク表示（連続学習日数）
function renderStreakBanner(){
  const n=dayStreak();
  const hs=document.getElementById('hh-streak');
  if(hs){ if(n>=1){hs.style.display='';hs.textContent='🔥 '+n+'日連続';} else hs.style.display='none'; return; }
}
// ===== 初回オンボーディング（3ステップ） =====
const OB_STEPS=[
  {ic:'📖',t:'学習モードで解く',d:'1問ずつ解いて、選択肢ごとの解説をその場で確認。間違えた問題は自動で復習キューに入ります。'},
  {ic:'⏱️',t:'試験モードで実力チェック',d:'公式の出題比率で本番形式60問。問題ナビゲータ・🚩フラグ・採点で弱点が分かります。'},
  {ic:'🔁',t:'復習で定着させる',d:'ホームの「今日やる」から、間違えた問題・SRS・弱点分野をワンタップで復習できます。'}
];
let _obI=0;
function maybeOnboard(){
  try{if(localStorage.getItem('sfq_onboarded')==='1')return;}catch(e){return;}
  _obI=0;showOnboard();
}
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
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">'
    +'<button onclick="obClose()" style="background:none;border:none;color:var(--text-sub);font-size:13px;cursor:pointer">スキップ</button>'
    +'<button onclick="obNext()" style="background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;padding:10px 20px;cursor:pointer">'+(last?'はじめる 🚀':'次へ →')+'</button>'
    +'</div>';
}
function obNext(){if(_obI<OB_STEPS.length-1){_obI++;obRender();}else obClose();}
function obClose(){try{localStorage.setItem('sfq_onboarded','1');}catch(e){}const d=document.getElementById('ob-dim');if(d)d.remove();}
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

/* ===== 実績バッジ ===== */
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
  BADGES.forEach(b=>{if(!store.badges[b.id]&&safeTest(b)){store.badges[b.id]=_today();last=b;}});
  if(last){save();toast('🏅 バッジ獲得: '+last.title);}
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

/* ===== 学習計画（受験日カウントダウン＋デイリー目標） ===== */
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
    let pace='今日の残り '+Math.max(0,goal-todayN)+'問';
    const unans=allQ.length-answeredCount();
    if(ed&&daysLeft>0&&unans>0)pace='未着手 '+unans+'問　目安 '+Math.ceil(unans/daysLeft)+'問/日で全問完了';
    setText('plan-pace',pace);
  }else goalWrap.style.display='none';
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

/* ===== マイページ ===== */
function renderMypage(){
  const host=document.getElementById('mypage-body');if(!host)return;
  const acc=(typeof window.__sfqAccount==='function')?window.__sfqAccount():{loggedIn:false,local:true};
  // 学習サマリー
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
      +'<button class="mp-b mp-logout" onclick="window.__sfqLogout&&window.__sfqLogout()">ログアウト</button></div>';
  }else if(acc.local){
    accHtml='<div class="acct"><div class="mp-avatar" style="background:linear-gradient(135deg,#64748b,#94a3b8)">💻</div><div><div class="mp-name">ローカルモード</div><div class="mp-asub">この端末内に保存（クラウド同期なし）</div></div></div>';
  }else{
    accHtml='<div class="acct"><div class="mp-avatar">👤</div><div><div class="mp-name">未ログイン</div><div class="mp-asub">ホームからログインすると進捗が同期されます</div></div></div>';
  }
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const sf=(typeof srcFilter!=='undefined')?srcFilter:'all';
  const seg=(on,label,fn)=>'<button class="'+(on?'on':'')+'" onclick="'+fn+'">'+label+'</button>';
  const ed=store.examDate||'',goal=store.goal||0;let planInfo='';
  if(ed){const t=new Date();t.setHours(0,0,0,0);const e=new Date(ed+'T00:00:00');const dl=Math.round((e-t)/86400000);const unans=allQ.length-answered;
    planInfo=dl>=0?('受験まで あと '+dl+'日'+(dl>0&&unans>0?' ・ 未着手 '+unans+'問 → 目安 '+Math.ceil(unans/dl)+'問/日':'')):'受験日は過ぎました';}
  const acqHtml=store.acquiredDate
    ? '<div class="mp-acqdone"><span class="mp-acqic">🎓</span><span class="mp-main"><div class="mp-acqt">この資格は取得済みです 🎉</div><div class="mp-osub">取得日: '+escH(store.acquiredDate)+'</div></span><button class="mp-undo" onclick="unacquireCert()">取り消し</button></div>'
    : '<div class="mp-opt" style="border:none;padding:0"><span class="mp-ic">🎓</span><span class="mp-main">資格の取得<div class="mp-osub">本番試験に合格したら記録しましょう</div></span><button class="mp-acqbtn" onclick="acquireCert()">取得済みにする</button></div>';
  host.innerHTML=
    '<div class="card">'+accHtml+'</div>'
    +'<div class="sec-label">資格の取得</div>'
    +'<div class="card">'+acqHtml+'</div>'
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
    +'<div class="sec-label">学習計画</div>'
    +'<div class="card"><div class="mp-field"><label>🎯 受験予定日</label><input type="date" id="mp-exam" value="'+escH(ed)+'"></div>'
    +'<div class="mp-field"><label>📅 1日の目標問題数</label><input type="number" id="mp-goal" min="0" max="999" value="'+(goal||'')+'" placeholder="例: 20"></div>'
    +(planInfo?'<div class="mp-planinfo">'+escH(planInfo)+'</div>':'')
    +'<div class="mp-saverow"><button class="mp-b mp-save" onclick="saveMyPlan()">保存</button><button class="mp-b mp-clear" onclick="clearMyPlan()">クリア</button></div></div>'
    +'<div class="sec-label">表示・データ</div>'
    +'<div class="card">'
    +'<div class="mp-opt"><span class="mp-ic">🌓</span><span class="mp-main">テーマ<div class="mp-osub">画面の配色</div></span><span class="mp-seg">'+seg(!dark,'ライト','setDarkMode(false)')+seg(dark,'ダーク','setDarkMode(true)')+'</span></div>'
    +'<div class="mp-opt"><span class="mp-ic">📚</span><span class="mp-main">既定の出典<div class="mp-osub">学習・試験で出す問題</div></span><span class="mp-seg">'+seg(sf==='all',"すべて","setSrcFilter('all');renderMypage()")+seg(sf==='tyson',"タイソン","setSrcFilter('tyson');renderMypage()")+seg(sf==='gen',"生成","setSrcFilter('gen');renderMypage()")+'</span></div>'
    +'<div class="mp-opt"><span class="mp-ic">⌨️</span><span class="mp-main">キーボード操作<div class="mp-osub">PCショートカット一覧（<b>?</b> キーでも開く）</div></span><span class="mp-seg"><button onclick="toggleShortcutHelp(true)">表示</button></span></div>'
    +'<div class="mp-opt"><span class="mp-ic">💾</span><span class="mp-main">バックアップ<div class="mp-osub">進捗をファイルに保存／復元（端末移行・消失対策）</div></span><span class="mp-seg"><button onclick="exportProgress()">書出</button><button onclick="document.getElementById(\'mp-import\').click()">読込</button></span></div>'
    +'<input type="file" id="mp-import" accept="application/json,.json" style="display:none" onchange="importProgress(this)">'
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

/* ===== 資格の取得（取得済みの記録と主張表示） ===== */
function acquireCert(){
  store.acquiredDate=_today();save();
  homeStats();renderMypage();
  try{if(document.getElementById('pg-exam').classList.contains('active'))renderExamAcq(true);}catch(e){}
  toast('🎓 取得済みにしました！おめでとうございます 🎉');
}
function unacquireCert(){
  if(!confirm('「取得済み」を取り消しますか？'))return;
  store.acquiredDate='';save();homeStats();renderMypage();
  try{if(document.getElementById('pg-exam').classList.contains('active'))renderExamAcq(false);}catch(e){}
  toast('取得済みを取り消しました');
}
// ホームのヒーローに取得済みバッジ／リボンを反映
function renderHomeAcq(){
  const on=!!store.acquiredDate;
  const badge=document.getElementById('hh-acq'),rib=document.getElementById('hh-ribbon'),hero=document.querySelector('.home-hero');
  if(badge){ if(on){badge.style.display='';badge.textContent='🎓 取得済み・'+store.acquiredDate;} else badge.style.display='none'; }
  if(rib)rib.style.display=on?'':'none';
  if(hero)hero.classList.toggle('acq',on);
}
// 試験結果（合格時）に取得ボタン or 取得済み表示
function renderExamAcq(pass){
  const host=document.getElementById('e-acq');if(!host)return;
  if(store.acquiredDate){host.innerHTML='<div class="e-acq-done">🎓 取得済み（'+escH(store.acquiredDate)+'）</div>';}
  else if(pass){host.innerHTML='<button class="btn e-acq-btn" onclick="acquireCert()">🎓 この資格を取得済みにする</button>';}
  else host.innerHTML='';
}

function resetAll(){
  if(!confirm('進捗データをすべてリセットしますか？'))return;
  store={bm:[],hist:{},streak:0,vm:{},tbm:{},srs:{},daily:{},notes:{},examDate:'',goal:0,exams:[],badges:{},dc:{},acquiredDate:''};save();homeStats();renderTextbook();renderMypage();toast('🗑️ リセットしました');
}

// ===== SRS（間隔反復・SM-2簡易版）=====
function _today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function _addDays(n){const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// 解答のたびに次回出題日(due)を更新。正解で間隔を伸ばし、不正解で当日に戻す。
function srsUpdate(id,ok,low){
  if(!store.srs)store.srs={};
  const s=store.srs[id]||{ivl:0,ease:2.5,reps:0};
  if(ok&&low){
    s.reps=Math.max(1,s.reps||0);
    s.ivl=1;
    s.ease=Math.max(1.3,(s.ease||2.5)-0.05);
    s.due=_addDays(1);            // 自信なし正解 → 翌日に再出題
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
    s.due=_today();           // 当日中に再復習
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
// startStudy() を経由せずに任意の問題集合で学習を開始（applyFilters で上書きされないように）
function beginStudyWith(arr,opts){
  if(!arr||!arr.length){toast('対象の問題がありません');return;}
  dcActive=!!(opts&&opts.daily);
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

// ===== 学習カレンダー（ヒートマップ）=====
function bumpDaily(){if(!store.daily)store.daily={};const t=_today();store.daily[t]=(store.daily[t]||0)+1;}
function renderHeatmap(){
  const host=document.getElementById('heatmap');if(!host)return;
  const daily=store.daily||{};
  const WEEKS=20;
  const today=new Date();today.setHours(0,0,0,0);
  const fmt=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  // 起点 = (今日からWEEKS*7-1日前) を含む週の日曜
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

/* =====================================================================
 * 追加機能：問題フリーワード検索 / ショートカットヘルプ / 問題報告 /
 *           進捗バックアップ / デイリーチャレンジ
 * ===================================================================== */

// ----- 問題のフリーワード検索（ホーム）-----
// f-text は applyFilters() に統合済み。ここでは入力に応じて学習ボタン等を更新。
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

// ----- キーボードショートカット一覧（? キー / マイページから）-----
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

// ----- 問題の報告（GitHub Issue をプリフィルで起票）-----
function reportQuestion(id){
  const q=allQ.find(x=>x.id===id)||sQueue[sCur];
  if(!q){toast('問題が見つかりません');return;}
  const cert=CFG.shortName||CFG.certName||CFG.slug||'';
  const title='[問題報告] '+(CFG.slug||'')+' Q'+id;
  const body=[
    '## 対象問題',
    '- 資格: '+cert,
    '- 問題ID: Q'+id,
    (q.reference_url?'- 参照: '+q.reference_url:''),
    '',
    '## 問題文',
    (q.question||'').slice(0,500),
    '',
    '## 気になった点（当てはまるものに x、補足を歓迎）',
    '- [ ] 正解が誤り',
    '- [ ] 解説が誤り／古い',
    '- [ ] 選択肢の不備',
    '- [ ] 日本語が不自然',
    '- [ ] その他',
    '',
    '### 補足',
    ''
  ].filter(l=>l!==null&&l!==undefined).join('\n');
  const url=REPO_URL+'/issues/new?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(body);
  try{window.open(url,'_blank','noopener');toast('📝 報告フォームを開きました');}
  catch(e){toast('ブラウザで開けませんでした');}
}

// ----- 進捗のバックアップ（書き出し／読み込み）-----
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
      window.__setStore(o);   // 欠損フィールド正規化＋localStorage 保存
      save();                 // クラウドにも反映
      try{window.__refreshUI&&window.__refreshUI();}catch(e){}
      try{homeStats();}catch(e){}
      try{renderMypage();}catch(e){}
      toast('✅ 進捗を復元しました');
    }catch(e){toast('読み込みに失敗しました（JSON 解析エラー）');}
    input.value='';
  };
  rd.readAsText(f);
}

// ----- デイリーチャレンジ（今日の10問：SRS期日→要復習→弱点→未着手の順で構成）-----
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
  take(inS.filter(q=>srsDue(q.id)));                       // 1) SRS 期日到来
  take(inS.filter(q=>needsReview(q.id)));                  // 2) 要復習（誤答・自信なし正解）
  let weak=[];
  try{weak=domainStats().filter(d=>d.t>0).sort((a,b)=>a.pct-b.pct).slice(0,3).map(d=>d.code);}catch(e){}
  if(weak.length)take(inS.filter(q=>weak.includes(domainOf(q.id)))); // 3) 弱点分野
  take(inS.filter(q=>isUnseen(q.id)));                     // 4) 未着手
  take(inS);                                               // 5) 残りを補填
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

