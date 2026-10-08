// an accordion item: a header button that opens a body, with a one-line summary while closed
//
// OWNS NO PERSISTENCE. it reports toggles and exposes what is open; whether that is remembered is
// the host's. items are independent: opening one never closes another
//
// returns {el, setSummary, setCount, open, close, isOpen, body}. body is the container that holds the
// node you passed (hidden while closed), so a host can also fill it later

let _disclosureCount = 0;

// title     header text
// summary   one line shown under the title while closed, cut with an ellipsis if long
// count     a badge beside the title, hidden at zero
// open      starts open
// body      a dom node
// onToggle  (open) => void, fired when the user toggles via the header; open() and close() are
//           silent, so a host restoring saved state does not write it straight back
function makeDisclosure({title = '', summary = '', count = 0, open = false, body = null, onToggle = null} = {}) {
  const id = `disclosure-body-${++_disclosureCount}`;
  const el = document.createElement('div');
  // the item is the frame that lights while focus is inside it (see .disclosure.focus-glow-within in
  // base.css): the group holding the cursor wears the card focus, its header does not lift
  el.className = 'disclosure focus-glow focus-glow-within';

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'disclosure-head';
  head.setAttribute('aria-controls', id);

  // the chevron is text, hidden from readers: aria-expanded already says the state
  const chevron = document.createElement('span');
  chevron.className = 'disclosure-chevron';
  chevron.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'disclosure-text';
  const titleRow = document.createElement('span');
  titleRow.className = 'disclosure-title';
  const name = document.createElement('span');
  name.className = 'disclosure-name';
  name.textContent = title;
  titleRow.appendChild(name);
  const summaryLine = document.createElement('span');
  summaryLine.className = 'disclosure-summary';
  text.append(titleRow, summaryLine);
  head.append(chevron, text);

  const bodyBox = document.createElement('div');
  bodyBox.className = 'disclosure-body';
  bodyBox.id = id;
  if (body) bodyBox.appendChild(body);
  el.append(head, bodyBox);

  let isOpen = false;
  let summaryText = '';

  // reuses indicateBadge when indicate.js is loaded, else draws the same .count-badge itself
  function setCount(n) {
    if (typeof indicateBadge === 'function') { indicateBadge(titleRow, n); return; }
    let badge = titleRow.querySelector('.count-badge');
    if (!n) { if (badge) badge.remove(); return; }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'count-badge';
      titleRow.appendChild(badge);
    }
    badge.textContent = String(n);
  }

  function paint() {
    head.setAttribute('aria-expanded', String(isOpen));
    el.classList.toggle('open', isOpen);
    chevron.textContent = isOpen ? 'v' : '>';
    // hidden keeps the body out of the tab order and the reader's tree while closed
    bodyBox.hidden = !isOpen;
    // the summary is the item's one tagline, shown open or closed so the header never changes height
    summaryLine.hidden = !summaryText;
  }

  function setSummary(next) {
    summaryText = String(next ?? '');
    summaryLine.textContent = summaryText;
    // a long line is cut with an ellipsis; the title attribute keeps the whole of it reachable
    summaryLine.title = summaryText;
    paint();
  }

  function setOpen(next) {
    isOpen = Boolean(next);
    paint();
  }

  head.addEventListener('click', () => {
    setOpen(!isOpen);
    if (onToggle) onToggle(isOpen);
  });

  setCount(count);
  setSummary(summary);
  setOpen(open);

  return {
    el, setSummary, setCount, body: bodyBox,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => isOpen,
  };
}

// a container holding several disclosures, so a host can remember which are open.
// items: [{id, disclosure}] with disclosures from makeDisclosure, or [{id, ...makeDisclosure options}]
// to have them made here. it adds no behaviour between items: they stay independent
function makeDisclosureGroup(items = []) {
  const el = document.createElement('div');
  el.className = 'disclosure-group';
  const members = items.map(item => ({id: item.id, disclosure: item.disclosure || makeDisclosure(item)}));
  members.forEach(m => el.appendChild(m.disclosure.el));

  return {
    el,
    openIds: () => members.filter(m => m.disclosure.isOpen()).map(m => m.id),
    // opens exactly the listed ids and closes the rest; an id nobody has is ignored
    setOpenIds(ids) {
      const wanted = new Set(ids);
      members.forEach(m => (wanted.has(m.id) ? m.disclosure.open() : m.disclosure.close()));
    },
  };
}
