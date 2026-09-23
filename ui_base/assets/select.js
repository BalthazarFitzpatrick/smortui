/* selection over a grid or list: click, cmd+click, shift+drag, right-click.
 *
 * WHY THIS IS SHARED RATHER THAN WRITTEN PER TOOL. Every one of these behaviours earned itself from
 * a real failure, and copying the code copies the behaviour while losing the reason:
 *
 *   PLAIN CLICK PICKS, it does not toggle a destructive flag. Clicking is what you do while
 *   READING, so the harmless action belongs on it and the destructive one behind a menu.
 *
 *   RIGHT-CLICK ON SOMETHING UNSELECTED SELECTS IT FIRST. Acting on "the selection" when the user
 *   pointed at something else is how a correction lands on the wrong item silently - observed, and
 *   it re-cut the wrong tile with no error. Selecting first also means the menu can only ever act on
 *   things wearing a visible ring, so an invisible target stops being reachable.
 *
 *   SHIFT+DRAG IS A NET, NOT A RANGE. First-to-last through the rendered order is only what you want
 *   when the list happens to be sorted the way you are reading it. The mismatches you can see sit
 *   together on SCREEN, so a rectangle you drag over them is the honest gesture.
 *
 *   THE NET AUTOSCROLLS AT THE EDGES, and the anchor moves with the content. A frame loop rather
 *   than mousemove, because mousemove stops firing the moment the pointer stops - which is exactly
 *   when someone is holding at the bottom waiting for the list to come to them. And since the band
 *   is fixed-positioned, scrolling slides the content out from under a stationary anchor, so the
 *   origin is shifted by the amount the container ACTUALLY scrolled - read back, not assumed, so it
 *   stays put at the clamped ends instead of drifting.
 *
 * The caller owns what "selected" means; this owns the gestures. */

// how close to an edge the pointer must get before the net starts scrolling, and its top speed
const SELECT_EDGE_PX = 60;
const SELECT_MAX_SPEED_PX = 18;

function makeSelection(container, options = {}) {
  const itemSelector = options.itemSelector || '.select-item';
  const keyOf = options.keyOf || (el => el.dataset.name);
  const selectedClass = options.selectedClass || 'selected';
  const onChange = options.onChange || (() => {});
  const onContext = options.onContext || null;
  const isPickable = options.isPickable || (() => true);

  const selected = new Set();
  const items = () => [...container.querySelectorAll(itemSelector)].filter(isPickable);
  const paint = el => el.classList.toggle(selectedClass, selected.has(keyOf(el)));
  const announce = () => onChange([...selected]);

  function set(el, on) {
    if (on) selected.add(keyOf(el)); else selected.delete(keyOf(el));
    paint(el);
  }
  function only(el) {
    selected.clear();
    items().forEach(paint);
    set(el, true);
    announce();
  }
  function clear() {
    selected.clear();
    items().forEach(paint);
    announce();
  }

  const onClick = evt => {
    const el = evt.target.closest(itemSelector);
    if (!el || !isPickable(el)) return;
    // the net owns shift and its own mouseup has already answered; a click arriving after it must
    // not throw that selection away
    if (evt.shiftKey) return;
    if (evt.metaKey || evt.ctrlKey) {
      set(el, !selected.has(keyOf(el)));
      announce();
      return;
    }
    only(el);
  };
  container.addEventListener('click', onClick);

  const onContextMenu = evt => {
    const el = evt.target.closest(itemSelector);
    if (!el || !isPickable(el) || !onContext) return;
    evt.preventDefault();
    if (!selected.has(keyOf(el))) only(el);   // see the header: never act on what was not pointed at
    onContext([...selected], evt.clientX, evt.clientY);
  };
  container.addEventListener('contextmenu', onContextMenu);

  // ---- the net
  let band = null, origin = null, pointer = null, frame = null;

  const catchIn = box => {
    items().forEach(el => {
      const r = el.getBoundingClientRect();
      const hit = r.left < box.left + box.width && r.right > box.left
               && r.top < box.top + box.height && r.bottom > box.top;
      set(el, hit);
    });
    announce();
  };

  const draw = () => {
    const box = {
      left: Math.min(origin.x, pointer.x), top: Math.min(origin.y, pointer.y),
      width: Math.abs(pointer.x - origin.x), height: Math.abs(pointer.y - origin.y),
    };
    Object.assign(band.style, {
      left: `${box.left}px`, top: `${box.top}px`,
      width: `${box.width}px`, height: `${box.height}px`,
    });
    catchIn(box);
  };

  const step = () => {
    if (!band) return;
    const rect = container.getBoundingClientRect();
    const below = pointer.y - (rect.bottom - SELECT_EDGE_PX);
    const above = (rect.top + SELECT_EDGE_PX) - pointer.y;
    let speed = 0;
    if (below > 0) speed = Math.min(below, SELECT_EDGE_PX) / SELECT_EDGE_PX * SELECT_MAX_SPEED_PX;
    else if (above > 0) speed = -Math.min(above, SELECT_EDGE_PX) / SELECT_EDGE_PX * SELECT_MAX_SPEED_PX;
    if (speed) {
      const before = container.scrollTop;
      container.scrollTop = before + speed;
      const moved = container.scrollTop - before;   // read back: at the clamp this is zero
      if (moved) { origin.y -= moved; draw(); }
    }
    frame = requestAnimationFrame(step);
  };

  const onDown = evt => {
    if (!evt.shiftKey || evt.button !== 0) return;
    evt.preventDefault();   // or the drag becomes a text selection across every label in the grid
    origin = {x: evt.clientX, y: evt.clientY};
    pointer = {x: evt.clientX, y: evt.clientY};
    band = document.createElement('div');
    band.className = 'rubber-band';
    document.body.appendChild(band);
    frame = requestAnimationFrame(step);
  };
  const onMove = evt => {
    if (!band) return;
    pointer = {x: evt.clientX, y: evt.clientY};
    draw();
  };
  const onUp = () => {
    if (!band) return;
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    band.remove();
    band = null;
    origin = pointer = null;
    announce();
  };
  container.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  return {
    selected: () => [...selected],
    has: key => selected.has(key),
    size: () => selected.size,
    clear,
    // set membership BY KEY, for the callers a gesture cannot express - a "select all" button, or
    // restoring a selection after a re-render. Fires onChange ONCE for the whole batch, so
    // selecting fifty things is one update rather than fifty
    setKeys: (keys, on) => {
      keys.forEach(key => { if (on) selected.add(key); else selected.delete(key); });
      items().forEach(paint);
      announce();
    },
    repaint: () => items().forEach(paint),   // call after re-rendering the list
    // the move/up listeners are on window - a host that rebuilds its grid must drop them, or each
    // rebuild leaves one more pair behind netting a container that is gone
    destroy: () => {
      // a net in progress is dropped, not finished: teardown fires no onChange into a host that
      // is mid-rebuild
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      band?.remove();
      band = null;
      origin = pointer = null;
      container.removeEventListener('click', onClick);
      container.removeEventListener('contextmenu', onContextMenu);
      container.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    },
  };
}
