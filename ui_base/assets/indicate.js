// two small paint-only indicators: a count badge, and a focus marker that glides between elements.
// neither touches layout height, and neither stores anything - see indicateBadge/indicateFocus

// renders a count into host as a trailing badge, hidden entirely at zero rather than showing "0" -
// a visible empty badge reads as "something is here" when nothing is
function indicateBadge(host, count) {
  let badge = host.querySelector('.count-badge');
  if (!count) { if (badge) badge.remove(); return; }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'count-badge';
    host.appendChild(badge);
  }
  badge.textContent = String(count);
}

// a single shared marker element, moved rather than recreated - recreating it per call is what
// made two rapid focus moves animate as two overlapping glides instead of one continuous one
let _focusMarker = null;
// THE ONE ELEMENT ALLOWED TO MOVE THE MARKER. every deferred re-measure checks it: a fast run of
// arrow presses through a fan left a timer and a transitionend on each card focus passed over, and
// those came due after focus had moved on and dragged the marker back - measured 100-200px off
let _focusTarget = null;
// drops the previous target's timer, frame and listener the moment focus moves on
let _dropPending = null;

function _marker() {
  if (_focusMarker) return _focusMarker;
  _focusMarker = document.createElement('div');
  _focusMarker.className = 'focus-marker';
  document.body.appendChild(_focusMarker);
  // a list scrolling under the fixed marker would leave it behind - capture sees every scroller
  document.addEventListener('scroll', () => _placeMarker(_focusTarget), {capture: true, passive: true});
  return _focusMarker;
}

// WHERE THE TARGET WILL COME TO REST, not where it is this instant. getBoundingClientRect includes
// any transform in flight, so a target sliding into place reports its OLD position and the marker
// animated all the way there before correcting. subtracting the element's own translation gives
// the resting box straight away, so the marker travels once, to the right place.
function _placeMarker(target) {
  if (!target || target !== _focusTarget) return;
  const r = target.getBoundingClientRect();
  const t = getComputedStyle(target).transform;
  let dx = 0, dy = 0;
  if (t && t !== 'none') {
    const m = new DOMMatrixReadOnly(t);
    dx = m.m41;
    dy = m.m42;
  }
  Object.assign(_focusMarker.style, {
    left: `${r.left - dx}px`, top: `${r.top - dy}px`,
    width: `${r.width}px`, height: `${r.height}px`,
  });
}

// places the marker on target's border box. if it was already showing somewhere, the transition
// on .focus-marker (in base.css) glides it there rather than teleporting.
// THE TARGET MAY BE MOVING WHEN IT TAKES FOCUS - a fan item slides back to its resting place - so
// place it now, again on the next frame, and once more when its own transition ends, all of it
// cancelled the moment focus moves on
function indicateFocus(target) {
  _marker();
  if (_dropPending) _dropPending();
  _focusTarget = target;
  _placeMarker(target);

  const settle = () => { _placeMarker(target); drop(); };
  const frame = globalThis.requestAnimationFrame?.(() => _placeMarker(target));
  // a target that never transitions fires no event, so the timer drops the listener either way
  const timer = setTimeout(settle, 400);
  const drop = () => {
    target.removeEventListener('transitionend', settle);
    clearTimeout(timer);
    if (frame != null) globalThis.cancelAnimationFrame?.(frame);
    if (_dropPending === drop) _dropPending = null;
  };
  target.addEventListener('transitionend', settle);
  _dropPending = drop;
}
