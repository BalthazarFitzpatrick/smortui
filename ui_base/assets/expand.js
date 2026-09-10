// a landscape strip that grows into a centred portrait panel and shrinks back - the same
// .modal-backdrop / .panel-floating this tool already uses for the one other centred overlay,
// so an expanded strip does not invent a second visual language for "floating over everything"
//
// OWNS NO PERSISTENCE. it hands the host the panel element to fill and tells it open/close
// happened; what goes inside and whether that sticks anywhere is the host's decision

// TIMING LIVES IN base.css (--motion-duration, --motion-ease), not here, so a host retunes
// motion for every animated thing in this kit from one place. read at call time (not module
// load) so a host that swaps the tokens after the page loads still gets picked up, and guarded
// because the consumer's test stub has neither getComputedStyle nor matchMedia
function readMotion() {
  const fallback = {duration: 220, ease: 'ease'};
  let styles;
  try {
    styles = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
  } catch {
    styles = null;
  }
  if (!styles) return fallback;
  const rawDuration = styles.getPropertyValue('--motion-duration').trim();
  const rawEase = styles.getPropertyValue('--motion-ease').trim();
  const parsed = parseFloat(rawDuration);
  const duration = Number.isFinite(parsed)
    ? parsed * (rawDuration.endsWith('s') && !rawDuration.endsWith('ms') ? 1000 : 1)
    : fallback.duration;
  const ease = rawEase || fallback.ease;
  let reduced = false;
  try {
    reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    reduced = false;
  }
  return {duration: reduced ? 0 : duration, ease};
}

// strip             the collapsed element, sized by the host's own layout
// collapsedRatio    {w, h} width:height while collapsed - default 3:1
// expandedRatio     {w, h} width:height while expanded - default 1:3
function makeExpander(strip, {
  collapsedRatio = {w: 3, h: 1},
  expandedRatio = {w: 1, h: 3},
  // WHERE THE GROW STARTS. 'center' opens from the middle of the screen; 'rect' morphs out of the
  // strip's own box. rect is the more literal animation and the worse one to sit in front of: a
  // strip in the far column travels the width of the screen on its way open, and the eye tracks
  // that sideways sweep instead of reading the panel that arrives
  origin = 'center',
  onOpen = () => {},
  onClose = () => {},
} = {}) {
  let backdrop = null, panel = null, closing = false;

  // the box the strip's own click animates out of (or the centred stand-in for 'center' origin) -
  // shared by open (grows out of it) and close (shrinks back into it)
  function stripBox() {
    const rect = strip.getBoundingClientRect();
    return origin === 'rect'
      ? rect
      : {
        left: (window.innerWidth - rect.width) / 2,
        top: (window.innerHeight - rect.height) / 2,
        width: rect.width, height: rect.height,
      };
  }

  // the target box: expandedRatio's own aspect, sized to fit the viewport, centred
  function expandedBox() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const aspect = expandedRatio.w / expandedRatio.h;
    let width = vh * aspect, height = vh * 0.9;
    if (width > vw * 0.9) { width = vw * 0.9; height = width / aspect; }
    return {left: (vw - width) / 2, top: (vh - height) / 2, width, height};
  }

  // a transform that makes an element laid out at `to` LOOK like it sits at `from` - translate by
  // the corner offset, scale by the size ratio, both against a top-left transform-origin so the
  // two do not fight each other the way they would from the default centred origin
  function transformFor(from, to) {
    const tx = from.left - to.left, ty = from.top - to.top;
    const sx = from.width / to.width, sy = from.height / to.height;
    return `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
  }

  function open() {
    if (backdrop) return;   // ALREADY OPEN - a second click before the animation lands must not
                             // stack a second backdrop, or escape/outside-click closes only the top one
    closing = false;
    const {duration, ease} = readMotion();
    backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop expand-backdrop';
    panel = document.createElement('div');
    panel.className = 'panel-floating expand-panel';

    // THE CONTENT IS LAID OUT ONCE, AT ITS FINAL SIZE. animating left/top/width/height reflows
    // text every frame, which is what made the old version look rough - the box only ever has one
    // width, and a transform (translate+scale) does the visual growing instead, which the
    // compositor can animate without touching layout at all
    const final = expandedBox();
    const from = stripBox();
    Object.assign(panel.style, {
      position: 'fixed', left: `${final.left}px`, top: `${final.top}px`,
      width: `${final.width}px`, height: `${final.height}px`,
      transformOrigin: '0 0',
      transform: transformFor(from, final),
      opacity: '0',
      transition: duration ? `transform ${duration}ms ${ease}, opacity ${duration}ms ${ease}` : 'none',
    });
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    // two rAFs, not one: the browser must PAINT the start transform before the end values are
    // set, or it collapses both writes into one frame and there is no transition to see
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!panel) return;
      Object.assign(panel.style, {transform: 'none', opacity: '1'});
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
    const dying = backdrop, dyingPanel = panel;
    // NULLED BEFORE THE COLLAPSE ANIMATION FINISHES, not after: a click that opens a fresh
    // expander while the old one is still shrinking must start clean, not find `backdrop` already
    // occupied by an element on its way out
    backdrop = null;
    panel = null;
    // CLOSING IS MARKED SYNCHRONOUSLY, not once the animation lands: a second dismissal firing
    // mid-collapse must not double-count it, and a host counting live backdrops needs a way to
    // tell "still here but on its way out" from "still open"
    dying.className += ' expand-closing';
    dying.style.pointerEvents = 'none';
    if (strip.isConnected) strip.focus();
    onClose();

    const {duration, ease} = readMotion();
    const collapseBox = stripBox();
    const final = {
      left: parseFloat(dyingPanel.style.left), top: parseFloat(dyingPanel.style.top),
      width: parseFloat(dyingPanel.style.width), height: parseFloat(dyingPanel.style.height),
    };
    Object.assign(dyingPanel.style, {
      transition: duration ? `transform ${duration}ms ${ease}, opacity ${duration}ms ${ease}` : 'none',
      transform: transformFor(collapseBox, final),
      opacity: '0',
    });

    let removed = false;
    function remove() {
      if (removed) return;
      removed = true;
      dying.remove();
    }
    dyingPanel.addEventListener('transitionend', remove);
    // FALLBACK TIMER, because transitionend never fires if duration is 0 (reduced motion, or a
    // host with the token blank) or if the element is hidden before the event can dispatch
    setTimeout(remove, duration + 50);
  }

  strip.addEventListener('click', open);

  return {open, close};
}
