// a layout of side-by-side buckets, each an ordered list of rows, with 2D roving-tabindex focus -
// arrow keys move across both axes the way shell.js moves left/right across tabs
//
// STRUCTURAL NAMES ONLY. this file has no idea what a row or a bucket represents to its host -
// it only knows positions in a grid, which is what keeps it usable outside any one tool

// container   the element holding one child per bucket, each holding its rows in order
// bucketSel   selector for a bucket element, relative to container
// rowSel      selector for a row element, relative to a bucket
function makeBuckets(container, {bucketSel = '.bucket', rowSel = '.row', onFocus = () => {}, onExitTop = () => {}} = {}) {
  const buckets = () => Array.from(container.querySelectorAll(bucketSel));
  const rows = bucket => Array.from(bucket.querySelectorAll(rowSel));

  // only the current row sits in the tab order - a bucket layout can hold hundreds of rows and
  // tabbing through all of them defeats the point of arrow navigation
  function roll(bucketIndex, rowIndex) {
    buckets().forEach((b, bi) => rows(b).forEach((r, ri) => {
      r.tabIndex = (bi === bucketIndex && ri === rowIndex) ? 0 : -1;
    }));
  }

  function moveTo(bucketIndex, rowIndex) {
    const list = buckets();
    if (bucketIndex < 0 || bucketIndex >= list.length) return false;
    const target = rows(list[bucketIndex]);
    if (!target.length) return false;
    // CLAMP INTO A SHORTER BUCKET rather than losing focus - moving right/left across buckets of
    // different lengths is the common case here, not the exception, so landing past the end must
    // still land somewhere rather than silently doing nothing
    const clamped = Math.max(0, Math.min(rowIndex, target.length - 1));
    roll(bucketIndex, clamped);
    target[clamped].focus();
    onFocus(bucketIndex, clamped);
    return true;
  }

  function locate(el) {
    const list = buckets();
    for (let bi = 0; bi < list.length; bi++) {
      const ri = rows(list[bi]).indexOf(el);
      if (ri !== -1) return {bi, ri};
    }
    return null;
  }

  container.addEventListener('keydown', evt => {
    const row = evt.target.closest(rowSel);
    if (!row || !container.contains(row)) return;
    const at = locate(row);
    if (!at) return;
    if (evt.key === 'ArrowRight') { evt.preventDefault(); moveTo(at.bi + 1, at.ri); }
    else if (evt.key === 'ArrowLeft') { evt.preventDefault(); moveTo(at.bi - 1, at.ri); }
    else if (evt.key === 'ArrowDown') { evt.preventDefault(); moveTo(at.bi, at.ri + 1); }
    else if (evt.key === 'ArrowUp') {
      evt.preventDefault();
      // row 0 has nowhere up to go inside the grid - this is the host's escape hatch, e.g. to a
      // search field above the buckets, rather than a dead key
      if (at.ri === 0) onExitTop({type: 'exit-top', bucket: at.bi});
      else moveTo(at.bi, at.ri - 1);
    }
  });

  // seed the initial tab order - the first row of the first non-empty bucket
  const first = buckets().find(b => rows(b).length);
  if (first) roll(buckets().indexOf(first), 0);

  return {moveTo, locate};
}
