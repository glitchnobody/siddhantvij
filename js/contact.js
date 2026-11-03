(function () {
	const d = document.getElementById('contact');
	if (!d || !d.showModal) return; // old browser: the mailto: link still works
	const f = d.querySelector('form'), s = d.querySelector('.status'), go = f.querySelector('[type=submit]');
	document.addEventListener('click', e => {
		if (!e.target.closest('[data-contact]')) return;
		e.preventDefault();
		s.textContent = '';
		d.showModal();
	});
	d.addEventListener('click', e => { if (e.target === d) d.close(); }); // backdrop
	f.querySelector('[data-close]').addEventListener('click', () => d.close());
	f.addEventListener('submit', async e => {
		e.preventDefault();
		go.disabled = true;
		s.textContent = 'Sending...';
		try {
			const r = await fetch('/api/contact', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(Object.fromEntries(new FormData(f)))
			});
			if (!r.ok) throw new Error((await r.json()).error);
			f.reset();
			s.textContent = 'Thanks, your message is on its way.';
			setTimeout(() => d.close(), 1800);
		} catch (err) {
			s.textContent = err.message || 'Something went wrong. Please email sid.work0001@gmail.com instead.';
		}
		go.disabled = false;
	});
})();
