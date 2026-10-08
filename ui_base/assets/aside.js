// a floating help box that hangs beside a host panel and follows the described row at the same
// height, sliding between rows. paint and placement only: it holds no content logic and tracks no
// focus - the host calls show() from its own focus handler
//
// OWNS NO PERSISTENCE. standalone: reads no other ui_base script

// pure placement, split out so the choice can be tested without a browser. rects are plain
// {left, top, right, bottom} boxes in viewport px; size is the aside's own {width, height}.
// side: right of the host if it fits, else left, else docked under it (a narrow viewport).
// vertical: centred on the anchor, then clamped inside the viewport - except when docked below,
// where the box sits directly under the host and is never pulled up over it
function placeAside({host, anchor, size, viewport, gap = 12, margin = 8}) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  let side = 'below';
  let left;
  if (host.right + gap + size.width <= viewport.width - margin) {
    side = 'right';
    left = host.right + gap;
  } else if (host.left - gap - size.width >= margin) {
    side = 'left';
    left = host.left - gap - size.width;
  } else {
    left = clamp(host.left, margin, Math.max(margin, viewport.width - size.width - margin));
  }
  if (side === 'below') return {side, left, top: host.bottom + gap};
  const centre = (anchor.top + anchor.bottom) / 2;
  const top = clamp(centre - size.height / 2, margin, Math.max(margin, viewport.height - size.height - margin));
  return {side, left, top};
}

// content: {title, lines}; a line is a string, or {strong, text} where strong is a lead-in shown in
// the cream tone before the text. everything goes in through textContent, never innerHTML
function makeAside({host, gap = 12} = {}) {
  const el = document.createElement('div');
  el.className = 'panel-floating aside';
  // announced politely when the text changes; never focusable, so it cannot steal the host's focus
  el.setAttribute('role', 'note');
  el.setAttribute('aria-live', 'polite');
  // position is stated here as well as in the stylesheet, so a host serving an older base.css does
  // not get an in-flow box at the foot of the page
  el.style.position = 'fixed';
  document.body.appendChild(el);

  let shown = false;
  let anchor = null;
  let body = null;
  let frame = null;
  let snapFrame = null;
  let observer = null;

  function render(content) {
    const next = document.createElement('div');
    next.className = 'aside-body';
    const title = document.createElement('div');
    title.className = 'aside-title';
    title.textContent = String(content?.title ?? '');
    next.appendChild(title);
    for (const line of content?.lines ?? []) {
      const row = document.createElement('div');
      row.className = 'aside-line';
      if (line !== null && typeof line === 'object') {
        if (line.strong) {
          const lead = document.createElement('span');
          lead.className = 'aside-strong';
          lead.textContent = String(line.strong);
          row.appendChild(lead);
        }
        const rest = document.createElement('span');
        rest.className = 'aside-text';
        rest.textContent = String(line.text ?? '');
        row.appendChild(rest);
      } else {
        row.textContent = String(line);
      }
      next.appendChild(row);
    }
    if (body) body.remove();
    body = next;
    el.appendChild(body);
  }

  function place() {
    if (!shown) return;
    if (!anchor.isConnected) { hide(); return; }
    const root = document.documentElement;
    const viewport = {
      width: root?.clientWidth || window.innerWidth,
      height: root?.clientHeight || window.innerHeight,
    };
    const size = {width: el.offsetWidth || 0, height: el.offsetHeight || 0};
    const spot = placeAside({
      host: host.getBoundingClientRect(), anchor: anchor.getBoundingClientRect(), size, viewport, gap,
    });
    el.style.left = `${spot.left}px`;
    el.style.top = `${spot.top}px`;

    el.dataset.side = spot.side;
  }

  // a scroll or resize moves the anchor under the box; follow it at once, not through the slide,
  // or the box trails the row it describes. one placement per frame however many events arrive
  function follow() {
    if (frame !== null) return;
    const run = () => {
      frame = null;
      el.classList.add('snap');
      place();
      // the class drops a frame later, after the jump has been painted without a transition
      const drop = () => { snapFrame = null; el.classList.remove('snap'); };
      snapFrame = globalThis.requestAnimationFrame ? requestAnimationFrame(drop) : (drop(), null);
    };
    if (globalThis.requestAnimationFrame) frame = requestAnimationFrame(run);
    else run();
  }

  function listen(on) {
    const act = on ? 'addEventListener' : 'removeEventListener';
    window[act]('resize', follow);
    // capture sees the scroll of any ancestor of the anchor; scroll does not bubble
    document[act]('scroll', follow, {capture: true, passive: true});
    if (on && typeof MutationObserver === 'function') {
      // a removed anchor fires no scroll or resize, so watch the tree while shown
      observer = new MutationObserver(() => { if (anchor && !anchor.isConnected) hide(); });
      observer.observe(document.body, {childList: true, subtree: true});
    } else if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function show(target, content) {
    if (!target) { hide(); return; }
    anchor = target;
    render(content);
    if (!shown) {
      shown = true;
      listen(true);
      // the first show appears in place: position it while the slide is off, flush, then fade in
      place();
      void el.offsetHeight;
      el.classList.add('shown');
    } else {
      place();
    }
  }

  function hide() {
    if (!shown) return;
    shown = false;
    anchor = null;
    listen(false);
    el.classList.remove('shown');
  }

  function destroy() {
    hide();
    if (frame !== null && globalThis.cancelAnimationFrame) cancelAnimationFrame(frame);
    if (snapFrame !== null && globalThis.cancelAnimationFrame) cancelAnimationFrame(snapFrame);
    frame = snapFrame = null;
    el.remove();
  }

  return {el, show, hide, destroy, isShown: () => shown};
}
