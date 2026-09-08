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
function indicateFocus(target) {
  const marker = _marker();
  const r = target.getBoundingClientRect();
  Object.assign(marker.style, {
    left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
  });
}
