// Copy buttons: [data-copy] puts its text on the clipboard, shows a tick and floats a "Copied" label upwards.
document.addEventListener('click', async e => {
	const button = e.target.closest('[data-copy]');
	if (!button) return;

	try {
		await navigator.clipboard.writeText(button.dataset.copy);
	} catch {
		const field = document.createElement('textarea');   // fallback when the clipboard API is blocked
		field.value = button.dataset.copy;
		document.body.append(field);
		field.select();
		document.execCommand('copy');
		field.remove();
	}

	button.querySelector('.pop')?.remove();   // a quick second click starts a fresh label
	const pop = document.createElement('span');
	pop.className = 'pop';
	pop.setAttribute('aria-hidden', 'true');
	pop.textContent = 'Copied';
	pop.addEventListener('animationend', () => pop.remove());
	button.append(pop);

	button.classList.add('done');
	button.setAttribute('aria-label', 'Copied');
	clearTimeout(button.timer);
	button.timer = setTimeout(() => {
		button.classList.remove('done');
		button.setAttribute('aria-label', 'Copy email address');
	}, 1600);
});
