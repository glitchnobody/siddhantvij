// Every <dialog> that has a form posts it to /api/contact (src/worker.js).
// Anything with data-open="<dialog id>" opens that dialog; without JavaScript it stays a normal mailto: link.
document.querySelectorAll('dialog').forEach(dialog => {
	const form = dialog.querySelector('form');
	if (!form || !dialog.showModal) return;
	const status = dialog.querySelector('.status');
	const send = form.querySelector('[type=submit]');

	document.addEventListener('click', e => {
		const opener = e.target.closest('[data-open]');
		if (!opener || opener.dataset.open !== dialog.id) return;
		e.preventDefault();
		status.textContent = '';
		dialog.showModal();
	});
	dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });   // click on the backdrop
	form.querySelector('[data-close]').addEventListener('click', () => dialog.close());

	form.addEventListener('submit', async e => {
		e.preventDefault();
		send.disabled = true;
		status.textContent = 'Sending...';
		try {
			const res = await fetch('/api/contact', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(Object.fromEntries(new FormData(form)))
			});
			if (!res.ok) throw new Error((await res.json()).error);
			form.reset();
			status.textContent = 'Thanks, your message is on its way.';
			setTimeout(() => dialog.close(), 1800);
		} catch (err) {
			status.textContent = err.message || 'Something went wrong. Please email sid.work0001@gmail.com instead.';
		}
		send.disabled = false;
	});
});
