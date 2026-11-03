// Hovering a company pill in the intro blurs the text after it until it disappears and writes a short line in its place,
// word by word. Moving off the pill plays it backwards. Touch screens and phone-width windows skip the effect; the pills just open their link.
(function () {
	if (!matchMedia('(hover: hover) and (pointer: fine) and (min-width: 561px)').matches) return;   // no hover effect on touch screens or phone-width windows
	document.querySelectorAll('.about > p').forEach(p => { if (p.querySelector('.chip[data-reveal]')) init(p); });

	function init(p) {
		p.classList.add('rvp');
		const pillSelector = '.orig .chip[data-reveal]';

		// the original text moves into .orig so the overlay layers can sit on top of it
		const orig = document.createElement('span');
		orig.className = 'orig';
		while (p.firstChild) orig.appendChild(p.firstChild);
		p.appendChild(orig);

		// each pill gets a .tail holding everything after it (that is the part that blurs away)
		const tails = new Map();
		for (const pill of [...orig.querySelectorAll(pillSelector)].reverse()) {
			const tail = document.createElement('span');
			tail.className = 'tail';
			while (pill.nextSibling) tail.appendChild(pill.nextSibling);
			pill.after(tail);
			tails.set(pill, tail);
			pill.setAttribute('aria-label', `${pill.textContent}: ${pill.dataset.reveal}`);   // the overlay is aria-hidden, so say it here
		}

		// overlay for one pill: an invisible copy of the text before it (so the pill lands on the exact same spot),
		// the pill itself, then the new line as separate words
		const layers = new Map();
		const buildLayer = pill => {
			const layer = document.createElement('span');
			layer.className = 'rv';
			layer.setAttribute('aria-hidden', 'true');

			const ghost = document.createElement('span');
			ghost.className = 'ghost';
			const before = document.createRange();
			before.setStart(orig, 0);
			before.setEndBefore(pill);
			ghost.appendChild(before.cloneContents());

			const copy = pill.cloneNode(true);
			copy.removeAttribute('aria-label');
			copy.tabIndex = -1;
			layer.append(ghost, copy);

			pill.dataset.reveal.split(' ').forEach((word, i) => {
				const span = document.createElement('span');
				span.className = 'w';
				span.style.setProperty('--i', i);
				span.textContent = i === 0 ? `${pill.dataset.lead || ''} ${word}` : word;   // the lead (comma or full stop) hugs the pill
				if (i) layer.append(' ');
				layer.append(span);
			});
			return layer;
		};

		let current = null;
		let pair = [];   // the real pill and its copy in the overlay: moving between them is not "leaving"

		const hide = () => {
			if (!current) return;
			tails.get(current).classList.remove('dim');
			const layer = layers.get(current);
			layer.classList.remove('on');
			layer.classList.add('out');   // fades away instead of cutting
			current = null;
			pair = [];
		};
		const show = pill => {
			if (current === pill) return;
			hide();
			let layer = layers.get(pill);
			if (!layer) {
				layer = buildLayer(pill);
				layers.set(pill, layer);
				p.appendChild(layer);
			}
			current = pill;
			pair = [pill, layer.querySelector(':scope > .chip')];
			tails.get(pill).classList.add('dim');
			layer.classList.remove('out', 'on');
			void layer.offsetWidth;   // lets the word animation restart
			layer.classList.add('on');
		};
		const leaving = e => current && !pair.some(el => el.contains(e.relatedTarget));

		p.addEventListener('pointerover', e => { const pill = e.target.closest(pillSelector); if (pill) show(pill); });
		p.addEventListener('pointerout', e => { if (leaving(e)) hide(); });
		p.addEventListener('focusin', e => { const pill = e.target.closest(pillSelector); if (pill) show(pill); });
		p.addEventListener('focusout', e => { if (leaving(e)) hide(); });
		p.addEventListener('click', e => { if (e.target.closest('[data-open]')) hide(); });   // opening a dialog
		document.addEventListener('close', hide, true);                                         // a dialog closing
	}
})();
