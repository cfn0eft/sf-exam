'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function readBank(slug) {
  if (process.env.SFQ_PRIVATE_DATA_ROOT) {
    const base = path.resolve(process.env.SFQ_PRIVATE_DATA_ROOT);
    const rel = path.relative(ROOT, base);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error('Private data must live outside the public repository');
    return JSON.parse(fs.readFileSync(path.join(base, 'certifications', slug, 'data', 'questions.json'), 'utf8'));
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'question-catalog.json'), 'utf8'));
  if (!catalog[slug] || !Array.isArray(catalog[slug].items)) throw new Error('Missing question metadata: ' + slug);
  // Public CI checks relationships and engine behavior using explicitly synthetic text.
  return catalog[slug].items.map(q => ({ ...q, question: '検証用の架空問題 ' + q.id,
    choices: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'], answers: ['選択肢A'], multi: false, diff: 2,
    explanation: '公開CI専用の架空データです。', reference_url: 'https://trailhead.salesforce.com/' }));
}
module.exports = { readBank };
