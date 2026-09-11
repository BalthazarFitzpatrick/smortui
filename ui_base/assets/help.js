// guidance on demand: hover a round ? to peek, click to pin, click anywhere else to let go.
// A CONTROL ROW MAY NOT CHANGE HEIGHT, which is what instructions-as-prose did - three lines at a
// narrow window, and the row grew with them. so a row carries a `.toggle.help` and the words live
// in a `.help-tip` placed beside it on demand.
//
// THE TRIGGER IS NEVER THE TIP. `.help-tip` is position:fixed so it can sit over anything; put that
// class on the ? itself and the ? stays where it first rendered while the page scrolls under it.
//
// ONE IMPLEMENTATION for every ? on a page - a second one drifts into a different dialect.

let helpPinned = null;

// `button` is the ? (give it class="toggle help"); `lines` are strings, one per row of the tip.
// returns the tip element, appended to <body> and hidden until asked for
function helpTip(button, lines) {
  const tip = document.createElement('div');
  tip.className = 'help-tip';
  tip.hidden = true;
  lines.forEach(line => {
    const row = document.createElement('div');
    row.textContent = line;
    tip.appendChild(row);
  });
  document.body.appendChild(tip);

  const place = () => {
    const box = button.getBoundingClientRect();
    tip.hidden = false;
    // clamped to the window, because a ? at the right-hand edge would otherwise open off-screen
    const width = tip.offsetWidth;
    tip.style.top = `${box.bottom + 6}px`;
    tip.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`;
  };
  const hide = () => { tip.hidden = true; tip.classList.remove('pinned'); button.classList.remove('on'); };

  button.addEventListener('mouseenter', () => { if (helpPinned !== tip) place(); });
  button.addEventListener('mouseleave', () => { if (helpPinned !== tip) tip.hidden = true; });
  button.addEventListener('click', evt => {
    evt.stopPropagation();
    if (helpPinned === tip) { helpPinned = null; hide(); return; }
    if (helpPinned) helpPinned._hide();
    helpPinned = tip;
    place();
    tip.classList.add('pinned');
    button.classList.add('on');
  });
  tip._hide = hide;
  return tip;
}

// anywhere else dismisses a pinned tip - including a click inside the tip, which is text to read.
// a pinned tip is fixed, so scrolling away from its ? lets it go too rather than leaving it floating
function dismissPinnedHelp() {
  if (helpPinned) { helpPinned._hide(); helpPinned = null; }
}
document.addEventListener('click', dismissPinnedHelp);
window.addEventListener('scroll', dismissPinnedHelp, {passive: true, capture: true});
