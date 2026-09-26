#!/usr/bin/env node
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const storage = new Map();
const listeners = {};
const nodes = new Map();
function node(id) {
  const classes = new Set();
  if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', inert: false,
    classList: { add(c) { classes.add(c); }, remove(c) { classes.delete(c); }, contains(c) { return classes.has(c); } }, setAttribute() {}, appendChild() {} });
  return nodes.get(id);
}
const ctx = {
  localStorage: { getItem: k => storage.get(k) || null },
  document: { readyState: 'loading', addEventListener() {}, getElementById: id => id === 'sfq-bank-status' ? nodes.get(id) || null : node(id),
    querySelectorAll: () => [node('app-main'), node('bottom-nav')], createElement: () => node('new'), body: node('body') },
  addEventListener: (name, fn) => { listeners[name] = fn; }, location: { hostname: 'localhost' },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'progression.js'), 'utf8'), ctx);
const P = ctx.SFQ_PROG;
const acquired = { 'sf-admin': '2026-01-01', 'app-builder': '2026-02-01', developer: '2026-03-01' };
const p = { acquired, locked: {}, elective: 'agentforce' };
assert.equal(P.stateOf('sf-admin'), 'open');
assert.equal(P.stateOf('app-builder'), 'locked');
assert.equal(P.stateOf('developer', { acquired: { 'app-builder': '2026-01-01' } }), 'open');
for (const slug of P.POOL) {
  assert.equal(P.stateOf(slug, p), 'restricted');
  assert.equal(P.canChoose(slug, p), false);
  assert.equal(P.unlocked(slug, p), false);
  assert.equal(P.stateOf(slug, { acquired: { [slug]: '2026-01-01' } }), 'restricted');
}
storage.set('sfq_elective', 'agentforce');
storage.set('sfqdev_v1', JSON.stringify({ acquiredDate: '2026-01-01', specialistAccess: true }));
assert.equal(P.stateOf('agentforce'), 'restricted', 'ローカル進捗は許可の代わりにならない');
ctx.SFQ_SPECIALIST_ACCESS = true;
assert.equal(P.stateOf('agentforce', p), 'open');
assert.equal(P.stateOf('sales-cloud', p), 'locked');
assert.equal(P.canChoose('sales-cloud', p), false, '同時に複数資格は選択できない');
assert.equal(P.canChoose('sales-cloud', { acquired, elective: '' }), true);
assert.equal(P.canChoose('sales-cloud', { acquired: {}, elective: '' }), false);
assert.equal(P.stateOf('agentforce', { ...p, locked: { agentforce: 1 } }), 'acquired');
assert.equal(P.stateOf('future-cert', p), 'coming');
ctx.SFQ_PROGRESS = p;
ctx.CERT_CONFIG = { slug: 'agentforce' };
P.renderGate();
assert.equal(node('app-main').inert, false);
ctx.SFQ_SPECIALIST_ACCESS = false;
listeners['sfq-progress']();
assert.equal(node('pgl-title').textContent, '利用できません');
assert.equal(node('app-main').inert, true);
ctx.SFQ_IS_ADMIN = true;
for (const slug of P.ORDER.concat(P.POOL)) assert.equal(P.stateOf(slug, {}), 'open');
listeners['sfq-progress']();
assert.equal(node('app-main').inert, false);
ctx.SFQ_IS_ADMIN = false;
assert.equal(P.stateOf('agentforce'), 'restricted');
// A stale local store must never flash a lock before cloud progress is ready.
ctx.location.hostname = 'cfn0eft.github.io';
ctx.CERT_CONFIG = { slug: 'developer' };
ctx.SFQ_PROGRESS = { acquired: {}, locked: {}, elective: '' };
delete ctx.SFQ_PROGRESS_READY;
P.renderGate();
assert.equal(P.isReady(), false);
assert.equal(node('sfq-prog-lock').classList.contains('show'), false);
assert.equal(node('app-main').inert, true);
ctx.SFQ_PROGRESS = { acquired: { 'app-builder': '2026-01-01' }, locked: {}, elective: '' };
ctx.SFQ_PROGRESS_READY = true;
node('sfq-bank-status');
listeners['sfq-progress']();
assert.equal(node('sfq-prog-lock').classList.contains('show'), false);
assert.equal(node('app-main').inert, true, '問題の取得中も画面を操作できない');
nodes.delete('sfq-bank-status');
P.renderGate();
assert.equal(node('app-main').inert, false);
ctx.SFQ_PROGRESS = { acquired: {}, locked: {}, elective: '' };
P.renderGate();
assert.equal(node('sfq-prog-lock').classList.contains('show'), true, '取得順による実際のロックは維持');
assert.equal(node('app-main').inert, true);
ctx.SFQ_PROGRESS_READY = false;
listeners['sfq-progress']();
assert.equal(node('sfq-prog-lock').classList.contains('show'), false, '再ログイン確認中は前アカウントのロックを隠す');
ctx.SFQ_IS_ADMIN = true;
ctx.SFQ_PROGRESS_READY = true;
listeners['sfq-progress']();
assert.equal(node('sfq-prog-lock').classList.contains('show'), false);
assert.equal(node('app-main').inert, false);
ctx.location.hostname = 'localhost';
ctx.SFQ_PROGRESS_READY = false;
assert.equal(P.isReady(), true);
ctx.SFQ_EMULATOR = true;
assert.equal(P.isReady(), false, 'エミュレータではクラウド同様に確認を待つ');
console.log('✅ コア資格・専門資格の許可・取得順・直接URL・許可解除・管理者の回帰テスト成功');
