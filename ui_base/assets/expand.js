// a landscape strip that grows into a centred portrait panel and shrinks back - the same
// .modal-backdrop / .panel-floating this tool already uses for the one other centred overlay,
// so an expanded strip does not invent a second visual language for "floating over everything"
//
// OWNS NO PERSISTENCE. it hands the host the panel element to fill and tells it open/close
// happened; what goes inside and whether that sticks anywhere is the host's decision

const EXPAND_DURATION_MS = 220;

// strip             the collapsed element, sized by the host's own layout
// collapsedRatio    {w, h} width:height while collapsed - default 3:1
// expandedRatio     {w, h} width:height while expanded - default 1:3
function makeExpander(strip, {
  collapsedRatio = {w: 3, h: 1},
  expandedRatio = {w: 1, h: 3},
  onOpen = () => {},
  onClose = () => {},
} = {}) {
  let backdrop = null, panel = null, closing = false;

  function open() {
    if (backdrop) return;   // ALREADY OPEN - a second click before the animation lands must not
                             // stack a second backdrop, or escape/outside-click closes only the top one
    closing = false;
    backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop expand-backdrop';
    panel = document.createElement('div');
    panel.className = 'panel-floating expand-panel';
    // start at the strip's own box so the grow reads as the strip itself opening, not a new
    // element appearing over it
    const from = strip.getBoundingClientRect();
    Object.assign(panel.style, {
      position: 'fixed', left: `${from.left}px`, top: `${from.top}px`,
      width: `${from.width}px`, height: `${from.height}px`,
      transition: `left ${EXPAND_DURATION_MS}ms, top ${EXPAND_DURATION_MS}ms, width ${EXPAND_DURATION_MS}ms, height ${EXPAND_DURATION_MS}ms`,
    });
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    // the target box: expandedRatio's own aspect, sized to fit the viewport, centred
    const vw = window.innerWidth, vh = window.innerHeight;
    const aspect = expandedRatio.w / expandedRatio.h;
    let width = vh * aspect, height = vh * 0.9;
    if (width > vw * 0.9) { width = vw * 0.9; height = width / aspect; }
    const left = (vw - width) / 2, top = (vh - height) / 2;

    // two rAFs, not one: the browser must PAINT the start box before the end values are set, or
    // it collapses both writes into one frame and there is no transition to see
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!panel) return;
      Object.assign(panel.style, {left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`});
    }));

    backdrop.addEventListener('mousedown', evt => { if (evt.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);
    onOpen(panel);
  }

  function onKey(evt) { if (evt.key === 'Escape') close(); }

  function close() {
    if (!backdrop || closing) return;   // ESCAPE AND OUTSIDE-CLICK CAN BOTH FIRE for one dismissal
                                         // (e.g. escape while the pointer is already on the backdrop) -
                                         // without this guard onClose and the teardown ran twice
    closing = true;
    document.removeEventListener('keydown', onKey);
    const dying = backdrop;
    backdrop = null;
    panel = null;
    dying.remove();
    onClose();
  }

  strip.addEventListener('click', open);

  return {open, close};
}
