// proves the two text primitives: header derivation clips to a few words on a sentence boundary,
// and paragraph splitting keeps blank-line paragraphs as given, regroups a dense block under the
// char cap, and leaves a short block whole rather than mangling it on stray punctuation.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../../ui_base/assets/entrytext.js', import.meta.url), 'utf8');
// no modules, no imports - top-level eval in an mjs does not leak to module scope, so build the
// two functions with `new Function` instead and pull them out explicitly
const load = new Function(`${src}\nreturn { deriveEntryHeader, splitEntryParagraphs };`);
const { deriveEntryHeader, splitEntryParagraphs } = load();

// header: clipped to maxWords, ellipsis only when the sentence actually ran past it
assert.equal(deriveEntryHeader('done: rebuilt the parser. more text after.'), 'done: rebuilt the parser.');
assert.equal(
  deriveEntryHeader('one two three four five six seven eight nine ten', { maxWords: 4 }),
  'one two three four...',
);
assert.equal(deriveEntryHeader(''), '');

// a short block is left whole, not sentence-split on a decimal or a path
assert.deepEqual(splitEntryParagraphs('fixed ui_base 0.1.2 pin.'), ['fixed ui_base 0.1.2 pin.']);

// blank-line paragraphs are respected as given
assert.deepEqual(
  splitEntryParagraphs('first part.\n\nsecond part.'),
  ['first part.', 'second part.'],
);

// a dense single block gets regrouped under the char cap, one paragraph per group of sentences
const long = 'a'.repeat(80) + '. ' + 'b'.repeat(80) + '. ' + 'c'.repeat(80) + '.';
const paras = splitEntryParagraphs(long, { charCap: 100 });
assert.ok(paras.length > 1, 'a block over the cap must split');
for (const p of paras) assert.ok(p.length <= 150, `paragraph too long: ${p.length}`);

// a run with no punctuation at all still wraps on word boundaries
const noPunct = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
const wrapped = splitEntryParagraphs(noPunct, { charCap: 50 });
assert.ok(wrapped.length > 1, 'a long run with no punctuation must still wrap');

console.log('entrytext ok');
