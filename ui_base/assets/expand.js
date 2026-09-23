// a landscape strip that grows into a centred portrait panel and shrinks back - the same
// .modal-backdrop / .panel-floating this tool already uses for the one other centred overlay,
// so an expanded strip does not invent a second visual language for "floating over everything"
//
// OWNS NO PERSISTENCE. it hands the host the panel element to fill and tells it open/close
// happened; what goes inside and whether that sticks anywhere is the host's decision
//
// returns {open, close, fit, destroy}. the panel opens at a fixed share of the viewport, which
// leaves a short content floating in empty space - fit(contentHeight) is how a host fixes that
//
// fit(contentHeight): the host passes the height its content needs; the panel keeps its width,
// adds its own padding and border, and eases height and top to that, re-centred. never past the
// box it opened at, so taller content keeps its scroll. call again whenever the content changes

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
  // the box the panel opened at caps fit(); shown flips once the grow has started
  let full = null, from = null, shown = false;

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

  // height and top ride along once the panel is shown, so a fit() eases instead of jumping. the
  // width never moves, so no line rewraps while it does
  function transitionFor(duration, ease, props) {
    return duration ? props.map(prop => `${prop} ${duration}ms ${ease}`).join(', ') : 'none';
  }

  // what the panel draws around its content under border-box sizing, top and bottom. zero with no
  // computed styles (the consumer's test stub), and under content-box, where height is the content
  function chromeHeight(el) {
    let styles;
    try {
      styles = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
    } catch {
      styles = null;
    }
    if (!styles || styles.boxSizing === 'content-box') return 0;
    return ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
      .reduce((sum, key) => sum + (parseFloat(styles[key]) || 0), 0);
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

    // laid out once at its final size, grown by a transform: animating left/top/width/height
    // reflowed text every frame, which made the old version look rough. the width never changes
    full = expandedBox();
    from = stripBox();
    shown = false;
    Object.assign(panel.style, {
      position: 'fixed', left: `${full.left}px`, top: `${full.top}px`,
      width: `${full.width}px`, height: `${full.height}px`,
      transformOrigin: '0 0',
      transform: transformFor(from, full),
      opacity: '0',
      transition: transitionFor(duration, ease, ['transform', 'opacity']),
    });
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    // two rAFs, not one: the start transform must paint before the end values land, or both
    // writes collapse into one frame and there is no transition. held on this panel, not the
    // variable, so a close and reopen inside those frames cannot start the new one early
    const growing = panel;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (panel !== growing) return;
      shown = true;
      Object.assign(panel.style, {
        transform: 'none', opacity: '1',
        transition: transitionFor(duration, ease, ['transform', 'opacity', 'height', 'top']),
      });
    }));

    backdrop.addEventListener('mousedown', evt => { if (evt.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);
    onOpen(panel);
  }

  // hug the open panel to its content, capped at the box it opened at and re-centred on it
  function fit(contentHeight) {
    if (!panel) return;
    const needed = Number(contentHeight);
    if (!(needed >= 0)) return;   // nan, negative or missing measures nothing
    const height = Math.min(needed + chromeHeight(panel), full.height);
    const top = full.top + (full.height - height) / 2;
    const geometry = {top: `${top}px`, height: `${height}px`};
    // before the grow has painted, the start transform is retargeted at the fitted box instead,
    // so the panel grows straight into it rather than into the full box and then shrinking
    if (!shown) {
      Object.assign(geometry, {transition: 'none', transform: transformFor(from, {...full, top, height})});
    }
    Object.assign(panel.style, geometry);
  }

  // preventDefault, the same signal a Menu gives: a pinned help tip yields its escape to whatever
  // overlay answered first, and only knows one answered by this
  function onKey(evt) { if (evt.key === 'Escape' && backdrop) { evt.preventDefault(); close(); } }

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
    // height and top leave the list on purpose: a fit still easing lands at once on the inline
    // box the collapse transform is computed from, so the panel shrinks cleanly into the strip
    Object.assign(dyingPanel.style, {
      transition: transitionFor(duration, ease, ['transform', 'opacity']),
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

  // teardown is not a close: drops the strip's click and removes an open panel at once, no
  // collapse, no onClose, no focus moved - the same contract as the drawer's destroy
  function destroy() {
    strip.removeEventListener('click', open);
    if (!backdrop) return;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    backdrop = null;
    panel = null;
  }

  return {open, close, fit, destroy};
}
