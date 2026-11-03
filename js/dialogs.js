// Links that open the composer are buttons, not mailto: links: no href means no "mailto:" tooltip and no address in the status bar
document.querySelectorAll('a[data-open]').forEach(a => { a.removeAttribute('href'); a.setAttribute('role', 'button'); a.tabIndex = 0; });
document.addEventListener('keydown', e => { const a = e.target.closest && e.target.closest('a[data-open]'); if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); a.click(); } });
// On phones a drawer opens with nothing focused: no keyboard popping up and no highlighted field or close button
const nativeShowModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
	nativeShowModal.call(this);
	if (matchMedia('(pointer: coarse), (max-width: 560px)').matches) { this.tabIndex = -1; this.focus({ preventScroll: true }); }
};
// Every <dialog> that has a form posts it to /api/contact (src/worker.js).
// Anything with data-open="<dialog id>" opens that dialog; without JavaScript it stays a normal mailto: link.
// One composer serves both openers: data-open="contact" and data-open="auctervia" only change the subtext, topic and prefilled subject.
const TOPICS = {
	contact: { sub: 'Drop your message, I respond quickly.', subject: 'Hey, saw your website, let\u2019s connect' },
	auctervia: { sub: 'Interested in Auctervia? Drop a message on how you want to deploy/secure your AI stack.', subject: 'Hey, I am interested in deploying my AI stack with Auctervia' }
};
document.querySelectorAll('dialog').forEach(dialog => {
	const form = dialog.querySelector('form');
	if (!form || !dialog.showModal) return;
	const status = dialog.querySelector('.status');
	const send = form.querySelector('[type=submit]');
	const sendText = send.textContent;

	// country code picker: every country, flag emoji built from the region code, searchable, default from the visitor's location
	const box = form.querySelector('[data-cc]');
	let setCountry = () => {}, locate = () => {};
	if (box) {
		const hidden = box.querySelector('input[name=cc]'), btn = box.querySelector('.cc-btn'), pop = box.querySelector('.cc-pop'), q = box.querySelector('.cc-q'), ul = pop.querySelector('ul');
		const COUNTRIES = 'AF93 AL355 DZ213 AS1684 AD376 AO244 AI1264 AG1268 AR54 AM374 AW297 AU61 AT43 AZ994 BS1242 BH973 BD880 BB1246 BY375 BE32 BZ501 BJ229 BM1441 BT975 BO591 BA387 BW267 BR55 VG1284 BN673 BG359 BF226 BI257 KH855 CM237 CA1 CV238 KY1345 CF236 TD235 CL56 CN86 CO57 KM269 CG242 CD243 CK682 CR506 CI225 HR385 CU53 CW599 CY357 CZ420 DK45 DJ253 DM1767 DO1809 EC593 EG20 SV503 GQ240 ER291 EE372 SZ268 ET251 FK500 FO298 FJ679 FI358 FR33 GF594 PF689 GA241 GM220 GE995 DE49 GH233 GI350 GR30 GL299 GD1473 GP590 GU1671 GT502 GN224 GW245 GY592 HT509 HN504 HK852 HU36 IS354 IN91 ID62 IR98 IQ964 IE353 IL972 IT39 JM1876 JP81 JO962 KZ7 KE254 KI686 XK383 KW965 KG996 LA856 LV371 LB961 LS266 LR231 LY218 LI423 LT370 LU352 MO853 MG261 MW265 MY60 MV960 ML223 MT356 MH692 MQ596 MR222 MU230 YT262 MX52 FM691 MD373 MC377 MN976 ME382 MS1664 MA212 MZ258 MM95 NA264 NR674 NP977 NL31 NC687 NZ64 NI505 NE227 NG234 NU683 KP850 MK389 MP1670 NO47 OM968 PK92 PW680 PS970 PA507 PG675 PY595 PE51 PH63 PL48 PT351 PR1787 QA974 RE262 RO40 RU7 RW250 WS685 SM378 ST239 SA966 SN221 RS381 SC248 SL232 SG65 SX1721 SK421 SI386 SB677 SO252 ZA27 KR82 SS211 ES34 LK94 SH290 KN1869 LC1758 PM508 VC1784 SD249 SR597 SE46 CH41 SY963 TW886 TJ992 TZ255 TH66 TL670 TG228 TK690 TO676 TT1868 TN216 TR90 TM993 TC1649 TV688 UG256 UA380 AE971 GB44 US1 UY598 UZ998 VU678 VA379 VE58 VN84 VI1340 WF681 YE967 ZM260 ZW263';
		let names; try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch {}
		const flag = r => String.fromCodePoint(...[...r].map(x => 127397 + x.charCodeAt()));
		const items = COUNTRIES.split(' ').map(c => ({ r: c.slice(0, 2), d: '+' + c.slice(2), n: (names && names.of(c.slice(0, 2))) || c.slice(0, 2) })).sort((x, y) => x.n.localeCompare(y.n));
		let home = 'IN', cur = '', shown = items, active = 0, touched = false;
		try { const r = new Intl.Locale(navigator.language).maximize().region; if (items.some(c => c.r === r)) home = r; } catch {}

		const pick = r => {
			const c = items.find(x => x.r === r); if (!c) return;
			cur = r; hidden.value = c.d;
			btn.querySelector('.fl').textContent = flag(r); btn.querySelector('.dc').textContent = c.d;
		};
		setCountry = () => pick(home);
		const render = () => {
			ul.innerHTML = shown.map(c => `<li role="option" id="cc-${c.r}" data-r="${c.r}" aria-selected="${c.r === cur}"><span class="fl">${flag(c.r)}</span><span class="nm">${c.n}</span><span class="dc">${c.d}</span></li>`).join('') || '<li class="none">No country found</li>';
			mark();
		};
		const mark = () => {
			[...ul.children].forEach((li, i) => li.classList.toggle('on', i === active));
			ul.children[active]?.scrollIntoView({ block: 'nearest' });
			q.setAttribute('aria-activedescendant', ul.children[active]?.id || '');
		};
		const filter = () => {
			const t = q.value.trim().toLowerCase().replace(/^\+/, '');
			shown = t ? items.filter(c => c.n.toLowerCase().includes(t) || c.d.slice(1).startsWith(t) || c.r.toLowerCase() === t) : items;
			active = 0; render();
		};
		const open = () => {
			q.value = ''; shown = items; active = Math.max(0, items.findIndex(c => c.r === cur));
			pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); render(); q.focus({ preventScroll: true });
		};
		const close = back => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (back) btn.focus(); };
		const choose = r => { pick(r); touched = true; close(true); };

		setCountry();
		btn.addEventListener('click', () => pop.hidden ? open() : close());
		q.addEventListener('input', filter);
		q.addEventListener('keydown', e => {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, Math.min(shown.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1))); mark(); }
			else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active].r); }
			else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }   // closes the list, not the dialog
		});
		ul.addEventListener('click', e => { const li = e.target.closest('li[data-r]'); if (li) choose(li.dataset.r); });
		document.addEventListener('click', e => { if (!pop.hidden && !box.contains(e.target)) close(); });
		dialog.addEventListener('close', () => close());
		// the Worker answers with the visitor's country (from Cloudflare); anywhere else this 404s and the browser language stays
		let asked = false;
		locate = () => {   // on first open, so the page load makes no extra request
			if (asked) return;
			asked = true;
			fetch('/api/country').then(r => r.ok ? r.json() : null).then(d => {
				if (!d || !items.some(c => c.r === d.country)) return;
				home = d.country;
				if (!touched) setCountry();
			}).catch(() => {});
		};
	}

	// validation: no browser bubbles. An empty field turns red and its placeholder becomes the error;
	// a field with something wrong in it turns red and the message appears in the red notice above Send.
	const fields = [...form.querySelectorAll('input:not([type=hidden]):not(.hp):not(.cc-q), textarea')];
	fields.forEach(el => { el.dataset.ph = el.placeholder; });
	const ASK = { email: 'your email', name: 'your name', subject: 'a subject', message: 'a message', phone: 'a phone number' };
	const problem = el => {
		const v = el.value.trim();
		if (!v) return el.required ? 'Please enter ' + (ASK[el.name] || 'this field') : '';
		if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "That email doesn't look right";
		if (el.name === 'phone' && !(box ? /^\d{4,15}$/ : /^[\d\s()+.-]{4,20}$/).test(v)) return "That phone number doesn't look right";
		return '';
	};
	const clear = el => {
		el.classList.remove('bad'); el.removeAttribute('aria-invalid'); el.placeholder = el.dataset.ph;
		if (form.dataset.state === 'invalid' && !form.querySelector('.bad')) { form.dataset.state = 'idle'; status.textContent = ''; }
	};
	const validate = () => {
		let first = null, notice = '';
		fields.forEach(el => {
			const msg = problem(el);
			if (!msg) return clear(el);
			el.classList.add('bad'); el.setAttribute('aria-invalid', 'true');
			if (el.value.trim()) notice = notice || msg; else el.placeholder = msg;
			first = first || el;
		});
		if (first) first.focus();
		form.dataset.state = notice ? 'invalid' : 'idle';
		status.textContent = notice;
		return !first;
	};
	fields.forEach(el => el.addEventListener('input', () => clear(el)));
	if (box) { const phone = form.querySelector('[name=phone]'); phone.inputMode = 'numeric'; phone.addEventListener('input', () => { phone.value = phone.value.replace(/\D/g, ''); }); }   // digits only; the country code is the picker
	dialog.addEventListener('close', () => fields.forEach(clear));
	form.addEventListener('moved', () => fields.forEach(clear));   // fired when the form goes back to its own dialog

	// sets topic, subtext and prefilled subject, and resets the send state; also used when the form is shown inside the Auctervia drawer
	form.applyTopic = topic => {
		const t = TOPICS[topic], subject = form.elements.subject, kind = form.elements.topic;
		if (t && subject) {
			kind.value = topic;
			form.querySelector('.msub').textContent = t.sub;
			if (!subject.value || Object.values(TOPICS).some(x => x.subject === subject.value)) subject.value = t.subject;   // leave a subject the visitor edited
		}
		status.textContent = '';
		form.dataset.state = 'idle';
		send.textContent = sendText;
		locate();
	};
	document.addEventListener('click', e => {
		const opener = e.target.closest('[data-open]');
		const topic = opener && opener.dataset.open;
		if (!topic || !(topic === dialog.id || (dialog.id === 'contact' && TOPICS[topic]))) return;
		e.preventDefault();
		form.applyTopic(topic);
		locate();
		dialog.showModal();
	});
	dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });   // click on the backdrop
	form.querySelector('[data-close]').addEventListener('click', () => form.closest('dialog').close());

	form.addEventListener('submit', async e => {
		e.preventDefault();
		if (!validate()) return;
		send.disabled = true;
		form.dataset.state = 'loading';
		send.textContent = 'Sending...';
		status.textContent = '';
		try {
			const data = Object.fromEntries(new FormData(form));
			if (box) { data.phone = data.phone.trim() ? data.cc + ' ' + data.phone.trim() : ''; delete data.cc; }   // the form field holds only the number
			const res = await fetch('/api/contact', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error((await res.json()).error);
			form.reset();
			setCountry();
			form.dataset.state = 'success';
			status.textContent = 'Thanks, your message is on its way.';
			setTimeout(() => form.closest('dialog').close(), 2600);
		} catch (err) {
			form.dataset.state = 'error';
			send.textContent = 'Try again';
			status.textContent = err.message || 'Something went wrong. Please email hey@glitchnobody.com instead.';
		}
		send.disabled = false;
	});
});

// Lightbox: [data-lightbox="<dialog id>"] opens it; the x button, the backdrop and Esc close it.
document.querySelectorAll('dialog.lightbox').forEach(box => {
	document.addEventListener('click', e => { if (e.target.closest('[data-lightbox="' + box.id + '"]')) box.showModal(); });
	box.addEventListener('click', e => { if (e.target === box || e.target.closest('.x')) box.close(); });
});

// Agent view: the same markdown file that agents are served at / (src/worker.js), fetched once.
const agentBox = document.getElementById('agent-view');
if (agentBox && agentBox.showModal) {
	let loaded = false;
	document.addEventListener('click', e => {
		if (!e.target.closest('[data-agent]')) return;
		agentBox.showModal();
		if (loaded) return;
		loaded = true;
		fetch('agent.md').then(r => r.ok ? r.text() : Promise.reject()).then(t => { agentBox.querySelector('pre').textContent = t; })
			.catch(() => { loaded = false; agentBox.querySelector('pre').textContent = 'Could not load the agent view.'; });
	});
	agentBox.addEventListener('click', e => { if (e.target === agentBox || e.target.closest('.x')) agentBox.close(); });
}

// Phone drawers (the CSS turns dialogs into bottom sheets under 561px).
const phone = matchMedia('(max-width: 560px)');

// Keyboard: lift the drawer by however much of the screen the keyboard covers, shrink its max height to what is left,
// and scroll the focused field into view so everything below stays reachable without closing the keyboard.
const vv = window.visualViewport;
if (vv) {
	const sync = () => {
		const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop);
		const root = document.documentElement.style;
		root.setProperty('--kb', (kb > 1 ? kb : 0) + 'px');
		root.setProperty('--vvh', vv.height + 'px');
	};
	vv.addEventListener('resize', sync);
	vv.addEventListener('scroll', sync);
	sync();
	document.addEventListener('focusin', e => {
		if (!phone.matches || !e.target.closest('dialog')) return;
		setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);   // after the keyboard has finished opening
	});
}

// Swipe down to close: drag from the top handle, or from anywhere once the content is scrolled to the top.
document.querySelectorAll('dialog').forEach(dialog => {
	let startY = 0, dy = 0, drag = false, t0 = 0, armed = false;
	dialog.addEventListener('touchstart', e => {
		armed = phone.matches && !e.target.closest('input, textarea, button, a');
		if (!armed) return;
		const y = e.touches[0].clientY;
		armed = dialog.scrollTop <= 0 || y - dialog.getBoundingClientRect().top < 40;
		startY = y; dy = 0; drag = false; t0 = Date.now();
	}, { passive: true });
	dialog.addEventListener('touchmove', e => {
		if (!armed) return;
		dy = e.touches[0].clientY - startY;
		if (!drag) { if (dy <= 6) return; drag = true; dialog.style.transition = 'none'; }   // an upward move is a normal scroll
		e.preventDefault();
		dialog.style.transform = `translateY(${Math.max(0, dy)}px)`;
	}, { passive: false });
	const end = () => {
		if (!drag) return;
		drag = armed = false;
		dialog.style.transition = '';
		const fast = dy / Math.max(1, Date.now() - t0) > 0.5;   // px per ms
		if (dy > dialog.offsetHeight * 0.3 || fast) { dialog.style.transform = ''; dialog.close(); }   // the CSS slides it the rest of the way down
		else dialog.style.transform = '';                                                                // springs back
	};
	dialog.addEventListener('touchend', end);
	dialog.addEventListener('touchcancel', end);
});

// Colophon: [data-colophon] opens the drawer; the x button, the backdrop and Esc close it.
const colophon = document.getElementById('colophon');
if (colophon && colophon.showModal) {
	document.addEventListener('click', e => { if (e.target.closest('[data-colophon]')) colophon.showModal(); });
	colophon.addEventListener('click', e => { if (e.target === colophon || e.target.closest('.x')) colophon.close(); });
}

// Experience: [data-role] (a row, or the Auctervia pill in the intro) fills the drawer from the row's text and the matching
// <template id="role-...">. The Auctervia drawer also borrows the contact form, and hands it back when it closes.
const roleBox = document.getElementById('role');
if (roleBox && roleBox.showModal) {
	const contactBox = document.getElementById('contact');
	const composer = contactBox && contactBox.querySelector('form');
	document.addEventListener('click', e => {
		const el = e.target.closest('[data-role]');
		const key = el && el.dataset.role;
		const tpl = key && document.getElementById('role-' + key);
		const row = key && document.querySelector('.experience [data-role="' + key + '"]');
		if (!tpl || !row) return;
		e.preventDefault();
		roleBox.querySelector('.logo').src = row.querySelector('.logo').src;
		roleBox.querySelector('.title').textContent = row.querySelector('.name').textContent;
		roleBox.querySelector('.rd span').textContent = row.querySelector('.role').textContent;
		roleBox.querySelector('.rt span').textContent = row.querySelector('.date').textContent;
		const body = roleBox.querySelector('.rbody');
		body.replaceChildren(tpl.content.cloneNode(true));
		if (key === 'auctervia' && composer) {
			const wrap = document.createElement('div');
			wrap.className = 'contact embedded';
			wrap.append(composer);
			body.append(wrap);
			composer.applyTopic('auctervia');
		}
		roleBox.scrollTop = 0;
		roleBox.showModal();
	});
	roleBox.addEventListener('click', e => { if (e.target === roleBox || e.target.closest('.x')) roleBox.close(); });
	roleBox.addEventListener('close', () => {
		if (composer && !contactBox.contains(composer)) { contactBox.append(composer); composer.dispatchEvent(new Event('moved')); }
	});
}
