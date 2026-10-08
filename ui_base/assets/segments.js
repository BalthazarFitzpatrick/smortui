// a segmented control: adjacent buttons sharing borders, exactly one lit, picks confirmed by the host
//
// OWNS NO PERSISTENCE and no opinion about what a pick means. the host's onPick does the work and
// answers true or false; the lit segment moves only on true. returns {el, set, setLit, setDisabled,
// buttons}, buttons in option order
//
// keyboard: every segment is a native button in the tab order. left/right move focus to the
// neighbouring segment (wrapping) WITHOUT picking; enter or space on the focused one picks it

// options   [{label, value, disabled, hint, auto}]
//   disabled  "not allowed right now": focusable, dashed and dimmed, hint as its title, never picks.
//             NOT the html disabled attribute, which drops a button out of the tab order and the
//             reader's reach, so the reason it is unavailable could not be found
//   auto      lit by the host through setLit(), never by a click
// value     the lit option's value, or null for none
// onPick    (value) => boolean | Promise<boolean>, only an exact true moves the lit segment
// label     the group's accessible name
function makeSegments({options = [], value = null, onPick = () => true, label = ''} = {}) {
  const el = document.createElement('div');
  el.className = 'segments';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', label);

  let lit = value;
  let inFlight = false;
  const entries = options.map(opt => ({opt, button: document.createElement('button')}));

  function paint() {
    entries.forEach(({opt, button}) => {
      const on = lit !== null && opt.value === lit;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
  }

  function markUnavailable(entry, flag) {
    const {opt, button} = entry;
    opt.disabled = Boolean(flag);
    button.classList.toggle('unavailable', opt.disabled);
    // an auto segment is always aria-disabled, whatever its flag says
    button.setAttribute('aria-disabled', String(opt.disabled || Boolean(opt.auto)));
  }

  // a click on the lit segment, an unavailable one or an auto one is ignored, and so is any click
  // while a pick is in flight: two quick clicks must not run two onPick calls against one lit state
  async function pick(entry) {
    const {opt} = entry;
    if (opt.auto || opt.disabled || inFlight || opt.value === lit) return;
    inFlight = true;
    el.setAttribute('aria-busy', 'true');
    let accepted = false;
    try {
      accepted = (await onPick(opt.value)) === true;
    } catch (err) {
      // a throwing onPick is a refused pick, not a half-moved control
      console.error(err);
    } finally {
      inFlight = false;
      el.removeAttribute('aria-busy');
    }
    if (accepted) { lit = opt.value; paint(); }
  }

  entries.forEach((entry, index) => {
    const {opt, button} = entry;
    button.type = 'button';
    button.className = 'toggle segment';
    button.textContent = opt.label;
    if (opt.hint) button.title = opt.hint;
    if (opt.auto) button.classList.add('auto');
    markUnavailable(entry, opt.disabled);
    if (!opt.auto) button.addEventListener('click', () => pick(entry));
    button.addEventListener('keydown', evt => {
      const step = evt.key === 'ArrowRight' ? 1 : evt.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      evt.preventDefault();
      entries[(index + step + entries.length) % entries.length].button.focus();
    });
    el.appendChild(button);
  });
  paint();

  // moves the lit segment without calling onPick. an unknown value, or null, lights none
  function setLit(next) {
    lit = next;
    paint();
  }

  function setDisabled(target, flag) {
    const entry = entries.find(e => e.opt.value === target);
    if (entry) markUnavailable(entry, flag);
  }

  // set is the host syncing a pick made elsewhere; setLit is how an auto segment gets lit. one lit
  // state sits behind both, so the two can never disagree about which segment is on
  return {el, set: setLit, setLit, setDisabled, buttons: entries.map(e => e.button)};
}
