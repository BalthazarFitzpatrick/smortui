// proves the three regimes are a measured choice rather than a guess, that the group moves only as
// far as focus took it and flips its anchor at either end, that the fold shuts a card at the edge
// facing its own pile without moving it, and that a pile change is what slows a whole redraw.
// PARSING IS NOT BEHAVIOUR - `node --check` says the file loads, which is silent about all of this.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../../ui_base/assets/pile.js', import.meta.url), 'utf8');
// no modules, no imports - top-level eval in an mjs does not leak to module scope, so build the
// helpers with `new Function` and pull them out explicitly
const load = new Function(`${src}
return { squareCard, stackHeight, fanHeight, pileSlot, computeColumnFit, placeGroup,
  computeColumnLayout, pileByRecency, pileLayerJitter, foldFrames, cardFlipFrames, flipDelta,
  movesAtAll, planPileMotion, CARD_GAP, PEEK, PILE, PORTRAIT_BELOW, MIN_PILED_CARDS,
  MAX_PILE_LAYERS, EDGE_CARDS, ROW_MOTION_MS, PILE_MOTION_MS, CLIP_REACH };`);
const m = load();

// ---- one card box, never shrunk ------------------------------------------------------------

assert.equal(m.squareCard(400), 400, 'a card is as tall as its column is wide');
assert.equal(m.squareCard(100), m.PORTRAIT_BELOW, 'below the floor it turns portrait, not smaller');

// the fixtures below are derived from the module's own constants rather than typed as pixels, so a
// tuning pass moves them with it instead of breaking them
const GAP = m.CARD_GAP;
const WIDE = 300; // square cards, WIDE px tall
const spread = n => (n ? n * WIDE + (n - 1) * GAP : 0);
const fan = n => (n <= 1 ? n * WIDE : 2 * WIDE + (n - 2) * m.PEEK);
const piles = () => 2 * m.pileSlot(GAP);

assert.equal(m.stackHeight(4, WIDE), spread(4));
assert.equal(m.fanHeight(4, WIDE), fan(4));

// ---- the three regimes, each at the boundary that picks it ------------------------------------

{
  // they all fit whole -> spread, nothing covering anything
  const fit = m.computeColumnFit(4, spread(4), GAP, WIDE);
  assert.deepEqual([fit.regime, fit.n, fit.card, fit.piles, fit.scrolls], [1, 4, WIDE, false, false]);
}
{
  // one pixel short of that -> the same whole cards overlap instead of shrinking
  const fit = m.computeColumnFit(4, spread(4) - 1, GAP, WIDE);
  assert.equal(fit.regime, 2);
  assert.equal(fit.card, WIDE, 'a fanned card is the same height as a spread one');
  assert.equal(fit.scrolls, false, 'the fan still fits, so nothing scrolls');
}
{
  // too dense even to fan, and enough cards to be worth piling -> a fan of the largest n that fits
  const room = fan(3) + piles();
  const fit = m.computeColumnFit(12, room, GAP, WIDE);
  assert.equal(fit.regime, 3);
  assert.equal(fit.n, 3, 'the largest group the room allows between the two piles');
  assert.equal(fit.card, WIDE, 'a piled column draws the same card box as a spread one');
  assert.ok(fan(fit.n) + piles() <= room && fan(fit.n + 1) + piles() > room, 'it is the largest');
}
{
  // TOO FEW CARDS TO PILE: below MIN_PILED_CARDS a pile has nothing worth holding, so the column
  // fans and scrolls rather than growing two piles over a handful of cards
  const fit = m.computeColumnFit(m.MIN_PILED_CARDS - 1, 10, GAP, WIDE);
  assert.equal(fit.regime, 2);
  assert.equal(fit.scrolls, true);
}
{
  // no room for even one whole card between the piles - the scrollbar gives, never the card
  const fit = m.computeColumnFit(30, 10, GAP, WIDE);
  assert.deepEqual([fit.regime, fit.n, fit.card, fit.scrolls], [3, 1, WIDE, true]);
}

// ---- the group moves one card per step, and the anchor flips only at the ends ------------------

assert.deepEqual(m.placeGroup(12, 3, null, 0, 'top'), {start: 0, anchor: 'top'},
  'at rest the group stays where it was');
assert.deepEqual(m.placeGroup(12, 3, 3, 0, 'top'), {start: 1, anchor: 'top'},
  'focus one past the group pulls it one card, not a page');
assert.deepEqual(m.placeGroup(12, 3, 2, 4, 'top'), {start: 2, anchor: 'top'},
  'focus above the group pulls it back to that card');
assert.equal(m.placeGroup(12, 3, 11, 8, 'top').anchor, 'bottom', 'the last card anchors the bottom');
assert.equal(m.placeGroup(12, 3, 0, 4, 'bottom').anchor, 'top', 'only the first card anchors back');
assert.equal(m.placeGroup(12, 3, 6, 4, 'bottom').anchor, 'bottom', 'the middle changes nothing');
assert.equal(m.placeGroup(12, 3, 11, 8, 'top').start, 9, 'the group never runs past the last card');

// ---- the drawn rows: piles, the group, and the cards cut at the far edge -----------------------

const cards = Array.from({length: 12}, (_, i) => ({id: `c${i}`}));

{
  // regime 1 is the whole column in order, nothing covered, nothing piled
  const out = m.computeColumnLayout(cards, null, 0, 'top', {regime: 1, n: 12});
  assert.equal(out.rows.length, 12);
  assert.ok(out.rows.every(r => r.type === 'card' && r.join === 'none' && !r.covered));
}
{
  const fit = {regime: 3, n: 3, card: WIDE, piles: true};
  const out = m.computeColumnLayout(cards, 4, 3, 'top', fit);
  const kinds = out.rows.map(r => r.type === 'pile' ? `pile-${r.side}` : `card-${r.idx}`);
  assert.deepEqual(kinds,
    ['pile-above', 'card-3', 'card-4', 'card-5', 'pile-below', 'card-10', 'card-11'],
    'pile above, the group, pile below, then the last EDGE_CARDS cut at the bottom edge');
  assert.equal(out.rows.filter(r => r.type === 'card').length, 3 + m.EDGE_CARDS);
  // the focused card is the open one: the card after it starts on its own bottom edge rather than
  // sliding up over it
  assert.equal(out.rows.find(r => r.idx === 5).join, 'flush');
  assert.equal(out.rows.find(r => r.idx === 4).join, 'peek');
  // covered is exactly "the row after me slides over me" - never the open card, never a run's last
  assert.equal(out.rows.find(r => r.idx === 3).covered, true);
  assert.equal(out.rows.find(r => r.idx === 4).covered, false, 'the open card is never covered');
  assert.equal(out.rows.find(r => r.idx === 5).covered, false, 'a pile follows it, so nothing does');
  // the items are handed back untouched - this layer knows nothing about what a card holds
  assert.equal(out.rows.find(r => r.idx === 4).card, cards[4]);
}
{
  // bottom anchor mirrors it: the column's FIRST cards are the ones cut, at the top
  const fit = {regime: 3, n: 3, card: WIDE, piles: true};
  const out = m.computeColumnLayout(cards, 11, 9, 'top', fit);
  const kinds = out.rows.map(r => r.type === 'pile' ? `pile-${r.side}` : `card-${r.idx}`);
  assert.deepEqual(kinds, ['card-0', 'card-1', 'pile-above', 'card-9', 'card-10', 'card-11']);
  assert.equal(out.anchor, 'bottom');
}

// ---- a pile's own order, and its layers' jitter ------------------------------------------------

{
  const held = cards.slice(0, 4);
  assert.deepEqual(m.pileByRecency(held, 'above').map(c => c.id), ['c3', 'c2', 'c1', 'c0'],
    'the upper pile takes the group\'s oldest, so its newest card is the one drawn on top');
  assert.deepEqual(m.pileByRecency(held, 'below').map(c => c.id), ['c0', 'c1', 'c2', 'c3']);
  assert.notEqual(held[0], undefined);
  assert.deepEqual(held.map(c => c.id), ['c0', 'c1', 'c2', 'c3'], 'the caller\'s array is not reordered');
}
{
  // SAME ID, SAME LAYER, ALWAYS - a pile that reshuffles on every redraw reads as the stack twitching
  assert.deepEqual(m.pileLayerJitter('card-a'), m.pileLayerJitter('card-a'));
  assert.notDeepEqual(m.pileLayerJitter('card-a'), m.pileLayerJitter('card-b'));
  for (const id of ['a', 'bb', 'ccc', 'dddd', 'eeeee']) {
    const {dx, dy, rot} = m.pileLayerJitter(id);
    assert.ok(Math.abs(dx) <= 8, `dx out of range: ${dx}`);
    assert.ok(Math.abs(dy) <= 10, `dy must stay inside the row gap it may protrude into: ${dy}`);
    assert.ok(Math.abs(rot) >= 0.6 && Math.abs(rot) <= 2.2, `rot out of range: ${rot}`);
  }
}

// ---- the fold: the card is eaten at the edge facing its pile, and never travels ----------------

{
  const box = {left: 0, top: 0, width: 200, height: 120};
  const above = m.foldFrames(box, true);
  assert.equal(above.open.translate, '0px 0px');
  assert.equal(above.folded.translate, '0px 0px', 'THE CARD NEVER TRAVELS - only its clip moves');
  // a pile above holds the card's top edge and climbs its bottom: the inset's BOTTOM is what shuts
  const [, , aboveBottom] = above.folded.clipPath.match(/inset\((\S+) \S+ (\S+)/);
  assert.equal(aboveBottom, `${box.height + m.CLIP_REACH}px`, 'shut past its own box, shadow and all');
  const below = m.foldFrames(box, false);
  const belowTop = below.folded.clipPath.match(/inset\((\S+)/)[1];
  assert.equal(belowTop, `${box.height + m.CLIP_REACH}px`, 'a pile below holds the bottom instead');
  assert.notEqual(above.folded.clipPath, below.folded.clipPath);
}
{
  // a card replayed from its old box is NEVER SCALED - it would stretch its own text. it starts
  // where it was and the height it gained is uncovered by the clip
  const from = {left: 0, top: 40, width: 200, height: 100};
  const to = {left: 0, top: 0, width: 200, height: 160};
  const [start, end] = m.cardFlipFrames(from, to);
  assert.equal(start.translate, '0px 40px');
  assert.ok(!('scale' in start) && !('scale' in end), 'no scale on a card, ever');
  assert.ok(start.clipPath.includes('60px'), 'the 60px it gained is what the clip holds back');
  assert.equal(end.translate, '0px 0px');
}
{
  // a pile is the same box every time, so its own replay is a plain slide about the two centres
  const d = m.flipDelta({left: 0, top: 0, width: 100, height: 50}, {left: 10, top: 30, width: 100, height: 50});
  assert.deepEqual([d.x, d.y, d.sx, d.sy], [-10, -30, 1, 1]);
  assert.equal(m.movesAtAll(d), true);
  assert.equal(m.movesAtAll(m.flipDelta({left: 0, top: 0, width: 100, height: 50}, {left: 0, top: 0, width: 100, height: 50})), false);
}

// ---- one pile change slows the whole redraw, so the rows below slide with the card -------------

{
  const prior = new Map([['a', 'card'], ['b', 'card'], ['c', 'pile-above']]);
  const next = new Map([['a', 'pile-above'], ['b', 'card'], ['c', 'card']]);
  const plan = m.planPileMotion(prior, next);
  const pile = plan.piles.get('pile-above');
  assert.deepEqual(pile.landing, ['a']);
  assert.deepEqual(pile.lifting, ['c']);
  assert.equal(pile.countAt, m.PILE_MOTION_MS, 'a landing card must be all the way in before the count ticks');
  assert.equal(plan.duration, m.PILE_MOTION_MS);
}
{
  // a card the caller has never seen before is not a move - it has no prior role to leave
  const plan = m.planPileMotion(new Map(), new Map([['a', 'pile-above']]));
  assert.equal(plan.piles.size, 0);
  assert.equal(plan.duration, m.ROW_MOTION_MS, 'no pile touched, so the plain row timing');
}
{
  // a card lifting off and nothing landing: the pile's count drops at once
  const plan = m.planPileMotion(new Map([['a', 'pile-below']]), new Map([['a', 'card']]));
  assert.equal(plan.piles.get('pile-below').countAt, 0);
}

console.log('pile layout ok');
