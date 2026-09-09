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

function _marker() {
  if (_focusMarker) return _focusMarker;
  _focusMarker = document.createElement('div');
  _focusMarker.className = 'focus-marker';
  document.body.appendChild(_focusMarker);
  return _focusMarker;
}

// places the marker on target's border box. if it was already showing somewhere, the transition
// on .focus-marker (in base.css) glides it there rather than teleporting
// THE TARGET MAY BE MOVING WHEN IT TAKES FOCUS, and measuring once lands the marker where the
// element used to be. A fan is the case that exposed it: focusing an item makes it slide back to
// its resting place, so its rect at focus time is its OLD position and the cream box arrives at an
// address nothing occupies any more.
// So: place it now, place it again on the next frame, and follow any transition the target runs to
// completion. `transitionend` fires per property, hence once() rather than a listener left behind.
function indicateFocus(target) {
  const marker = _marker();

  // WHERE THE TARGET WILL COME TO REST, not where it is this instant. getBoundingClientRect
  // includes any transform in flight, so a target sliding into place reports its OLD position and
  // the marker animates all the way there before correcting - a visible lurch down and back.
  // subtracting the element's own translation gives the resting box straight away, so the marker
  // travels once, to the right place.
  const place = () => {
    const r = target.getBoundingClientRect();
    const t = getComputedStyle(target).transform;
    let dx = 0, dy = 0;
    if (t && t !== 'none') {
      const m = new DOMMatrixReadOnly(t);
      dx = m.m41;
      dy = m.m42;
    }
    Object.assign(marker.style, {
      left: `${r.left - dx}px`, top: `${r.top - dy}px`,
      width: `${r.width}px`, height: `${r.height}px`,
    });
  };

  place();

  // whatever the target is mid-transition, the marker ends where the target ends
  const settle = () => {
    place();
    target.removeEventListener('transitionend', settle);
  };
  target.addEventListener('transitionend', settle);
  // a target that never transitions fires no event, so the listener is dropped either way
  setTimeout(settle, 400);
}
