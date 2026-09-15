'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { readBank } = require('./question-source');
const root = path.resolve(__dirname, '..');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function compile(rows) {
  const chunks = []; let pending = [];
  function flush() { if (!pending.length) return; const json = JSON.stringify(pending);
    chunks.push({id: 'part-' + String(chunks.length).padStart(3,'0'), count: pending.length, sha256: sha(json), json}); pending = []; }
  for (const q of rows) { if (Buffer.byteLength(JSON.stringify([q])) > 240000) throw new Error('Oversized question ' + q.id);
    if (Buffer.byteLength(JSON.stringify([...pending, q])) > 240000) flush(); pending.push(q); }
  flush();
  const hash = sha(JSON.stringify(rows));
  return { manifest: { schema:1, activeVersion:'v-' + hash.slice(0,24), count:rows.length, sha256:hash,
    chunks:chunks.map(({id,count,sha256})=>({id,count,sha256})) }, chunks };
}
function main() {
  if (!process.env.SFQ_PRIVATE_DATA_ROOT) throw new Error('SFQ_PRIVATE_DATA_ROOT is required; synthetic data must never be published');
  const privateRoot = path.resolve(process.env.SFQ_PRIVATE_DATA_ROOT);
  const catalog = {}, bundle = {};
  for (const slug of fs.readdirSync(path.join(root,'certifications'))) {
    const rows = readBank(slug); bundle[slug] = compile(rows);
    catalog[slug] = { count: rows.length, sha256:bundle[slug].manifest.sha256,
      items:rows.map(q=>({id:q.id,domain:q.domain,...(q.source?{source:q.source}:{})})) };
  }
  fs.mkdirSync(path.join(privateRoot,'releases'),{recursive:true});
  fs.writeFileSync(path.join(privateRoot,'releases','bank.json'),JSON.stringify(bundle));
  fs.writeFileSync(path.join(root,'question-catalog.json'),JSON.stringify(catalog,null,2)+'\n');
  console.log(Object.entries(bundle).map(([s,b])=>`${s}: ${b.manifest.count} questions / ${b.chunks.length} chunks`).join('\n'));
}
if (require.main === module) main();
module.exports={compile};
