const json = (body, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default {
	async fetch(req, env) {
		const url = new URL(req.url);
		if (url.pathname !== '/api/contact') return env.ASSETS.fetch(req);
		if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

		// same-site only: browsers always send Origin on a cross-site POST
		const origin = req.headers.get('origin');
		if (origin && new URL(origin).host !== url.host) return json({ error: 'Forbidden' }, 403);
		if (Number(req.headers.get('content-length') || 0) > 10000) return json({ error: 'Too large' }, 413);

		let body;
		try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }

		if (body.website) return json({ ok: true }); // honeypot: bots fill it, pretend success

		const name = clean(body.name, 100).replace(/[\r\n]+/g, ' ');
		const email = clean(body.email, 254);
		const phone = clean(body.phone, 30); // optional
		const message = clean(body.message, 5000);
		const topic = body.topic === 'auctervia' ? 'auctervia' : 'contact';
		if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return json({ error: 'Please fill in your name, a valid email and a message.' }, 400);
		}
		if (phone && !/^[\d\s()+.-]{5,30}$/.test(phone)) {
			return json({ error: 'That phone number does not look right.' }, 400);
		}
		if (!env.RESEND_API_KEY) {
			console.error('RESEND_API_KEY is not set');
			return json({ error: 'Server not configured' }, 500);
		}

		const subject = topic === 'auctervia' ? `Auctervia enquiry from ${name}` : `New message from ${name}`;
		const lines = [`From: ${name} <${email}>`];
		if (phone) lines.push(`Phone: ${phone}`);
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				from: env.CONTACT_FROM,
				to: [env.CONTACT_TO],
				reply_to: email,
				subject,
				text: `${lines.join('\n')}\n\n${message}`
			})
		});
		if (!res.ok) {
			console.error('Resend error', res.status, await res.text());
			return json({ error: 'Could not send right now' }, 502);
		}
		return json({ ok: true });
	}
};
