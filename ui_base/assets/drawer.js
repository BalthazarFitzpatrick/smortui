// a sliver parked at one screen edge that opens into the centre of its half of the screen -
// the same .panel-floating border and shadow every other floating surface here uses, just moved
// mostly off-screen when parked
//
// OWNS NO PERSISTENCE. the host decides what goes in `body` and whether an open/closed state
// sticks anywhere

const DRAWER_DURATION_MS = 220;

// edge          'left' or 'right' - required, which side the drawer parks against
// sliverRatio   how much of the drawer's own width stays visible while parked
// heightRatio   the drawer's height as a fraction of the space below `top`
// top           px from the viewport top where the drawer's band begins
// width         px; defaults to a fraction of the viewport if omitted
function makeDrawer({
  edge,
  sliverRatio = 0.125,
  heightRatio = 0.625,
  top = 0,
  width = null,
  onOpen = null,
  onClose = null,
} = {}) {
  if (edge !== 'left' && edge !== 'right') {
    throw new Error('makeDrawer requires edge: "left" or "right"');
  }

  let opened = false;

  const el = document.createElement('div');
  el.className = `panel-floating drawer drawer-${edge}`;
  el.style.position = 'fixed';
  el.style.transition = `left ${DRAWER_DURATION_MS}ms`;

  const body = document.createElement('div');
  body.className = 'drawer-body';
  el.appendChild(body);

  function metrics() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = width || Math.min(360, vw * 0.4);
    const bandHeight = (vh - top) * heightRatio;
    const elTop = top + (vh - top - bandHeight) / 2;
    return {vw, w, bandHeight, elTop};
  }

  // PARKED SHOWS THE SLIVER NEAREST THE VIEWPORT: a right-edge drawer's LEFT edge sits just
  // inside the screen and the rest runs off the right; a left-edge drawer mirrors that on its
  // right edge - so what is visible is always the sliver closest to the middle of the screen
  function parkedLeft(vw, w) {
    return edge === 'right' ? vw - sliverRatio * w : sliverRatio * w - w;
  }

  // OPEN CENTRES IT IN ITS OWN HALF, not the whole viewport - a right-edge drawer belongs to
  // the right half of the screen even while open
  function openLeft(vw, w) {
    const halfStart = edge === 'right' ? vw / 2 : 0;
    return halfStart + (vw / 2 - w) / 2;
  }

  function layout() {
    const {vw, w, bandHeight, elTop} = metrics();
    el.style.width = `${w}px`;
    el.style.height = `${bandHeight}px`;
    el.style.top = `${elTop}px`;
    el.style.left = `${opened ? openLeft(vw, w) : parkedLeft(vw, w)}px`;
  }

  function open() {
    if (opened) return;
    opened = true;
    el.classList.add('open');
    layout();
    if (onOpen) onOpen();
  }

  function close() {
    if (!opened) return;
    opened = false;
    el.classList.remove('open');
    layout();
    if (onClose) onClose();
  }

  function toggle() { opened ? close() : open(); }

  // parked, any click on the drawer opens it; open, only the border - not the body - closes it,
  // so scrolling or selecting the drawer's own content does not dismiss it
  el.addEventListener('click', evt => {
    if (!opened) { open(); return; }
    if (evt.target === el) close();
  });

  window.addEventListener('resize', layout);

  layout();

  // IT PUTS ITSELF IN THE DOM, like Menu does. a drawer is fixed-position and measures the viewport
  // to place itself, so a host that forgets to append it gets an element that computes correct
  // geometry and never appears - which no dom-stub test can see
  document.body.appendChild(el);

  return {el, body, open, close, toggle, isOpen: () => opened};
}
