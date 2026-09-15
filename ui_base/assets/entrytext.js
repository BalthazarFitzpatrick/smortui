// TWO TEXT PRIMITIVES FOR A LOG-LIKE FEED: a short header standing in for one the caller has no
// ready-made word for, and a body broken into small paragraphs rather than one dense block. Grew
// out of a card-timeline entry that dumped raw text under no header at all next to one that
// rendered a real bullet list for the same kind of content - both wanted the same shape, and
// neither should own text layout that has nothing to do with what a card or board is.
//
// PURE TEXT IN, TEXT OUT. No HTML, no escaping, no DOM. The caller already owns its own escaping
// and markup (a domain nowhere near this file's business), so these only ever hand back strings.

const ENTRY_HEADER_WORDS = 8;
const ENTRY_PARAGRAPH_CAP = 160; // characters - keeps a paragraph "small" even with no punctuation

// the text's own first sentence, clipped to a few words - stands in for a header when the caller
// has no ready-made verdict word of its own
function deriveEntryHeader(text, { maxWords = ENTRY_HEADER_WORDS } = {}) {
  const firstLine = (text || '').split('\n').find(line => line.trim()) || '';
  const sentenceMatch = firstLine.match(/^[^.!?]*[.!?]?/);
  const sentence = ((sentenceMatch && sentenceMatch[0]) || firstLine).trim() || firstLine.trim();
  const words = sentence.split(/\s+/).filter(Boolean);
  const clipped = words.slice(0, maxWords).join(' ');
  return words.length > maxWords ? `${clipped}...` : clipped;
}

// a paragraph past the cap gets broken on word boundaries too - guards the no-punctuation case a
// sentence split alone would miss
function wrapLongParagraph(text, charCap) {
  if (text.length <= charCap * 1.5) return [text];
  const words = text.split(/\s+/);
  const chunks = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > charCap) { chunks.push(current); current = word; }
    else current = next;
  }
  if (current) chunks.push(current);
  return chunks;
}

// the text's own blank-line paragraphs when there are any, else sentences regrouped under a
// character cap - never one dense block, but never one line per sentence either. a block that
// already fits under the cap is left whole: sentence-splitting on "." would otherwise mangle a
// short line that merely contains a file path or a decimal
function splitEntryParagraphs(text, { charCap = ENTRY_PARAGRAPH_CAP } = {}) {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];
  const blocks = trimmed.split(/\n\s*\n/).map(b => b.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (blocks.length > 1) return blocks.flatMap(b => wrapLongParagraph(b, charCap));
  const whole = blocks[0] || trimmed.replace(/\s+/g, ' ');
  if (whole.length <= charCap) return [whole];
  const sentences = whole.match(/[^.!?]+[.!?]*/g) || [whole];
  const paragraphs = [];
  let current = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const next = current ? `${current} ${s}` : s;
    if (current && next.length > charCap) { paragraphs.push(current); current = s; }
    else current = next;
  }
  if (current) paragraphs.push(current);
  return paragraphs.flatMap(p => wrapLongParagraph(p, charCap));
}
