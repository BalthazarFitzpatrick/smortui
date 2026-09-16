// PILE AND FAN: how a column of cards behaves once its cards stop fitting. The rule this file
// exists to hold is that a card is NEVER SHRUNK - what gives is how the cards MEET. Grew out of a
// board whose plain columns and its dense ones each measured card height their own way and drew
// three different card sizes on one screen.
//
// PURE GEOMETRY IN, PLAIN OBJECTS OUT. Nothing here touches the DOM, knows what a card holds, or
// reads a status - the host builds the elements, applies the numbers and owns every animation it
// plays. The one exception is readGapVar, which reads the host's own custom properties so the
// maths that sizes a column and the css that draws it can never drift apart.

// the tuning knobs live as custom properties on :root (base.css), read once here. the root element,
// not body: declared on body they resolve to the fallbacks below instead, which silently moves the
// drawn layout without moving the maths that sizes it. each fallback matches base.css exactly, so a
// missing var (an older stylesheet, or a test stub) changes nothing
function readGapVar(name, fallback) {
  const target = (typeof document !== 'undefined' && (document.documentElement || document.body)) || null;
  const css = target && globalThis.getComputedStyle?.(target);
  const raw = parseFloat(css?.getPropertyValue?.(name) || '');
  return Number.isFinite(raw) ? raw : fallback;
}

const MIN_PILED_CARDS = 5; // below this, a group between two piles has nothing left to pile
const PILE = 100; // a pile's fixed height - never shrinks or grows
const PILE_GAP_ABOVE = readGapVar('--pile-gap-above', 5); // extra space above a pile, past the row gap
const PILE_GAP_BELOW = readGapVar('--pile-gap-below', 5); // extra space below a pile, past the row gap
const PORTRAIT_BELOW = 230; // a column narrower than this keeps 230px of card height (portrait)
const EDGE_CARDS = 2; // the column's last (or first) cards shown past the far pile, cut at the edge
const MAX_PILE_LAYERS = 8; // more than this and the desk-pile look stops reading as individual cards

// ---- ONE CARD BOX, EVERY COLUMN TYPE, AND IT IS NEVER SHRUNK. a plain column, a fanned one and a
// piled one all draw the same card at the same height. what changes with density is how the cards
// MEET: spread a gap apart, or overlapping so a covered card shows PEEK of itself. these two
// numbers are the whole spacing model and every drawing path reads them here ---------------------

const CARD_GAP = readGapVar('--card-gap', 10); // between two rows that do not overlap
const PEEK = readGapVar('--stack-peek', 60); // the band a covered card still shows of itself

// a card is as tall as the column is wide - square - down to PORTRAIT_BELOW, where it keeps that
// height and turns portrait instead of shrinking further
function squareCard(width) {
  return Math.max(width, PORTRAIT_BELOW);
}

// pure: the room n cards need spread out - every card whole, one gap between each pair
function stackHeight(count, card) {
  return count ? count * card + (count - 1) * CARD_GAP : 0;
}

// pure: the room a FAN of n cards needs at its tallest. every card is whole; a covered one shows
// PEEK of itself, so the card over it starts PEEK below its top. the fan's last card is uncovered
// and so is the focused card wherever it sits - that pair is the shape that needs the most room
function fanHeight(n, card) {
  return n <= 1 ? n * card : 2 * card + (n - 2) * PEEK;
}

// pure: one pile's share of the column - its own height, its above/below knobs (the same margins
// .card-pile draws) and the one flex gap between it and the group
function pileSlot(gap) {
  return PILE + PILE_GAP_ABOVE + PILE_GAP_BELOW + gap;
}

// ---- THE THREE REGIMES, one explicit measured choice per column. what a column does when its
// cards stop fitting is OVERLAP THEM, never shrink them:
//   1 spread - they all fit whole: cards exactly CARD_GAP apart, nothing covering anything
//   2 fan    - they do not: the same whole cards overlap, each covered one showing PEEK of itself
//   3 piled  - not even fanned: the very same fan, of the largest n that fits, with a pile above
//              and a pile below taking the cards it cannot hold
// pure: the card count and the room/row gap/width a column has -> the regime and the numbers that
// draw it. `card` is the one card height throughout, whichever regime applies
function computeColumnFit(total, available, gap, width) {
  const card = squareCard(width);
  if (stackHeight(total, card) <= available) return {regime: 1, n: total, card, piles: false, scrolls: false};
  const fanned = fanHeight(total, card);
  // too few cards to leave a pile anything worth holding: they fan, and scroll if even that is
  // more than the column has
  if (fanned <= available || total < MIN_PILED_CARDS) {
    return {regime: 2, n: total, card, piles: false, scrolls: fanned > available};
  }
  const piles = 2 * pileSlot(gap);
  for (let n = total - 1; n >= 1; n--) {
    if (fanHeight(n, card) + piles <= available) return {regime: 3, n, card, piles: true, scrolls: false};
  }
  // not even one whole card between the two piles - the column scrolls at full card height, since
  // a shrunk card is the one thing no regime is allowed to draw
  return {regime: 3, n: 1, card, piles: true, scrolls: true};
}

// pure: moves the group only as far as focus left it - one card for one arrow press - and flips
// the anchor at either end: the last card anchors the column to the bottom edge, and only the
// first card anchors it back to the top
function placeGroup(total, n, focusIndex, start, anchor) {
  let next = start ?? 0;
  let side = anchor || 'top';
  if (focusIndex != null) {
    if (focusIndex === 0) side = 'top';
    if (focusIndex === total - 1) side = 'bottom';
    if (focusIndex < next) next = focusIndex;
    if (focusIndex > next + n - 1) next = focusIndex - n + 1;
  }
  return {start: Math.max(0, Math.min(next, total - n)), anchor: side};
}

// pure: the host's items in order, the focused index (or null at rest), the group's prior start and
// anchor, and the fit -> {start, anchor, rows}. regime 1 is the whole column spread in order.
// otherwise, top anchor: pile above, group, pile below, then the column's last cards, cut by the
// column's bottom edge - bottom anchor mirrors it. a card row's `join` says how it meets the row
// before it: 'peek' pulls it up over that card until only PEEK of it shows, 'flush' starts it on
// the open focused card's own bottom edge, 'none' is plain gapped flow. `covered` is the other side
// of that - the card underneath a 'peek', the one only showing its band.
// the items themselves are opaque: they are handed back untouched in each row's `card`
function computeColumnLayout(sorted, focusIndex, start, anchor, fit) {
  const total = sorted.length;
  if (fit.regime === 1) {
    const rows = sorted.map((card, idx) => ({type: 'card', idx, card, part: 'group', join: 'none', covered: false}));
    return {start: 0, anchor: 'top', rows};
  }
  const n = fit.n;
  const place = placeGroup(total, n, focusIndex, start, anchor);
  const end = place.start + n; // one past the group's last card
  const edge = Math.min(n, EDGE_CARDS);
  // only a focused card is open. at rest every card is covered by the next, the way the fan rests -
  // focus landing on one redraws the column around it, leaving covers it again
  const open = focusIndex;
  const rows = [];
  const pile = (from, to, side) => {
    if (to > from) rows.push({type: 'pile', side, cards: sorted.slice(from, to)});
  };
  const run = (from, to, part) => {
    for (let i = from; i < to; i++) {
      const join = i === from ? 'none' : i - 1 === open ? 'flush' : 'peek';
      rows.push({type: 'card', idx: i, card: sorted[i], join, part});
    }
  };
  if (place.anchor === 'top') {
    const tailFrom = Math.max(end, total - edge);
    pile(0, place.start, 'above');
    run(place.start, end, 'group');
    pile(end, tailFrom, 'below');
    run(tailFrom, total, 'edge');
  } else {
    const headTo = Math.min(edge, place.start);
    run(0, headTo, 'edge');
    pile(headTo, place.start, 'above');
    run(place.start, end, 'group');
    pile(end, total, 'below');
  }
  // a card is covered exactly when the row after it slides over it - never the open one, never the
  // last of a run, never one a pile follows
  rows.forEach((row, i) => {
    if (row.type === 'card') row.covered = rows[i + 1]?.join === 'peek';
  });
  return {start: place.start, anchor: place.anchor, rows};
}

// pure: the cards of one pile, most recently added first. a pile grows from the side facing the
// group: the upper pile takes the group's oldest, so its newest card is its last, and the lower
// pile takes the group's newest, so its newest is its first. the same card is the next one drawn
// back off it - which is what lets the host draw the pile's top layer as the card that went on last
function pileByRecency(cards, side) {
  return side === 'above' ? [...cards].reverse() : [...cards];
}

// ---- pile jitter: each drawn layer offset and rotated from that card's own id, so the same set of
// cards always draws the same pile and only changes when a card enters or leaves it. fnv-1a into a
// mulberry32 stream - a hash rather than Math.random because a pile that reshuffles on every redraw
// reads as the whole stack twitching -------------------------------------------------------------

function fnv1aHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const jitterBetween = (r, lo, hi) => lo + (hi - lo) * r();
const clampPileY = y => Math.max(-10, Math.min(10, y));

// pure: an id -> its layer's offset and rotation. dx +-8px, dy +-10px (clamped, same as the row gap
// a layer may protrude into), rotation +-0.6..2.2deg with a random sign
function pileLayerJitter(cardId) {
  const r = mulberry32(fnv1aHash(cardId));
  const dx = jitterBetween(r, -8, 8);
  const dy = clampPileY(jitterBetween(r, -10, 10));
  const rot = (r() < 0.5 ? -1 : 1) * jitterBetween(r, 0.6, 2.2);
  return {dx, dy, rot};
}

// ---- motion: a redraw replaces every row, so each row is replayed from where it was drawn last to
// where it is drawn now (flip) - a step reads as the column moving, never as a redraw. a plain step
// runs at the row timing, a step that touches a pile at the pile's slower one (planPileMotion).
// these build KEYFRAMES ONLY: the host plays them, and every frame uses the css translate/scale/
// clip-path properties rather than transform, so a focus lift (transform) runs underneath untouched

const ROW_MOTION_MS = 140; // the same duration the row-enter animation runs at (base.css)
const ROW_EASING = 'ease-out';
// a step that moves a card onto or off a pile is slower and softer, so the eye can follow the card:
// it shrinks into the pile over PILE_MOTION_MS and is gone once it is all the way in
const PILE_MOTION_MS = 300;
const PILE_SETTLE_MS = 120; // a count's pop, once the card is in, runs twice this
const PILE_EASING = 'cubic-bezier(0.45, 0, 0.25, 1)';
const CLIP_REACH = 40; // a clip this far outside the card keeps its own shadow uncut
const REST_FRAME = {translate: '0px 0px', scale: '1 1', opacity: 1};
const GROW_FRAME = {translate: '0px 0px', scale: '0.9 0.6', opacity: 0}; // a pile forming or emptying
// a pile forming in the room its first card is leaving never grows over that card: the card folds
// down to the pile's face and the pile only takes over at the end - the mirror when one empties
const FOLD_HANDOVER = 0.85;
const PILE_HANDOVER_IN = [{opacity: 0, offset: 0}, {opacity: 0, offset: FOLD_HANDOVER}, {opacity: 1, offset: 1}];
const PILE_HANDOVER_OUT = [{opacity: 1, offset: 0}, {opacity: 0, offset: 1 - FOLD_HANDOVER}, {opacity: 0, offset: 1}];

// pure: the translate and scale that put a box drawn at `to` back over `from`. css scales about the
// element's centre, so the translate is the difference between the two centres
function flipDelta(from, to) {
  return {
    x: (from.left + from.width / 2) - (to.left + to.width / 2),
    y: (from.top + from.height / 2) - (to.top + to.height / 2),
    sx: to.width ? from.width / to.width : 1,
    sy: to.height ? from.height / to.height : 1,
  };
}

function flipFrame(delta, opacity = 1) {
  return {translate: `${delta.x}px ${delta.y}px`, scale: `${delta.sx} ${delta.sy}`, opacity};
}

function movesAtAll(delta) {
  return Math.abs(delta.x) + Math.abs(delta.y) > 0.5 || Math.abs(delta.sx - 1) + Math.abs(delta.sy - 1) > 0.005;
}

const px = v => `${Math.round(v * 100) / 100}px`;
const clipInset = (top, bottom) => `inset(${px(top)} -${CLIP_REACH}px ${px(bottom)} -${CLIP_REACH}px)`;

// pure: how a card row is replayed from the box it was drawn in last time. NEVER A SCALE - a card
// changes height when a resize repicks the card box, and a scaled card stretches its own text. it
// starts where it was, and the height it gained is uncovered by the clip instead, so its content is
// cut rather than squashed, the same rule the fold follows. a covered card is whole and merely
// painted under its neighbour, so nothing is ever clipped at rest
function cardFlipFrames(from, to) {
  const grew = Math.max(to.height - from.height, 0);
  return [
    {translate: `${px(from.left - to.left)} ${px(from.top - to.top)}`, clipPath: clipInset(-CLIP_REACH, grew || -CLIP_REACH)},
    {translate: '0px 0px', clipPath: clipInset(-CLIP_REACH, -CLIP_REACH)},
  ];
}

// pure: a card box and the side its pile sits on -> `open`, the card whole where it is, and
// `folded`, the card shut to nothing at the edge that faces the pile. THE CARD NEVER TRAVELS: the
// near edge holds exactly where it was drawn and the far one climbs to meet it, the content cut
// rather than squashed, so the card is eaten at the pile's own edge and never shows on the far side.
// `above` is the side the pile sits on - a pile above holds the card's top edge and climbs its
// bottom, a pile below holds the bottom and pushes the top down. run backwards, it is the same
// motion growing out of that edge to full height in place
function foldFrames(card, above) {
  const r = CLIP_REACH;
  const shut = card.height + r; // past the card's own box, so its shadow is taken with it
  return {
    open: {translate: '0px 0px', clipPath: clipInset(-r, -r)},
    folded: {translate: '0px 0px', clipPath: above ? clipInset(-r, shut) : clipInset(shut, -r)},
  };
}

// pure: which ids a redraw moves onto or off each pile, from every id's role before and after, and
// the timing the whole redraw then runs at - any pile change slows every row to the pile's timing,
// so the rows below slide with the card. a role is the host's own string; anything starting
// 'pile-' names a pile. a pile a card lands on shows its new count only when that card lands
// (countAt); a card lifting off leaves at once, so that count changes at 0
function planPileMotion(priorRoles, nextRoles) {
  const piles = new Map();
  const entry = key => piles.get(key) || piles.set(key, {landing: [], lifting: []}).get(key);
  nextRoles.forEach((role, id) => {
    const was = priorRoles.get(id);
    if (was === undefined || was === role) return;
    if (role.startsWith('pile-')) entry(role).landing.push(id);
    if (was.startsWith('pile-')) entry(was).lifting.push(id);
  });
  piles.forEach(pile => { pile.countAt = pile.landing.length ? PILE_MOTION_MS : 0; });
  const piled = piles.size > 0;
  return {piles, duration: piled ? PILE_MOTION_MS : ROW_MOTION_MS, easing: piled ? PILE_EASING : ROW_EASING};
}
