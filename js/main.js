$(function () {
	'use strict';

	/* ==================== helpers ==================== */
	const { PI, sin, cos, abs, min, max, floor, ceil, round, sqrt, hypot, atan2, exp, pow, log } = Math;
	const TAU = PI * 2;
		const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
	const lerp = (a, b, k) => a + (b - a) * k;
	const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
	const rand = (a, b) => a + Math.random() * (b - a);
	const store = {
		get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
		set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
	};
	function rng(seed) { // mulberry32, so the scene stays the same across resizes
		return () => {
			seed = seed + 0x6D2B79F5 | 0;
			let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
			t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
			return ((t ^ t >>> 14) >>> 0) / 4294967296;
		};
	}
	function hash(x, y) {
		let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
		h = Math.imul(h ^ h >>> 13, 1274126177);
		return ((h ^ h >>> 16) >>> 0) / 4294967296;
	}
	function vnoise(x, y) {
		const xi = floor(x), yi = floor(y), xf = x - xi, yf = y - yi;
		const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
		return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
	}
	function fbm(x, y, oct) {
		let a = .5, s = 0, n = 0;
		for (let i = 0; i < (oct || 4); i++) { s += a * vnoise(x, y); n += a; a *= .5; x = x * 2 + 17; y = y * 2 + 9; }
		return s / n;
	}
	const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
	const bayer = (x, y) => (BAYER[(y & 7) << 3 | x & 7] + .5) / 64;

	/* Buffers hold 0 = empty, 1 = dark ink, 2 = bright ink (3 = page foreground, ground only).
	   Art is dithered once, in sprite space, so moving art never shimmers. */
	function sprite(w, h, draw, dot, inv) {
		const SS = 3, c = document.createElement('canvas');
		c.width = w * SS; c.height = h * SS;
		const g = c.getContext('2d', { willReadFrequently: true });
		g.scale(SS, SS); g.lineCap = g.lineJoin = 'round';
		draw(g);
		const d = g.getImageData(0, 0, c.width, c.height).data, px = new Uint8Array(w * h);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			let a = 0, v = 0;
			for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
				const n = ((y * SS + j) * c.width + x * SS + i) * 4, al = d[n + 3];
				a += al; v += d[n] * al;
			}
			if (a < 127.5 * SS * SS) continue;
			const tone = inv ? 1 - v / a / 255 : v / a / 255; // inv: draw the negative, so a white sprite stays white on the light theme
			px[y * w + x] = tone > .9 || (tone > .1 && tone > (dot || bayer)(x, y)) ? 2 : 1;
		}
		return { w, h, px };
	}
	function raster(w, h, fn, dot, inv) { // per-pixel sprite; fn returns tone 0..1, or -1 for empty
		const px = new Uint8Array(w * h), t = new Float32Array(w * h);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[y * w + x] = fn(x, y);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const n = y * w + x, v = t[n];
			if (v < 0) continue;
			// inv (light theme): bright means paper, so the shape gets an inked edge to stay readable
			const edge = inv && (!x || !y || x === w - 1 || y === h - 1 || t[n - 1] < 0 || t[n + 1] < 0 || t[n - w] < 0 || t[n + w] < 0);
			px[n] = edge || (inv ? 1 - v : v) > (dot || bayer)(x, y) ? 2 : 1;
		}
		return { w, h, px };
	}
	function flipped(s) {
		if (s.flip) return s.flip;
		const px = new Uint8Array(s.px.length);
		for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) px[y * s.w + x] = s.px[y * s.w + s.w - 1 - x];
		return s.flip = { ...s, px, flip: s };
	}
	function blit(buf, W, H, s, x, y, rowOffset) {
		x = round(x); y = round(y);
		for (let j = 0; j < s.h; j++) {
			const yy = y + j;
			if (yy < 0 || yy >= H) continue;
			const ox = x + (rowOffset ? rowOffset(j) : 0), row = yy * W, sr = j * s.w;
			for (let i = 0; i < s.w; i++) {
				const v = s.px[sr + i], xx = ox + i;
				if (v && xx >= 0 && xx < W) buf[row + xx] = v;
			}
		}
	}
	function touches(s, ix, iy, pad) { // is any sprite pixel within pad of this point?
		for (let j = iy - pad; j <= iy + pad; j++) for (let i = ix - pad; i <= ix + pad; i++)
			if (i >= 0 && j >= 0 && i < s.w && j < s.h && s.px[j * s.w + i]) return true;
		return false;
	}
	const gray = v => { const n = round(clamp(v, 0, 1) * 255); return `rgb(${n},${n},${n})`; };
	const paint2 = (g, fill, stroke, lw) => {
		if (fill !== null && fill !== undefined) { g.fillStyle = typeof fill === 'number' ? gray(fill) : fill; g.fill(); }
		if (stroke !== null && stroke !== undefined) { g.strokeStyle = gray(stroke); g.lineWidth = lw || 1; g.stroke(); }
	};
	function ell(g, x, y, rx, ry, fill, stroke, lw, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); paint2(g, fill, stroke, lw); }
	function poly(g, pts, fill, stroke, lw) {
		g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
		paint2(g, fill, stroke, lw);
	}
	function line(g, x0, y0, x1, y1, tone, lw) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = gray(tone); g.lineWidth = lw || 1; g.stroke(); }
	function rrect(g, x, y, w, h, r, fill, stroke, lw) { g.beginPath(); g.roundRect(x, y, w, h, r); paint2(g, fill, stroke, lw); }
	function bez(p, k) {
		const u = 1 - k, a = u * u * u, b = 3 * u * u * k, c = 3 * u * k * k, d = k * k * k;
		return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
	}
	function limb(g, pts, w0, w1, tone, opts) { // tapering outlined stroke: stems, branches, tails, legs
		opts = opts || {};
		const n = opts.steps || 14, edge = opts.edge === undefined ? 1 : opts.edge;
		for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
			if ((pass === 0 && !edge) || (opts.only !== undefined && pass !== opts.only)) continue;
			const a = bez(pts, i / n), b = bez(pts, (i + 1) / n), w = lerp(w0, w1, i / n);
			let c = pass ? tone : 0;
			if (pass && opts.stripes && i > 2 && i % opts.stripes < opts.stripes / 2) c = .12;
			line(g, a[0], a[1], b[0], b[1], c, pass ? w : w + edge * 2);
		}
	}
	function ball(g, x, y, r) {
		const a = g.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r * 1.05);
		a.addColorStop(0, '#fff'); a.addColorStop(.6, '#fff'); a.addColorStop(1, gray(.45));
		ell(g, x, y, r, r, a, 0, 1);
	}

	/* ==================== sound: click effects only, synthesised, on by default ==================== */
	const sound = (function () {
		let ctx, master, noiseBuf, on = store.get('sound') !== 'off';
		function init() {
			if (ctx) return;
			const AC = window.AudioContext || window.webkitAudioContext;
			if (!AC) return;
			ctx = new AC();
			master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination);
			noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
			const d = noiseBuf.getChannelData(0);
			for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
		}
		// every effect goes through run(): nothing plays when muted or when the tab is hidden
		function run(fn) {
			if (!on || document.hidden) return;
			init();
			if (!ctx) return;
			if (ctx.state === 'running') fn();
			else ctx.resume().then(() => { if (on && !document.hidden) fn(); }).catch(() => {});
		}
		document.addEventListener('visibilitychange', () => { // a hidden tab goes silent immediately, even mid-effect
			if (!ctx) return;
			if (document.hidden) ctx.suspend(); else if (on) ctx.resume();
		});
		function blip(f1, f2, dur, vol, type, delay) {
			const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
			o.type = type || 'sine';
			o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
			g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
			o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
		}
		function noise(f0, f1, dur, vol) {
			const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
			s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 2;
			f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
			g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * .4); g.gain.linearRampToValueAtTime(.0001, t + dur);
			s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
		}
		const notes = [523, 587, 659, 784, 880, 1047, 1175, 1319];
		const fx = {
			btn() { blip(560, 380, .06, .06, 'triangle'); }, // the default button click
			flip() { blip(300, 820, .14, .05); blip(1320, 1320, .18, .015, 'sine', .06); noise(400, 2400, .16, .02); }, // light switch: the galaxy and the theme button share it
			twinkle() { const f = notes[floor(rand(3, 8))] * 2; blip(f, f, .28, .025); blip(f * 1.5, f * 1.5, .2, .012, 'sine', .05); },
			whoosh() { noise(250, 1100, .4, .035); },
			beam() { blip(220, 700, .22, .03); blip(700, 300, .22, .03, 'sine', .2); },
			boom() { blip(140, 45, .26, .08); noise(400, 100, .18, .035); },
			chord() { [262, 330, 392].forEach((f, i) => blip(f, f, .5, .022, 'sine', i * .04)); },
			sparkle(n) { for (let i = 0; i < 3; i++) { const f = notes[(n + i * 2) % 8] * 2; blip(f, f, .22, .028, 'sine', i * .045); } },
			thud() { blip(120, 50, .18, .08); noise(300, 100, .1, .03); },
			puff() { noise(900, 350, .12, .03); },
			pop() { blip(260, 520, .1, .05, 'triangle'); },
			blipUp() { blip(500, 1300, .12, .03, 'square'); },
			meow() {
				const t = ctx.currentTime, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), b = rand(520, 640);
				o.type = 'triangle'; f.type = 'bandpass'; f.Q.value = 2;
				o.frequency.setValueAtTime(b, t); o.frequency.linearRampToValueAtTime(b * 1.45, t + .09); o.frequency.exponentialRampToValueAtTime(b * .75, t + .26);
				f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1700, t + .1); f.frequency.linearRampToValueAtTime(800, t + .26);
				g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.05, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + .28);
				o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + .3);
			}
		};
		const api = {};
		Object.keys(fx).forEach(k => { api[k] = (...a) => run(() => fx[k](...a)); });
		const label = () => $('#sound').attr('aria-label', 'Sound ' + (on ? 'on' : 'off')).attr('aria-pressed', on);
		$('#sound').on('click', () => {
			if (on) api.btn(); // goes out with the old state, so turning it off still clicks
			on = !on; store.set('sound', on ? 'on' : 'off'); label();
			if (on) api.btn();
		});
		// any other button gets the default click, except the light/dark one, which has its own
		$(document).on('click', 'button:not(#theme):not(#sound)', () => api.btn());
		label();
		return api;
	})();

	/* ==================== theme ==================== */
	const rgba = (r, g, b) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
	const COLORS = { dark: { bg: rgba(0x12, 0x12, 0x12), fg: rgba(255, 255, 255) }, light: { bg: rgba(0xee, 0xee, 0xee), fg: rgba(0, 0, 0) } };
	function luts(t) {
		const c = COLORS[t];
		const ink = Uint32Array.of(c.bg, c.bg, c.fg, c.fg); // sky and ground are both ink on the page colour
		return { sky: ink, ground: ink };
	}
	var onThemeChange = null; // hoisted, so setTheme can run before the sky exists
	let theme, lut, oldLut = null, fadeAt = 0;
	let radiusAnimatable = false;
	try { CSS.registerProperty({ name: '--r', syntax: '<length>', inherits: true, initialValue: '0px' }); radiusAnimatable = true; } catch (e) {} // lets the browser animate the reveal's radius
	const FADE_MS = 420;
	function setTheme(t, instant) {
		if (theme && !instant) { oldLut = lut; fadeAt = performance.now(); } else oldLut = null;
		theme = t; lut = luts(t);
		if (onThemeChange) onThemeChange();
		$('html').attr('data-theme', t);
		$('#theme').attr('aria-label', 'Theme: ' + t);
		store.set('theme', t);
	}
	setTheme(store.get('theme') === 'light' ? 'light' : 'dark', true); // dark unless the visitor chose light before
	let switching = false;
	function repaintNow() { const t = performance.now() / 1000; drawSky(t, 0); drawGround(t, 0); } // one fresh frame in the new colours
	function switchTheme(x, y) { // x, y: where the reveal starts, in viewport pixels
		if (switching) return;
		sound.flip();
		const next = theme === 'dark' ? 'light' : 'dark', root = document.documentElement;
		if (!document.startViewTransition) { // no View Transitions: fall back to the dithered dissolve
			root.classList.add('fade'); setTheme(next); setTimeout(() => root.classList.remove('fade'), 600);
			return;
		}
		switching = true;
		const feather = 260, r = hypot(max(x, innerWidth - x), max(y, innerHeight - y)) + feather; // far enough that the soft edge clears the farthest corner
		root.style.setProperty('--sx', x + 'px'); root.style.setProperty('--sy', y + 'px'); root.style.setProperty('--f', feather + 'px');
		const vt = document.startViewTransition(() => { setTheme(next, true); repaintNow(); });
		const soft = radiusAnimatable && CSS.supports('mask-image', 'radial-gradient(#000, transparent)');
		if (!soft) root.style.setProperty('--r', '99999px'); // no soft mask: leave the new layer fully visible and use the plain circle
		vt.ready.then(() => {
			const to = '::view-transition-new(root)';
			if (!soft) return root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 900, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: to });
			// the new theme grows out of the click as a soft-edged bloom, and arrives a touch bright, like a light turning on
			root.animate({ '--r': ['0px', r + 'px'] }, { duration: 1100, easing: 'cubic-bezier(.45,.05,.25,1)', pseudoElement: to });
			root.animate({ filter: ['brightness(1.4)', 'brightness(1)'] }, { duration: 1100, easing: 'ease-out', pseudoElement: to });
		}).catch(() => {});
		vt.finished.finally(() => { switching = false; });
	}
	$('#theme').on('click', e => {
		const b = e.currentTarget.getBoundingClientRect();
switchTheme(b.left + b.width / 2, b.top + b.height / 2);
	});

	/* ==================== pointer ==================== */
	let ptr = null, canHover = false, PAD = 8; // click only, until a real mouse shows up; fingers get a bigger hit area
	$(document).on('pointermove', e => {
		if (e.pointerType === 'touch') return; // a finger never counts as hovering; a mouse or pen does
		canHover = true; PAD = 2;
		ptr = { x: e.clientX, y: e.clientY };
	});
	$(document.documentElement).on('mouseleave', () => { ptr = null; });
	const skyEl = $('#sky')[0], groundEl = $('#ground')[0];
	const skyCtx = skyEl.getContext('2d'), groundCtx = groundEl.getContext('2d');
	let scale = 2, skyScale = 1, A = 2; // A: buffer pixels per art unit, skyScale: CSS pixels per buffer pixel, scale: CSS pixels per art unit

	function paint(ctx, img, buf, W, key) {
		const d = img.px32, cur = lut[key];
		const k = oldLut ? (performance.now() - fadeAt) / FADE_MS : 1;
		if (k >= 1) { for (let i = 0; i < buf.length; i++) d[i] = cur[buf[i]]; }
		else { // the new theme dissolves in through the same dither as the art
			const prev = oldLut[key];
			for (let i = 0, y = -1; i < buf.length; i++) {
				const x = i % W; if (!x) y++;
				d[i] = bayer(x, y) < k ? cur[buf[i]] : prev[buf[i]];
			}
		}
		ctx.putImageData(img, 0, 0);
	}
	function frameFor(el, ctx, W, H, sc) {
		el.width = W; el.height = H;
		el.style.width = W * sc + 'px'; el.style.height = H * sc + 'px';
		const img = ctx.createImageData(W, H);
		img.px32 = new Uint32Array(img.data.buffer);
		return img;
	}
	function plot(buf, W, H, x, y, v) { x = round(x); y = round(y); if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = v; }

	/* ==================== sky art ==================== */
	const INK = gray(0);
	const sphereLight = (nx, ny, nz) => max(0, nx * -.62 + ny * -.5 + nz * .6);
	const rasterA = (w, h, fn) => raster(w * A, h * A, (x, y) => fn(x / A, y / A), null, theme === 'light');
	function makeMoon(r, seed) {
		const R = rng(seed), craters = [], d = r * 2 + 1;
		for (let i = 0; i < 9; i++) craters.push([(R() - .5) * 1.7, (R() - .5) * 1.7, .1 + R() * .24]);
		return rasterA(d, d, (x, y) => {
			const nx = (x - r) / r, ny = (y - r) / r, q = nx * nx + ny * ny;
			if (q > 1) return -1;
			let tone = .1 + sphereLight(nx, ny, sqrt(1 - q)) * 1.05 + (fbm(x * .4 + seed, y * .4) - .5) * .25;
			for (const c of craters) {
				const dd = hypot(nx - c[0], ny - c[1]) / c[2];
				if (dd < 1) tone -= .55 * (1 - dd * dd * .6);
				else if (dd < 1.3) tone += .22;
			}
			return tone;
		});
	}
	function makeRinged(r, ph) {
		const w = r * 5 + 2, h = r * 3 + 2, cx = w >> 1, cy = h >> 1, a = -.3, ca = cos(a), sa = sin(a);
		return rasterA(w, h, (x, y) => {
			const dx = x - cx, dy = y - cy, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
			const rr = hypot(u, v / .3) / r, ring = rr > 1.32 && rr < 2.35 && !(rr > 1.78 && rr < 1.88);
			const nx = u / r, ny = v / r, q = nx * nx + ny * ny, hit = q < 1;
			if (ring && (!hit || v > 0)) {
				if (!hit && v < 0 && q < 1.05) return .05;
				const shadow = u > 0 && abs(v) < r * .75 && v < 0 ? .3 : 1; // the planet's shadow falls on the ring
				return (.42 + .5 * (.5 + .5 * sin(rr * 34 + ph))) * shadow;
			}
			if (!hit) return -1;
			const band = .5 + .5 * sin(ny * 11 + fbm(nx * 2.4, ny * 7) * 3.2);
			return .05 + sphereLight(nx, ny, sqrt(1 - q)) * (.72 + band * .55);
		});
	}
	const SHIPS = {
		rocket: { w: 70, h: 30, frames: 3, draw(g, f) {
			const y = 15, fl = [15, 20, 12][f];
			poly(g, [[17, y - 5], [17 - fl, y], [17, y + 5]], 1);
			poly(g, [[17, y - 3], [17 - fl * .55, y], [17, y + 3]], .1);
			poly(g, [[26, y - 7], [14, y - 14], [22, y - 14], [36, y - 7]], .55, 0);
			poly(g, [[26, y + 7], [14, y + 14], [22, y + 14], [36, y + 7]], .55, 0);
			const b = g.createLinearGradient(0, y - 9, 0, y + 9);
			b.addColorStop(0, '#fff'); b.addColorStop(.55, gray(.8)); b.addColorStop(1, gray(.25));
			g.beginPath(); g.moveTo(18, y - 6); g.quadraticCurveTo(30, y - 11, 46, y - 8); g.quadraticCurveTo(58, y - 5, 66, y); g.quadraticCurveTo(58, y + 5, 46, y + 8); g.quadraticCurveTo(30, y + 11, 18, y + 6); g.closePath();
			g.fillStyle = b; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
			rrect(g, 15, y - 5, 4, 10, 1, .35, 0);
			line(g, 30, y - 8.6, 30, y + 8.6, 0, .9); line(g, 56, y - 5.8, 56, y + 5.8, 0, .9);
			ell(g, 44, y - .5, 5.6, 5.6, .08, 0, 1.2); g.beginPath(); g.arc(44, y - .5, 3.6, PI * 1.1, PI * 1.6); g.strokeStyle = '#fff'; g.lineWidth = .9; g.stroke();
			ell(g, 44, y - .5, 5.6, 5.6, null, 1, .7);
		} },
		ufo: { w: 60, h: 32, frames: 3, draw(g, f) {
			ell(g, 30, 12, 11, 11, .08, 1, 1.1);
			g.beginPath(); g.arc(30, 12, 9, PI * 1.1, PI * 1.45); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
			const b = g.createLinearGradient(0, 14, 0, 26);
			b.addColorStop(0, '#fff'); b.addColorStop(.5, gray(.72)); b.addColorStop(1, gray(.2));
			ell(g, 30, 20, 27, 6.6, b, 0, 1.1);
			ell(g, 30, 19, 16, 2.6, null, 0, .8);
			for (let i = 0; i < 5; i++) ell(g, 10 + i * 10, 22.4 + (i === 2 ? .8 : i % 4 ? .4 : -.3), 1.7, 1.5, i % 3 === f ? 1 : .1, 0, .7);
			poly(g, [[20, 26], [40, 26], [36, 29], [24, 29]], .4, 0);
		} },
		shuttle: { w: 74, h: 28, frames: 2, draw(g, f) {
			const y = 16;
			if (f) poly(g, [[14, y - 3], [3, y], [14, y + 3]], 1);
			poly(g, [[20, y - 5], [10, y - 15], [18, y - 15], [32, y - 5]], .5, 0);
			poly(g, [[30, y + 4], [14, y + 11], [34, y + 11], [52, y + 4]], .35, 0);
			const b = g.createLinearGradient(0, y - 7, 0, y + 7);
			b.addColorStop(0, '#fff'); b.addColorStop(.6, gray(.82)); b.addColorStop(1, gray(.32));
			g.beginPath(); g.moveTo(14, y - 5); g.lineTo(50, y - 6); g.quadraticCurveTo(64, y - 5, 72, y + 1); g.quadraticCurveTo(62, y + 6, 48, y + 6); g.lineTo(14, y + 5); g.closePath();
			g.fillStyle = b; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
			poly(g, [[56, y - 3], [62, y - 2.6], [66, y], [56, y]], .05);
			for (let i = 0; i < 5; i++) ell(g, 24 + i * 6, y - 2, 1.3, 1.3, .1);
			line(g, 16, y + 2, 50, y + 2, 0, .7); rrect(g, 11, y - 4, 4, 8, 1, .3, 0);
		} },
		satellite: { w: 76, h: 34, frames: 2, draw(g, f) {
			const panel = x => {
				rrect(g, x, 10, 24, 14, 0, .28, 0);
				for (let i = 1; i < 4; i++) line(g, x + i * 6, 10, x + i * 6, 24, .9, .6);
				line(g, x, 17, x + 24, 17, .9, .6);
				poly(g, [[x + 2, 12], [x + 8, 12], [x + 2, 16]], .75);
			};
			panel(2); panel(50);
			line(g, 26, 17, 30, 17, 1, 1.4); line(g, 46, 17, 50, 17, 1, 1.4);
			const b = g.createLinearGradient(30, 0, 46, 0);
			b.addColorStop(0, '#fff'); b.addColorStop(1, gray(.25));
			rrect(g, 30, 9, 16, 16, 2, b, 0, 1.1);
			line(g, 30, 14, 46, 14, 0, .7); ell(g, 38, 20, 2.3, 2.3, .1, 1, .6);
			g.beginPath(); g.ellipse(38, 7, 8, 3.4, 0, PI, TAU); g.closePath(); g.fillStyle = gray(.8); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
			line(g, 38, 7, 38, 2, 1, .8); ell(g, 38, 2, 1.1, 1.1, f ? 1 : .2);
		} }
	};
	const cacheSky = new Map();
	function shipFrame(kind, f, sz) {
		const k = kind + f + sz, d = SHIPS[kind];
		if (!cacheSky.has(k)) cacheSky.set(k, sprite(ceil(d.w * sz), ceil(d.h * sz), g => { g.scale(sz, sz); d.draw(g, f); }, null, theme === 'light'));
		return cacheSky.get(k);
	}

	/* ==================== sky ==================== */
	let SW, SDW, SOX, SH, ink, skyImg, stars, galaxy, bodies, ships, trail, sparks, meteor, nextMeteor, nextShip;

	function buildGalaxy() {
		const R = rng(42), N = floor(clamp(SDW * SH * .055, 16000, 70000)), Rg = SDW * .2, xs = new Float32Array(N), ys = new Float32Array(N);
		const gauss = () => (R() + R() + R() + R() - 2) * 1.05, b = .42, r0 = Rg * .1;
		for (let i = 0; i < N; i++) {
			const k = R();
			let r, th;
			if (k < .3) { r = pow(R(), 2) * Rg * .17 + abs(gauss()) * Rg * .03; th = R() * TAU; } // bright bulge
			else if (k < .4) { r = R() < .5 ? pow(R(), .6) * Rg * .9 : 0; th = R() * TAU; } // faint disk
			else if (k < .44) { const q = Rg * 1.15; r = q + gauss() * Rg * .05; th = log(q / r0) / b + gauss() * .05; } // dwarf companion on one arm
			else {
				const q = pow(R(), 1.5);
				r = Rg * (.1 + 2.5 * q);
				th = floor(R() * 2) * PI + log(r / r0) / b + gauss() * (.2 + q * .3 + (R() < .15 ? .5 : 0)); // the odd stray makes spurs off the arm
				r *= 1 + gauss() * .03;
			}
			xs[i] = cos(th) * r; ys[i] = sin(th) * r;
		}
		return { xs, ys, N, cx: SOX + SDW * .46, cy: SH * .36, tilt: .36, ca: cos(-.36), sa: sin(-.36), a: 0, boost: 0, Rg };
	}
	function drawGalaxy(G, dt) {
		G.boost *= .97;
		G.a += dt * (.035 + G.boost);
		const c = cos(G.a), s = sin(G.a);
		for (let i = 0; i < G.N; i++) {
			const px = G.xs[i], py = G.ys[i], x = px * c - py * s, y = (px * s + py * c) * G.tilt;
			const sx = G.cx + x * G.ca - y * G.sa | 0, sy = G.cy + x * G.sa + y * G.ca | 0;
			if (sx >= 0 && sy >= 0 && sx < SW && sy < SH && hash(i, 3) > (sy / SH - .68) * 3.3) {
				ink[sy * SW + sx] = 2; // tail thins out before the canvas edge
				if (theme === 'light' && hash(i, 9) < .4 && sx + 1 < SW) ink[sy * SW + sx + 1] = 2; // dark dots on a bright page read thin, so give them a little more weight
			}
		}
	}
	function onGalaxy(G, x, y) {
		const dx = x - G.cx, dy = y - G.cy, u = dx * G.ca + dy * G.sa, v = (-dx * G.sa + dy * G.ca) / G.tilt;
		return hypot(u, v) < G.Rg;
	}
	function buildStars() {
		const R = rng(5), list = [], area = SW * SH;
		const add = (n, kind) => {
			for (let i = 0; i < n; i++) {
				const y = R() * SH;
				if (y / SH > .55 && R() < (y / SH - .55) * 2.2) continue; // thin out towards the page
				list.push({ x: floor(R() * SW), y: floor(y), kind, dim: R() < .35, arm: 2 + A * 2 + floor(R() * 4) + kind * 2, next: R() * 10, start: -9, dur: 0, flare: 0 });
			}
		};
		add(area / 700, 0); add(area / 7000, 1); add(area / 42000, 2); add(area / 110000, 3);
		return list;
	}
	function skyArt() { // the sky's sprites depend on the theme, so rebuild them when it changes
		cacheSky.clear();
		const u = SW < 500 ? .7 : 1, planets = [0, 1, 2, 3].map(i => makeRinged(round(26 * u), i * 1.57));
		const moon = makeMoon(round(15 * u), 3), moon2 = makeMoon(round(7 * u), 8);
		for (const b of bodies) { if (b.key === 'planet') { b.frames = planets; b.spr = planets[0]; } else b.spr = b.key === 'moon' ? moon : moon2; }
	}
	function setupSky() {
		SH = floor(380 / skyScale);   // the sky is always 380px tall
		SW = ceil(document.documentElement.clientWidth / skyScale); SDW = min(SW, 1400); SOX = floor((SW - SDW) / 2); // the scene is composed for one fixed width; the space either side repeats its moons and planets
		skyImg = frameFor(skyEl, skyCtx, SW, SH, skyScale);
		ink = new Uint8Array(SW * SH);
		stars = buildStars(); galaxy = buildGalaxy();
		bodies = [
			{ key: 'moon', x: SOX + SDW * .085, y: SH * .14 },
			{ key: 'planet', x: SOX + SDW * .82, y: SH * .05, shimmer: 0 },
			{ key: 'moon2', x: SOX + SDW * .92, y: SH * .3 }
		];
		const R = rng(7);
		[[0, SOX], [SOX + SDW, SW]].forEach(([x0, x1]) => { for (let ox = x0, k = 0; ox < x1; ox += SDW, k++) [['moon', .085, .14], ['planet', .82, .05], ['moon2', .92, .3]].forEach(([key, fx, fy]) => {
			const x = ox + SDW * clamp((k % 2 ? 1 - fx : fx) + (R() - .5) * .12, 0, 1);
			if (R() < .75 && x > x0 + 10 && x < x1 - 40) bodies.push({ key, x, y: SH * (fy + (R() - .5) * .12), shimmer: 0 });
		}); });
		skyArt();
		ships = []; trail = []; sparks = []; meteor = null; nextMeteor = 4; nextShip = 1;
		spawnShip(true); spawnShip(true);
	}
	onThemeChange = () => { if (bodies) skyArt(); };
	function spawnShip(anywhere) {
		if (ships.length >= 4) return;
		const kinds = Object.keys(SHIPS), kind = kinds[floor(rand(0, 4))], right = Math.random() < .5, far = Math.random() < .45;
		const sz = A === 1 ? (far ? .6 : .8) : far ? .8 : 1.2, w = SHIPS[kind].w * sz, v = (far ? rand(5, 11) : rand(10, 21)) * A * (kind === 'satellite' ? .5 : 1) * (right ? 1 : -1);
		ships.push({ kind, sz, vx: v, vy: rand(-.8, .8) * A, boost: 0, beam: 0, w, spr: null,
			x: anywhere ? rand(0, SW) : right ? -w : SW, y: rand(4, SH * .7), ph: rand(0, TAU), bob: rand(1, 3.5) * A, emit: 0, yy: 0 });
	}
	function burst(list, x, y, n, speed, life) {
		for (let i = 0; i < n; i++) { const a = rand(0, TAU), v = rand(.3, 1) * speed; list.push({ x, y, vx: cos(a) * v, vy: sin(a) * v, life: rand(.4, 1) * life }); }
	}
	function drawStar(s, t, dt) {
		if (t > s.next) { // every star picks its own random moment
			s.start = t; s.dur = rand(.3, 1.6);
			s.next = t + s.dur + rand(.8, 9);
		}
		s.flare = max(0, s.flare - dt * 1.4);
		const e = max(t < s.start + s.dur ? sin(PI * (t - s.start) / s.dur) : 0, s.flare), kind = s.kind;
		const { x, y } = s, p = (a, b) => plot(ink, SW, SH, x + a, y + b, 2);
		if (kind === 0) { if (s.flare > 0) { p(1, 0); p(-1, 0); p(0, 1); p(0, -1); } if (s.dim ? e > .25 : e < .7) p(0, 0); return; }
		p(0, 0);
		if (kind === 1) {
			if (e < .85) { p(1, 0); p(-1, 0); p(0, 1); p(0, -1); }
			if (e > .4) { p(2, 0); p(-2, 0); p(0, 2); p(0, -2); }
			return;
		}
		const L = round(s.arm * (.7 + e * .8));
		for (let i = 1; i <= L; i++) {
			if (i > L * .65 && i % 2 === 0) continue;
			p(i, 0); p(-i, 0); p(0, i); p(0, -i);
		}
		p(1, 1); p(-1, 1); p(1, -1); p(-1, -1);
		if (kind === 3) for (let i = 2; i <= round(L * .4); i++) { p(i, i); p(-i, i); p(i, -i); p(-i, -i); }
	}
	function skyHit(x, y) { // top-most clickable under this point
		const ix = round(x), iy = round(y);
		const pad = PAD * A;
		if (meteor && hypot(x - meteor.x - 8 * A, y - meteor.y + 2 * A) < 14 * A) return { type: 'meteor' };
		for (const s of ships) if (s.spr && touches(s.spr, ix - round(s.x), iy - round(s.yy), pad)) return { type: s.kind === 'ufo' ? 'ufo' : 'ship', ref: s };
		for (const b of bodies) if (touches(b.spr, ix - round(b.x), iy - round(b.y), pad)) return { type: b.key === 'planet' ? 'planet' : 'moon', ref: b };
		for (const s of stars) if (s.kind && hypot(x - s.x, y - s.y) < 5 * A + pad) return { type: 'star', ref: s };
		if (onGalaxy(galaxy, x, y)) return { type: 'galaxy', ref: galaxy };
		return null;
	}
	function clickSky(x, y, cx, cy) {
		const h = skyHit(x, y);
		if (!h) {
			sound.twinkle();
			for (const s of stars) if (hypot(s.x - x, s.y - y) < 80 * A) s.flare = 1 - hypot(s.x - x, s.y - y) / (80 * A);
			return;
		}
		const r = h.ref;
		if (h.type === 'ship') { r.boost = 1; sound.whoosh(); }
		else if (h.type === 'ufo') { r.beam = 1.8; sound.beam(); }
		else if (h.type === 'moon') { burst(sparks, r.x + r.spr.w / 2, r.y + r.spr.h / 2, 26, 48 * A, 1.1); sound.boom(); }
		else if (h.type === 'planet') { r.shimmer = 1.6; sound.chord(); }
		else if (h.type === 'meteor') { burst(sparks, meteor.x, meteor.y, 30, 70 * A, .8); meteor = null; sound.boom(); }
		else if (h.type === 'star') { r.flare = 1; burst(sparks, r.x, r.y, 10, 30 * A, .6); sound.sparkle(floor(rand(0, 8))); }
		else if (h.type === 'galaxy') { r.boost = 2.6; switchTheme(cx, cy); } // the galaxy is the light switch
	}
	function drawSky(t, dt) {
		const r = skyEl.getBoundingClientRect();
		if (r.bottom < 0) return;
		ink.fill(0);
		const px = ptr ? (ptr.x - r.left) / skyScale : -1, py = ptr ? (ptr.y - r.top) / skyScale : -1;
		const inside = ptr && px >= 0 && py >= 0 && px < SW && py < SH, hover = inside ? skyHit(px, py) : null;
		drawGalaxy(galaxy, dt);
		for (const st of stars) drawStar(st, t, dt);
		for (const b of bodies) {
			if (b.frames) { b.shimmer = max(0, b.shimmer - dt); b.spr = b.frames[b.shimmer ? floor(t * 10) % 4 : 0]; }
			blit(ink, SW, SH, b.spr, b.x, b.y);
		}
		if (t > nextShip) { spawnShip(false); nextShip = t + rand(5, 14); }
		for (let i = ships.length - 1; i >= 0; i--) {
			const sh = ships[i], d = SHIPS[sh.kind];
			sh.boost *= .985;
			sh.beam = max(0, sh.beam - dt);
			sh.x += sh.vx * (1 + sh.boost * 7) * (sh.beam > 0 ? .1 : 1) * dt; sh.y += sh.vy * dt;
			sh.yy = sh.y + sin(t * .7 + sh.ph) * sh.bob;
			const s = shipFrame(sh.kind, floor(t * 7 + sh.ph) % d.frames, sh.sz);
			sh.spr = sh.vx > 0 ? s : flipped(s);
			blit(ink, SW, SH, sh.spr, sh.x, sh.yy);
			if (sh.beam > 0) { // dithered tractor beam
				const cx = sh.x + sh.w / 2, top = sh.yy + s.h - 2, len = 46 * A;
				for (let y = 0; y < len; y++) for (let x = -5 * A - y * .35; x <= 5 * A + y * .35; x++)
					if ((1 - y / len) * .55 > bayer(x + 99 | 0, y + floor(t * 20))) plot(ink, SW, SH, cx + x, top + y, 2);
			}
			if (sh.kind !== 'ufo' && sh.kind !== 'satellite' && (sh.emit += dt) > (sh.boost > .1 ? .02 : .09)) { // exhaust dust left hanging behind
				sh.emit = 0;
				trail.push({ x: sh.vx > 0 ? sh.x + 2 : sh.x + sh.w - 2, y: sh.yy + s.h / 2 + rand(-1.5, 1.5) * A, life: rand(.7, 1.6) });
			}
			if (sh.x < -sh.w - 4 || sh.x > SW + 4) ships.splice(i, 1);
		}
		for (let i = trail.length - 1; i >= 0; i--) {
			const p = trail[i];
			if ((p.life -= dt) <= 0) trail.splice(i, 1);
			else if (p.life > .3 || hash(i, floor(t * 12)) < .5) plot(ink, SW, SH, p.x, p.y, 2);
		}
		if (t > nextMeteor) { meteor = { x: SW * rand(.45, .95), y: rand(4, SH * .3), life: 0 }; nextMeteor = t + rand(6, 18); }
		if (meteor) {
			meteor.life += dt; meteor.x -= 170 * A * dt; meteor.y += 42 * A * dt;
			const fade = min(1, meteor.life * 8) * (1 - meteor.life);
			for (let k = 0; k < 64 * A; k++) {
				if (k > 12 && hash(k, 3) > (1 - k / 64 / A) * 1.1 * fade) continue;
				plot(ink, SW, SH, meteor.x + k, meteor.y - k * .25, 2);
			}
			for (let k = -2; k <= 2; k++) { plot(ink, SW, SH, meteor.x + k, meteor.y, 2); plot(ink, SW, SH, meteor.x, meteor.y + k, 2); }
			if (meteor.life >= 1) meteor = null;
		}
		for (let i = sparks.length - 1; i >= 0; i--) {
			const p = sparks[i];
			if ((p.life -= dt) <= 0) { sparks.splice(i, 1); continue; }
			p.x += p.vx * dt; p.y += p.vy * dt;
			plot(ink, SW, SH, p.x, p.y, 2);
		}
		const type = hover ? hover.type : null;

		skyEl.style.cursor = !canHover ? '' : type ? 'pointer' : 'default';
		paint(skyCtx, skyImg, ink, SW, 'sky');
	}

	/* ==================== ground art ==================== */
	// laid out in art units (uw, uh) but stippled at full density, like the sky
	const unitSize = (s, w, h) => { s.uw = w; s.uh = h; return s; };
	const gsprite = (w, h, draw, inv) => unitSize(sprite(w * A, h * A, g => { g.scale(A, A); draw(g); }, hash, inv), w, h);
	const graster = (w, h, fn) => unitSize(raster(w * A, h * A, (x, y) => fn(x / A, y / A), hash), w, h);
	function makeMound(w, h, seed, pits) {
		const R = rng(seed * 991 | 0), holes = [], tops = new Float32Array(w);
		for (let i = 0; i < (pits || 0); i++) holes.push([R() * w, h * (.3 + R() * .5), 1.5 + R() * h * .08]);
		for (let x = 0; x < w; x++) {
			const u = (x + .5) / w * 2 - 1, env = pow(max(0, 1 - pow(abs(u), 2.2)), .62);
			tops[x] = h * (1 - clamp(env * (.62 + .62 * fbm(x * .05 + seed, seed, 3)) + (vnoise(x * .4 + seed, 2) - .5) * .05, 0, 1));
		}
		return graster(w, h, (x, y) => {
			const ix = floor(x);
			if (y < tops[ix]) return -1;
			const d = y - tops[ix], slope = (tops[min(w - 1, ix + 2)] - tops[max(0, ix - 2)]) / 4; // left-facing slopes catch the light
			if (d < .6) return 1;
			for (const p of holes) if (hypot((x - p[0]) / 1.5, y - p[1]) < p[2]) return 0;
			const lit = lerp(.28, 1, smooth(-.2, .45, .1 - slope)) * lerp(1, .45, x / w);
			return clamp(exp(-d / (h * .13)) * lit * (.3 + 1.1 * fbm(x * .16 + seed, y * .22, 4)), 0, 1);
		});
	}
	function glowPlant(w, h, seed, n, trunk) { // twisted stems ending in glowing orbs; the orbs are recorded so the halos can follow the sway
		const R = rng(seed), orbs = [], spr = gsprite(w, h, g => {
			const cx = w / 2, b = h - 1, sc = h / 70;
			[[-.22, 3.2], [.2, 2.6], [.04, 1.8]].forEach(([k, r]) => ell(g, cx + k * w, b - r * .3, r, r * .55, .5, 1, .8)); // a few pebbles at the foot
			const trunkPts = [[cx, b], [cx - 7 * sc, b - h * .24], [cx + 7 * sc, b - h * .4], [cx - 1 * sc, b - h * .56]];
			if (trunk) { limb(g, [[cx - 3 * sc, b], [cx - 4 * sc, b - 3], [cx - 8 * sc, b - 1], [cx - 12 * sc, b]], 3 * sc, 1, 1, { steps: 6 }); limb(g, [[cx + 3 * sc, b], [cx + 4 * sc, b - 3], [cx + 8 * sc, b - 1], [cx + 12 * sc, b]], 3 * sc, 1, 1, { steps: 6 }); limb(g, trunkPts, 5.6 * sc, 2.8 * sc, 1, { steps: 16 }); }
			for (let i = 0; i < n; i++) {
				const k = n > 1 ? i / (n - 1) - .5 : 0, r = (3.4 + R() * 2.2) * max(.8, sc), x = cx + k * w * .8, y = b - h * (.7 + R() * .2) + abs(k) * h * .12;
				const at = trunk ? bez(trunkPts, .62 + i * .13) : [cx + (R() - .5) * 3, b], sy = at[1], sx = at[0];
				limb(g, [[sx, sy], [sx + k * w * .22, sy - h * .06], [x - k * 6 * sc, lerp(sy, y, .6) + 4], [x, y + r * .8]], trunk ? 2.5 * sc : 2.1, 1.3, 1, { steps: 10, edge: .8 });
				const bx = lerp(cx, x, .5) + (R() - .5) * 6, by = lerp(sy, y, .45);
				ell(g, bx, by, 1.4, 1.4, 1); // little bud on the stem
				ell(g, x, y, r, r, 1); ell(g, x + r * .35, y + r * .3, r * .55, r * .55, .55); // shaded side
				orbs.push({ x, y, r });
			}
		});
		spr.orbs = orbs;
		return spr;
	}
	function soil(g, cx, b, w, hm, R) { // lumpy rim-lit ground that the plant or crystal grows out of
		const pts = [];
		for (let i = 0; i <= 14; i++) {
			const u = i / 14 * 2 - 1, env = pow(max(0, 1 - pow(abs(u), 2.4)), .55);
			pts.push([cx + u * w / 2, b - hm * env * (.55 + R() * .6)]);
		}
		const c = g.createLinearGradient(0, b - hm, 0, b);
		c.addColorStop(0, gray(.85)); c.addColorStop(.35, gray(.4)); c.addColorStop(1, gray(.04));
		g.beginPath(); g.moveTo(pts[0][0], b); pts.forEach(q => g.lineTo(q[0], q[1])); g.lineTo(pts[14][0], b); g.closePath(); g.fillStyle = c; g.fill();
		g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.strokeStyle = '#fff'; g.lineWidth = .9; g.stroke(); // bright rim
		for (let i = 0; i < 3; i++) { const k = (R() - .5) * w * .9; ell(g, cx + k, b - 1, 1.6 + R() * 1.4, 1 + R() * .5, .55, 1, .6); } // pebbles in front
	}
	function shrooms(w, h, seed) {
		const R = rng(seed), sc = max(.55, w / 52), hm = max(4, h * .2);
		return gsprite(w, h, g => {
			soil(g, w / 2, h - 1, w * .96, hm, R);
			const base = h - hm * .55;
			[[.2, .52, .2], [.8, .6, .22], [.5, 1, .3]].forEach(([k, H, r]) => { // small ones first, so the big cap sits in front
				const x = w * k + (R() - .5) * 2, top = base - (base - 4) * H, rx = w * r;
				limb(g, [[x, base], [x + (R() - .5) * 2, top + (base - top) * .6], [x, top + 4], [x, top + 2]], 2.6 * sc, 1.7 * sc, 1, { steps: 8 });
				const c = g.createLinearGradient(x - rx, 0, x + rx, 0);
				c.addColorStop(0, '#fff'); c.addColorStop(.6, '#fff'); c.addColorStop(1, gray(.5));
				g.beginPath(); g.ellipse(x, top + 1.5, rx, rx * .66, 0, PI, TAU); g.quadraticCurveTo(x, top + 1.5 + rx * .26, x - rx, top + 1.5); g.closePath(); paint2(g, c, 0, 1);
				if (rx > 5) for (let i = -3; i <= 3; i++) line(g, x + i * rx * .26, top + 1.5, x + i * rx * .18, top + 1.5 + rx * .13, 0, .5); // gills
				for (let i = 0; i < 3; i++) ell(g, x + (R() - .5) * rx * 1.2, top - R() * rx * .3, .7 + R() * .4, .6, 0);
			});
		});
	}
	function cupPlant(w, h, seed) { // bent stem with a trumpet-shaped cup, and a small bud
		const sc = w / 36;
		return gsprite(w, h, g => {
			const cup = (cx, cy, r) => {
				const c = g.createLinearGradient(cx - r, 0, cx + r, 0);
				c.addColorStop(0, '#fff'); c.addColorStop(.55, '#fff'); c.addColorStop(1, gray(.45));
				poly(g, [[cx - r, cy - r * .7], [cx + r, cy - r * .7], [cx + r * .42, cy + r * .9], [cx - r * .42, cy + r * .9]], c, 0, 1);
				ell(g, cx, cy - r * .7, r, r * .34, 0, 1, 1.1); ell(g, cx - r * .3, cy - r * .74, r * .3, r * .1, .5);
			};
			[[-.12, 3], [.12, 2.4]].forEach(([k, r]) => ell(g, w * .42 + k * w, h - r * .3, r, r * .55, .5, 1, .8));
			limb(g, [[w * .4, h - 1], [w * .18, h * .62], [w * .74, h * .5], [w * .56, h * .2]], 3.6 * sc, 2.2 * sc, 1, { steps: 14 });
			cup(w * .56, h * .17, 7 * sc);
			limb(g, [[w * .5, h * .66], [w * .28, h * .56], [w * .12, h * .46], [w * .1, h * .34]], 1.7 * sc, 1.2 * sc, 1, { steps: 8 });
			cup(w * .1, h * .3, 3.4 * sc);
		});
	}
	function makeSlab(w, h, seed) { // flat-topped, rim-lit pebble slab
		return graster(w, h, (x, y) => {
			const u = (x + .5) / w * 2 - 1, edge = h * (1 - sqrt(max(0, 1 - pow(abs(u), 3.2))) * .86) + (vnoise(x * .5 + seed, 1) - .5) * h * .22;
			if (y < edge) return -1;
			const d = y - edge;
			if (d < .7) return 1;
			return exp(-d / (h * .5)) * (.4 + .7 * fbm(x * .3 + seed, y * .5, 2)) * (1 - .5 * smooth(.2, 1, u));
		});
	}
	function crystals(w, h, seed) {
		const R = rng(seed || 1), hm = max(4, h * .16);
		return gsprite(w, h, g => {
			soil(g, w / 2, h - 1, w * .98, hm, R);
			const b = h - hm * .55, k = b / h, one = (x, H, r, lean) => {
				H *= k;
				const tx = x + lean * H, y = b - H, sh = r * 1.1;
				poly(g, [[x - r, b], [tx - r, y + sh], [tx, y], [tx + r, y + sh], [x + r, b]], 0, 1, 1);
				poly(g, [[x - r, b], [tx - r, y + sh], [tx - r * .45, y + sh * 1.25], [x - r * .45, b]], 1);
				poly(g, [[tx - r, y + sh], [tx, y], [tx + r, y + sh], [tx - r * .2, y + sh * 1.3]], .75);
				line(g, tx - r * .2, y + sh * 1.3, x - r * .2, b, 1, .7);
			};
			const u = w / 64;
			one(w * .76, h * .5, 5 * u, .26); one(w * .22, h * .46, 5 * u, -.32); one(w * .5, h * .9, 7 * u, .03); one(w * .34, h * .28, 3.6 * u, -.2); one(w * .9, h * .24, 3.4 * u, .4);
			for (let i = 0; i < 4; i++) ell(g, w * (.12 + R() * .76), h - 1.4, 1.2 + R() * 1.2, .9, .55, 1, .6); // rubble hides where they meet the ground
		});
	}
	function beaconArt(g, f) {
		line(g, 8, 8, 8, 40, 1, 1.8); line(g, 2, 40, 14, 40, 1, 1.8);
		line(g, 3, 38, 12, 24, 1, .7); line(g, 13, 38, 4, 24, 1, .7); line(g, 4, 24, 12, 12, 1, .7); line(g, 12, 24, 4, 12, 1, .7);
		ell(g, 8, 6, 3.4, 3.4, 1);
		if (f) { line(g, 1, 3, 1, 9, 1, .9); line(g, 15, 3, 15, 9, 1, .9); }
	}

	/* ==================== astronaut cats ==================== */
	const HELMET = 13;
	function helmet(g, x, y, o) {
		const R = HELMET, lx = o.lx || 0, ly = o.ly || 0, hx = x + .4 + lx * 1.6, hy = y + 1.6 + ly * 1.2, r = 8.4, coat = o.coat, e = o.expr;
		ell(g, x, y, R - 1.4, R - 1.4, 0);
		[-1, 1].forEach(s => poly(g, [[hx + s * r * .94, hy], [hx + s * r * 1.02, hy - r * 1.3], [hx + s * r * .16, hy - r * .74]], coat === 0 && s < 0 ? .4 : 1));
		ell(g, hx, hy, r, r * .82, 1);
		g.save(); g.beginPath(); g.ellipse(hx, hy, r, r * .82, 0, 0, TAU); g.clip();
		if (coat === 0) ell(g, hx - r * .62, hy - r * .5, r * .52, r * .48, 0); // cow: a dark patch over one ear
		if (coat === 1) [-.34, 0, .34].forEach(k => poly(g, [[hx + k * r - 1.3, hy - r], [hx + k * r + 1.3, hy - r], [hx + k * r * .8, hy - r * .42]], 0)); // tabby forehead stripes
		if (coat === 2) { ell(g, hx + r * .6, hy + r * .3, r * .24, r * .2, .4); ell(g, hx - r * .3, hy - r * .58, 1, 1, 0); ell(g, hx + r * .25, hy - r * .6, .8, .8, 0); } // spots
		g.restore();
		const fx = hx + lx * 1.2, fy = hy + 1.2 + ly, ex = 3.3;
		[-1, 1].forEach(s => {
			if (e === 'happy') { g.beginPath(); g.arc(fx + s * ex, fy, 1.6, PI * 1.1, PI * 1.9); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); }
			else if (e === 'sleepy') line(g, fx + s * ex - 1.4, fy, fx + s * ex + 1.4, fy, 0, 1);
			else ell(g, fx + s * ex, fy - .3, 1.3, 1.7, 0);
		});
		[-1, 1].forEach(s => { g.beginPath(); g.arc(fx + s, fy + 2, 1, .2, PI - .2); g.strokeStyle = '#000'; g.lineWidth = .8; g.stroke(); });
		g.beginPath(); g.arc(x, y, R - 3.4, PI * 1.02, PI * 1.46); g.strokeStyle = '#fff'; g.lineWidth = 2.2; g.stroke(); // glossy glass
		ell(g, x + R * .58, y - R * .46, .9, .9, 1);
	}
	const LEG_TOPS = [[11, -14], [14, -14], [-12, -14], [-9, -14]]; // near front, far front, near back, far back
	function coatMarks(g, o, b, tail) { // marks only land on the cat (source-atop), so the silhouette stays clean
		const [bx, by, rx, ry, rot] = o.body, tops = o.tops || LEG_TOPS, coat = o.coat;
		const onBody = fn => { g.save(); g.translate(bx, by + b); g.rotate(rot || 0); fn(); g.restore(); };
		const leg = (i, k) => [lerp(tops[i][0], o.feet[i][0], k), lerp(tops[i][1] + b, o.feet[i][1] - 1.5, k)];
		const tailAt = k => { const p = bez(k < .5 ? tail[0] : tail[1], (k % .5) * 2); return [p[0], p[1] + b]; };
		g.save(); g.globalCompositeOperation = 'source-atop';
		if (coat === 0) { // cow patches
			onBody(() => [[-.45, -.25, .36, .55, .3], [.15, .3, .32, .5, -.5], [.62, -.42, .24, .4, 0]].forEach(m => ell(g, m[0] * rx, m[1] * ry, m[2] * rx, m[3] * ry, 0, null, 0, m[4])));
			o.feet.forEach((f, i) => { if (i === 0 || i === 3) { const q = leg(i, .4); ell(g, q[0], q[1], 3, 3.6, 0); } });
			const e = tailAt(.97); ell(g, e[0], e[1], 3.4, 3.4, 0);
		} else if (coat === 1) { // tabby: a few bold bands, not scratchy lines
			onBody(() => {
				if (ry > rx * .9) for (let i = 0; i < 4; i++) { const y = (-.55 + i * .36) * ry; g.beginPath(); g.moveTo(-rx - 2, y - 1); g.quadraticCurveTo(0, y + 3, rx + 2, y - 1); g.strokeStyle = '#000'; g.lineWidth = 2.2; g.stroke(); } // upright body: bands go round it
				else for (let i = 0; i < 4; i++) { const x = (-.62 + i * .36) * rx; poly(g, [[x - 2.2, -ry - 2], [x + 2.2, -ry - 2], [x + 1.2 + (i % 2) * 1, ry * (i % 2 ? .35 : .7)], [x - 1.2, ry * .2]], 0); }
			});
			o.feet.forEach((f, i) => { const q = leg(i, .5); line(g, q[0] - 3.6, q[1], q[0] + 3.6, q[1], 0, 2); });
			[.18, .38, .58, .78].forEach(k => { // rings: bars across the tail
				const q = tailAt(k), q2 = tailAt(min(.98, k + .03)), a = atan2(q2[1] - q[1], q2[0] - q[0]) + PI / 2;
				line(g, q[0] - cos(a) * 3.6, q[1] - sin(a) * 3.6, q[0] + cos(a) * 3.6, q[1] + sin(a) * 3.6, 0, 2.2);
			});
		} else { // spots
			onBody(() => [[-.6, -.3, 1.8, 0], [-.2, .35, 1.4, .45], [.1, -.5, 2, 0], [.35, .1, 1.6, 0], [.62, -.2, 1.3, .45], [-.4, .52, 1.2, 0], [.78, .35, 1.5, 0], [-.82, .1, 1.4, 0], [0, 0, 1.2, .45]].forEach(m => ell(g, m[0] * rx, m[1] * ry, m[2], m[2] * .9, m[3])));
			o.feet.forEach((f, i) => { const q = leg(i, .4); ell(g, q[0], q[1], 1.4, 1.4, 0); });
			[.3, .5, .7, .88].forEach(k => { const q = tailAt(k); ell(g, q[0], q[1], 1.2, 1.2, 0); });
		}
		g.restore();
	}
	function catRig(g, o) { // origin between the paws, facing right; the body is one solid silhouette
		const b = o.bob || 0, [bx, by, rx, ry, rot] = o.body, [hx, hy] = o.head, tops = o.tops || LEG_TOPS, [tx, ty] = o.tailAt || [-15, -20], s = o.tail || 0;
		const tail = [[[tx, ty], [tx - 9, ty + 2], [tx - 14, ty - 4], [tx - 13 + s, ty - 12]], [[tx - 13 + s, ty - 12], [tx - 12 + s, ty - 19], [tx - 4 + s, ty - 20], [tx - 4 + s, ty - 15]]];
		const shape = (grow, tone) => {
			tail.forEach((t, i) => { for (let k = 0; k < 8; k++) { const p = bez(t, k / 8), q = bez(t, (k + 1) / 8); line(g, p[0], p[1] + b, q[0], q[1] + b, tone, (i ? 3 : 4.2) + grow * 2); } });
			o.feet.forEach((f, i) => {
				line(g, tops[i][0], tops[i][1] + b, f[0], f[1] - 1.5, tone, 4.8 + grow * 2);
				ell(g, f[0] + 1, f[1] - 1.7, 3.2 + grow, 2 + grow, tone);
			});
			ell(g, bx, by + b, rx + grow, ry + grow, tone, null, 0, rot);
			line(g, bx + rx * .55, by - 2 + b, hx - 3, hy + 6 + b, tone, 9 + grow * 2);
			ell(g, hx, hy + b, HELMET + grow, HELMET + grow, tone);
		};
		shape(1, 0); shape(0, 1);
		coatMarks(g, o, b, tail);
		helmet(g, hx, hy + b, o);
	}
	const FOUR = { body: [0, -17, 17, 8.4, 0], head: [19, -29], feet: [[12, 0], [15, 0], [-12, 0], [-9, 0]] };
	const gait = (f, amp, lift, phases) => FOUR.feet.map((p, i) => {
		const a = f / 6 * TAU + phases[i];
		return [p[0] + sin(a) * amp, -max(0, cos(a)) * lift];
	});
	const PAW_UP = [[22, -22], [25, -18], [22, -22], [19, -20]], PAW_DIG = [[16, 0], [20, -5], [16, -1], [12, 0]];
	const POSE = {
		idle: f => ({ ...FOUR, bob: f === 1 || f === 2 ? .6 : 0, tail: [0, 1, 2, 1][f], blink: f === 3 }),
		look: f => ({ ...POSE.idle(1), tail: f, lx: [-1, 0, 1, 0][f], ly: [0, 0, 0, -1][f] }),
		walk: f => ({ ...FOUR, bob: abs(cos(f / 6 * TAU)) * .7, tail: sin(f / 6 * TAU) * 2, feet: gait(f, 6, 3, [0, PI, PI, 0]) }),
		run: f => ({ ...FOUR, body: [0, -18, 18, 8, -.07 * sin(f / 6 * TAU)], bob: abs(cos(f / 6 * TAU)) * 1.8, tail: sin(f / 6 * TAU) * 3, feet: gait(f, 10, 5, [0, .5, PI, PI + .5]) }),
		sit: f => ({ body: [-3, -13, 10, 13, .35], head: [8, -30], tops: [[6, -14], [9, -14], [-8, -8], [-5, -8]], feet: [[8, 0], [11, 0], [-8, 0], [-5, 0]], tailAt: [-11, -5], bob: f === 2 ? .5 : 0, tail: [0, 1, 2, 1][f], blink: f === 3 }),
		sleep: f => ({ body: [-2, -8, 18, 8, 0], head: [15, -15], feet: [], tailAt: [-17, -6], expr: 'sleepy', bob: f * .5 }),
		mine: f => ({ ...FOUR, body: [0, -15, 17, 8, .18], head: [18, -22], tail: f, feet: [PAW_DIG[f], [15, 0], [-12, 0], [-9, 0]] }),
		wave: f => ({ ...FOUR, body: [0, -17, 17, 8.4, -.16], head: [18, -32], expr: 'happy', tail: f, feet: [PAW_UP[f], [15, 0], [-12, 0], [-9, 0]] }),
		jump: f => ({ ...FOUR, body: [0, -18, 17, 8, -.15], head: [20, -31], expr: 'happy', tail: 2, feet: [[18, -6 - f], [21, -5 - f], [-17, -6], [-14, -5]] })
	};
	const CAT_X = 56, CAT_Y = 90, catCache = new Map();
	function catSprite(c, f, lx, ly) {
		const k = `${theme}${c.coat}${c.pose}${f}|${lx}|${ly}|${c.expr}|${c.sz}`;
		let s = catCache.get(k);
		if (!s) {
			const o = POSE[c.pose](f);
			s = gsprite(116, 92, g => {
				g.translate(CAT_X, CAT_Y); g.scale(c.sz, c.sz);
				catRig(g, { ...o, coat: c.coat, lx: o.lx === undefined ? lx : o.lx, ly: o.ly === undefined ? ly : o.ly, expr: o.expr || (o.blink ? 'sleepy' : c.expr) });
			}, theme === 'light');
			catCache.set(k, s);
		}
		return s;
	}
	const BUBBLES = {
		bang: ['1', '1', '1', '1', '0', '1'],
		heart: ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'],
		zzz: ['11111', '00010', '00100', '01000', '11111']
	};

	/* ==================== ground ==================== */
	let GW, GH, PW, PH, HY, base, gbuf, groundImg, ents, cats, prints, motes, rings2, spots;
	const inkOn = v => v ? 2 : 3; // bright on the land, page ink on the open background
	function gplot(x, y) { // one art unit, in art coordinates
		x = round(x * A); y = round(y * A);
		for (let j = 0; j < A; j++) for (let i = 0; i < A; i++) {
			const xx = x + i, yy = y + j;
			if (xx >= 0 && yy >= 0 && xx < PW && yy < PH) { const n = yy * PW + xx; gbuf[n] = inkOn(gbuf[n]); }
		}
	}
	const gblit = (spr, x, y, rows) => blit(gbuf, PW, PH, spr, x * A, y * A, rows);
	function halo(cx, cy, R, k) { // a soft glow of stipple round an orb, in buffer pixels
		for (let y = max(0, floor(cy - R)); y <= min(PH - 1, ceil(cy + R)); y++) for (let x = max(0, floor(cx - R)); x <= min(PW - 1, ceil(cx + R)); x++) {
			const d = hypot(x - cx, y - cy) / R;
			if (d < 1 && gbuf[y * PW + x] < 2 && hash(x, y) < (1 - d) * (1 - d) * k) gbuf[y * PW + x] = 2;
		}
	}
	function drawOrbs(e, s, sx, sy, t, dt, off) { // glowing orbs: pulsing halos that follow the sway, shedding motes
		e.flare = max(0, e.flare - dt * 1.1);
		e.orbs.forEach((o, i) => {
			const pulse = sin(t * 1.7 + e.ph + i * 2.1), jx = off ? off(round(o.y * A)) : 0;
			halo((sx + o.x) * A + jx, (sy + o.y) * A, (o.r * 2.6 + 3 + pulse * 1.2 + e.flare * 5) * A, .5 + .12 * pulse + e.flare * .7);
		});
		if ((e.emit -= dt) < 0) {
			e.emit = rand(.5, 1.5);
			const o = e.orbs[floor(rand(0, e.orbs.length))];
			motes.push({ x: sx + o.x + rand(-o.r, o.r), y: sy + o.y - o.r, vx: rand(-3, 3), vy: rand(-9, -4), life: rand(1.4, 2.6) });
		}
	}
	const walkTop = () => HY + 20, clampX = x => clamp(x, 22, GW - 22), clampY = y => clamp(y, walkTop(), GH - 8);
	function buildTerrain() {
		const b = new Uint8Array(PW * PH), pHY = HY * A, ridge = (x, a, f, ph) => a * (.55 * sin(x * f + ph) + .3 * sin(x * f * 2.3 + ph * 2) + .16 * sin(x * f * 5.1 + ph * .5) + .07 * sin(x * f * 13 + ph)) + a * .6;
		const far = x => HY - 2 - ridge(x, GH * .09, .011, 1), near = x => HY + 1 - ridge(x, GH * .055, .021, 4.2);
		for (let x = 0; x < PW; x++) {
			const u = x / A, f = far(u) * A, n = near(u) * A, sf = far(u + 1) - far(u - 1), sn = near(u + 1) - near(u - 1);
			for (let y = max(0, floor(min(f, n))); y < pHY + 2 * A; y++) {
				let tone;
				if (y >= n) { const d = (y - n) / A; tone = d < .6 ? 1 : sn < 0 ? .3 * exp(-d / 4) : 0; }
				else { const d = (y - f) / A; tone = d < .5 ? .8 : sf < 0 ? .14 * exp(-d / 6) : 0; }
				b[y * PW + x] = tone > hash(x, y) ? 2 : 1;
			}
		}
		for (let y = pHY + 2 * A; y < PH; y++) {
			const v = y / A, p = (v - HY) / (GH - HY), band = v < HY + 4 ? .14 * (1 - (v - HY) / 4) : 0;
			for (let x = 0; x < PW; x++) {
				const spot = smooth(.54, .76, fbm(x / A * .022, v * .07, 4));
				b[y * PW + x] = band + .002 + p * .008 + spot * .035 > hash(x, y) ? 2 : 1;
			}
		}
		return b;
	}
	let craters = [];
	function bakeCrater(c) {
		for (let y = floor((c.y - c.r * .4) * A); y <= (c.y + c.r * .4) * A; y++) for (let x = floor((c.x - c.r * 1.3) * A); x <= (c.x + c.r * 1.3) * A; x++) {
			if (x < 0 || y < 0 || x >= PW || y >= PH) continue;
			const dx = (x / A - c.x) / c.r, dy = (y / A - c.y) / (c.r * .28), e = hypot(dx, dy), n = y * PW + x;
			if (e < .84) {
				let tone = .06;
				if (c.ridged && dy < 0 && e > .3) tone = .95 * (.5 + .5 * sin(atan2(dy, dx) * 22)) * smooth(.25, .8, e); // the far wall catches light in terraced ridges
				else if (dy > 0) tone = .2 * smooth(.84, .5, e) + .04;
				base[n] = tone > hash(x, y) ? 2 : 1;
			} else if (e < 1.14) base[n] = (1 - abs(e - .96) / .18) * (dy > 0 ? 1.1 : .6) > hash(x, y) ? 2 : 1;
			else if (c.ridged && e < 1.34 && dy < 0) base[n] = .2 * (1 - (e - 1.14) / .2) > hash(x, y) ? 2 : 1; // raised outer lip
		}
	}
	function buildGround() {
		const wide = document.documentElement.clientWidth >= 700;
		GH = floor((wide ? clamp(innerHeight * .34, 240, 300) : 240) / scale);
		GW = ceil(document.documentElement.clientWidth / scale);
		HY = round(GH * .5);
		PW = GW * A; PH = GH * A;
		groundImg = frameFor(groundEl, groundCtx, PW, PH, skyScale);
		gbuf = new Uint8Array(PW * PH);
		base = buildTerrain();
		ents = []; prints = []; motes = []; rings2 = [];
		const u = wide ? min(1, GW / 700) : .72, DW = wide ? min(GW, 700) : GW, OX = floor((GW - DW) / 2);
		const fy = k => HY + (GH - HY) * k, add = e => { ents.push(e); return e; };
		// the scene is composed for one fixed width in the middle; the space either side repeats it, mirrored and jittered
		const blocks = [{ ox: OX, main: true }];
		for (let k = 1, ox = OX - DW; ox + DW > 24; k++, ox -= DW) blocks.push({ ox, flip: k % 2 === 1, R: rng(100 + k) });
		for (let k = 1, ox = OX + DW; ox < GW - 24; k++, ox += DW) blocks.push({ ox, flip: k % 2 === 1, R: rng(200 + k) });
		const at = (B, fx) => B.ox + DW * (B.flip ? 1 - fx : fx) + (B.main ? 0 : (B.R() - .5) * DW * .06), ok = (B, x) => B.main || (x > 24 && x < GW - 24);
		const main = blocks[0];

		craters = [];
		blocks.forEach(B => (wide ? [[.38, .86, 32, 1], [.72, .74, 20, 0], [.6, .46, 13, 0], [.17, .72, 11, 0]] : [[.5, .88, 24, 1], [.2, .62, 10, 0]]).forEach(c => {
			const x = at(B, c[0]); if (ok(B, x) && (B.main || !c[3])) craters.push({ x, y: GH * c[1], r: c[2], ridged: !!c[3] });
		}));
		craters.forEach(bakeCrater);
		blocks.forEach((B, bi) => (wide ? [[.04, .84, 22, 8], [.15, .93, 14, 6], [.34, .62, 18, 7], [.45, .94, 11, 5], [.5, .34, 15, 6], [.56, .7, 24, 8], [.66, .92, 16, 6], [.83, .8, 26, 8], [.86, .56, 14, 5]] : [[.06, .9, 16, 6], [.36, .6, 14, 6], [.62, .9, 18, 7]])
			.forEach((c, i) => { const x = at(B, c[0]); if (ok(B, x)) blit(base, PW, PH, makeSlab(round(c[2] * u), round(c[3] * u), i * 1.7 + 1 + bi * 3), (x - c[2] * u / 2) * A, (HY + (GH - HY) * c[1] - c[3] * u) * A); }));

		let B = main, sd = 0, crystalSpots;
		const put = (type, spr, fx, y, more) => { const x = at(B, fx); return ok(B, x) ? add({ type, spr, x, y, shake: 0, hov: 0, bend: 0, ph: rng(sd + ents.length)() * TAU, ...more }) : null; };

		// the foreground mound frames a corner; cats pass behind it
		const rockW = wide ? 104 : 78, rockY = fy(.66), rockH = wide ? 48 : 38, rock = makeMound(rockW, rockH, 3.3, 3), rockX = at(main, wide ? .62 : .66);
		(wide ? [[.98, 190, 58, 7.7]] : [[1, 130, 40, 7.7]])
			.forEach(c => add({ type: 'mound', spr: makeMound(c[1], c[2], c[3], c[1] > 110 ? 5 : 2), x: at(main, c[0]), y: GH + 400, feet: GH + 2, clickless: true }));
		add({ type: 'mound', spr: rock, x: rockX, y: rockY, clickless: true });

		const framesOf = (w, h, n, art) => Array.from({ length: n }, (_, f) => gsprite(w, h, g => art(g, f)));
		blocks.forEach((b, bi) => {
			B = b; sd = bi * 9;
			const glow = (fx, k, w, h, seed, n, trunk) => { const spr = glowPlant(round(w * u), round(h * u), seed + sd, n, trunk); put('plant', spr, fx, fy(k), { orbs: spr.orbs, flare: 0, emit: rand(0, 1) }); };
			const small = (kind, fx, k, w, h, seed) => put('plant', kind(round(w * u), round(h * u), seed + sd), fx, fy(k));
			// foliage thins out towards the front and sits mostly in the back rows, smaller with distance, so the open ground stays clear for the cats
			if (wide) {
				glow(.45, .2, 40, 52, 21, 3, true); glow(.77, .13, 32, 40, 23, 2, true); glow(.12, .86, 28, 30, 22, 2);
				small(cupPlant, .9, .36, 28, 40, 25); small(cupPlant, .17, .3, 24, 34, 26);
				[[.07, .12, 20, 15], [.22, .08, 18, 14], [.5, .1, 20, 15], [.63, .2, 22, 16], [.93, .14, 20, 15], [.46, .5, 24, 18]].forEach((m, i) => small(shrooms, m[0], m[1], m[2], m[3], 30 + i));
			} else {
				glow(.4, .2, 36, 46, 21, 3, true); glow(.12, .84, 26, 28, 22, 2);
				small(cupPlant, .86, .4, 26, 38, 25);
				[[.08, .12, 18, 14], [.62, .1, 20, 15], [.78, .62, 22, 16]].forEach((m, i) => small(shrooms, m[0], m[1], m[2], m[3], 30 + i));
			}
			const cs = (wide ? [[.28, .9, 40], [.05, .76, 32], [.5, .66, 30], [.7, .94, 34], [.86, .54, 28], [.97, .72, 24]] : [[.3, .9, 34], [.1, .62, 28], [.62, .62, 28]])
				.map(c => ({ fx: c[0], y: fy(c[1]), size: round(c[2] * u) }));
			cs.forEach((c, i) => put('crystal', crystals(c.size, c.size, i + 3 + sd), c.fx, c.y));
			if (b.main) crystalSpots = cs;
		});
		B = main;
		put('beacon', null, wide ? .31 : .34, fy(.3), { frames: framesOf(16, 42, 2, beaconArt), orbs: [{ x: 8, y: 6, r: 3.4 }], flare: 0, emit: 0 });
		spots = {
			rock: { x: rockX, y: rockY + 1, z: rockH - 5, down: { x: rockX - rockW * .62, y: rockY + 9 }, by: null, face: 1 },
			crystal: { x: at(main, crystalSpots[0].fx) + crystalSpots[0].size * .7, y: crystalSpots[0].y - 2, by: null, face: -1, pose: 'mine', dur: 8 }
		};
		cats = [0, 1, 2].map(i => ({
			id: i, coat: i, x: at(main, [.32, .62, .72][i]), y: clampY(fy([.72, .7, .8][i])), z: 0, dir: i === 2 ? -1 : 1, pose: i === 2 ? 'look' : 'idle', expr: 'neutral', sz: 1,
			go: null, after: null, until: 1 + i * 2, spot: null, follow: false, forced: false, run: false, hop: null, dist: 0, step: 0, lx: 0, ly: 0, bubble: null, nextZ: 0
		}));
		const c = cats[1], s = spots.rock;
		c.x = s.x; c.y = s.y; c.z = s.z; c.spot = s; s.by = c; c.pose = 'sit'; c.until = 9;
		ents.sort((a, b) => a.y - b.y);
	}
	const release = c => { if (c.spot && c.spot.by === c) c.spot.by = null; c.spot = null; };
	function hopTo(c, x, y, z, then) { c.hop = { x0: c.x, y0: c.y, z0: c.z, x, y, z, k: 0, then }; if (abs(x - c.x) > 1) c.dir = x > c.x ? 1 : -1; }
	function climbDown(c, then) { const s = spots.rock; release(c); hopTo(c, s.down.x, s.down.y, 0, then); }
	function say(c, kind, t, dur) { c.bubble = { kind, until: t + (dur || 1.4) }; }
	function think(c, t) { // the cat's own life, when nobody is nearby
		if (c.z > 0) { climbDown(c, () => { c.until = t + .6; }); return; }
		const opts = ['wander', 'wander', 'look', 'sit', 'wave', 'nap'];
		if (!spots.rock.by) opts.push('rock', 'rock');
		if (!spots.crystal.by) opts.push('crystal', 'crystal');
		const pick = opts[floor(rand(0, opts.length))];
		release(c); c.after = null; c.expr = 'neutral';
		if (pick === 'wander') c.go = { x: clampX(rand(0, GW)), y: clampY(rand(walkTop(), GH)) };
		else if (pick === 'look') { c.pose = 'look'; c.until = t + rand(3, 6); }
		else if (pick === 'sit') { c.pose = 'sit'; c.until = t + rand(3, 7); }
		else if (pick === 'wave') { c.pose = 'wave'; c.until = t + 3; }
		else if (pick === 'nap') { c.pose = 'sleep'; c.until = t + rand(7, 14); }
		else {
			const s = spots[pick]; s.by = c; c.spot = s;
			c.go = pick === 'rock' ? { x: s.down.x, y: s.down.y } : { x: s.x, y: s.y };
			c.after = pick === 'rock' ? { hop: s } : { pose: s.pose, dur: s.dur + rand(0, 4), dir: s.face };
		}
	}
	function walk(c, x, y, spd, dt, pose) {
		const dx = x - c.x, dy = y - c.y, d = hypot(dx, dy);
		if (d < spd * dt + 1) return true;
		let vx = dx / d * spd, vy = dy / d * spd;
		for (const o of cats) if (o !== c && !o.z) { // keep a polite gap
			const ax = c.x - o.x, ay = (c.y - o.y) * 1.6, q = hypot(ax, ay);
			if (q < 26 && q > .01) vx += ax / q * (26 - q) * .7;
		}
		c.x = clampX(c.x + vx * dt); c.y = clampY(c.y + vy * dt);
		if (abs(vx) > 1.2) c.dir = vx > 0 ? 1 : -1;
		const moved = hypot(vx, vy) * dt;
		c.dist += moved; c.step += moved; c.pose = pose;
		if (c.step > 12) {
			c.step = 0;
			prints.push({ x: c.x + (prints.length % 2 ? 3 : -3), y: c.y + (prints.length % 2 ? 1 : -1), born: performance.now() / 1000 });
			if (prints.length > 60) prints.shift();
		}
		return false;
	}
	function stepCat(c, t, dt, pg) {
		if (c.hop) {
			const h = c.hop;
			h.k = min(1, h.k + dt * 1.9);
			c.x = lerp(h.x0, h.x, h.k); c.y = lerp(h.y0, h.y, h.k);
			c.z = lerp(h.z0, h.z, h.k) + sin(h.k * PI) * 18;
			c.pose = 'jump';
			if (h.k >= 1) { c.hop = null; c.z = h.z; c.pose = 'idle'; h.then(); }
			return;
		}
		const far = pg && pg.y < walkTop() - 4 && !pg.onThing; // a cursor up on the hills or in the text above: out of reach, so cats follow it sideways only and never wander to the back
		const m = pg ? (far ? abs(pg.x - c.x) : hypot(pg.x - c.x, (pg.y - (c.y - 25)) * 1.2)) : 1e9;
		if (pg && pg.in && m < 150 && !c.forced) { // follows from up to 150px beyond the ground canvas
			if (!c.follow) { c.follow = true; c.go = null; c.after = null; c.expr = 'neutral'; release(c); say(c, 'bang', t); }
			if (c.z > 0) { climbDown(c, () => {}); return; }
			const stop = 26 + c.id * 6, tx = clampX(pg.x + (c.id - 1) * 36), ty = far ? c.y : clampY(pg.y + (c.id % 2) * 8);
			if (hypot(tx - c.x, ty - c.y) > stop * .4 && m > stop) walk(c, tx, ty, m > 80 ? 42 : 24, dt, m > 80 ? 'run' : 'walk');
			else { c.pose = 'sit'; if (abs(pg.x - c.x) > 6) c.dir = pg.x > c.x ? 1 : -1; }
			return;
		}
		if (c.follow) { c.follow = false; c.pose = 'idle'; c.until = t + rand(.8, 2.4); }
		if (c.go) {
			if (walk(c, c.go.x, c.go.y, c.run ? 46 : 16, dt, c.run ? 'run' : 'walk')) {
				c.go = null; c.run = false;
				const a = c.after;
				if (a && a.hop) { const s = a.hop; hopTo(c, s.x, s.y, s.z, () => { c.dir = s.face; c.pose = 'sit'; c.until = t + rand(9, 17); }); }
				else if (a) { c.pose = a.pose; c.dir = a.dir; c.until = t + a.dur; }
				else { c.pose = c.forced ? 'wave' : 'idle'; c.forced = false; c.until = t + rand(1.5, 3.5); }
			}
		} else if (t > c.until) think(c, t);
		if (c.pose === 'sleep' && t > c.nextZ) { c.nextZ = t + 2.4; say(c, 'zzz', t, 1.6); }
		if (c.pose === 'mine' && floor(t * 5) % 4 === 2 && Math.random() < .3) motes.push({ x: c.x + c.dir * 17, y: c.y - 6, vx: -c.dir * rand(5, 20), vy: rand(-26, -10), g: 60, life: .6 });
	}
	function catFrame(c, t) {
		switch (c.pose) {
			case 'walk': case 'run': return floor(c.dist / (c.pose === 'run' ? 4 : 3)) % 6;
			case 'mine': return floor(t * 5) % 4;
			case 'wave': return floor(t * 6) % 4;
			case 'jump': return 1;
			case 'sleep': return floor(t * .8) % 2;
			default: return floor(t * 1.2 + c.id * 3) % 4;
		}
	}
	function entFrame(e, t) {
		if (!e.frames) return e.spr;
		const n = e.frames.length;
		if (e.type === 'beacon') return e.frames[floor(t * (e.pulse > 0 ? 8 : 1.4)) % n];
		return e.frames[0];
	}
	const entSprite = e => e.cur || e.spr || e.frames[0];
	function spores(x, y, n) { for (let i = 0; i < n; i++) motes.push({ x: x + rand(-14, 14), y: y + rand(-4, 4), vx: rand(-8, 8), vy: rand(-8, 3), g: 14, life: rand(.8, 1.8) }); }
	function dust(x, y, n) { for (let i = 0; i < n; i++) motes.push({ x, y, vx: rand(-32, 32), vy: rand(-22, -4), g: 44, life: rand(.3, .7) }); }
	function groundHit(x, y) {
		for (let i = cats.length - 1; i >= 0; i--) { const c = cats[i]; if (abs(x - c.x) < 22 + PAD && y > c.y - c.z - 36 && y < c.y - c.z + 2 + PAD) return { cat: c }; }
		for (let i = ents.length - 1; i >= 0; i--) {
			const e = ents[i];
			if (e.clickless) continue;
			const s = entSprite(e), ox = e.x - s.uw / 2, oy = e.y - s.uh;
			if (touches(s, round((x - ox) * A), round((y - oy) * A), PAD * A)) return { ent: e };
		}
		for (const c of craters) if (hypot((x - c.x) / c.r, (y - c.y) / (c.r * .34)) < 1.1) return { crater: c };
		return null;
	}
	function sendCat(x, y, t) {
		let best = null, bd = 1e9;
		for (const c of cats) { const d = hypot(c.x - x, c.y - y); if (d < bd && !c.hop) { bd = d; best = c; } }
		if (!best) return;
		const c = best, go = () => { c.go = { x, y }; c.run = true; c.forced = true; c.after = null; c.expr = 'neutral'; };
		say(c, 'bang', t, 1);
		if (c.z > 0) climbDown(c, go); else { release(c); go(); }
	}
	function clickGround(x, y, t) {
		const h = groundHit(x, y);
		if (h && h.cat) {
			const c = h.cat;
			say(c, 'heart', t, 1.8);
			sound.meow();
			hopTo(c, c.x, c.y, c.z, () => { c.pose = c.z ? 'sit' : 'wave'; c.expr = 'happy'; c.until = t + 2.4; });
			return;
		}
		if (h && h.crater) { // a crater thuds, ripples, and the nearest cat comes to look
			const c = h.crater;
			rings2.push({ x: c.x, y: c.y, r: 2, v: 26, life: 1 }, { x: c.x, y: c.y, r: -6, v: 26, life: 1.2 });
			sound.thud(); dust(x, y, 8); if (canHover) sendCat(clampX(x), clampY(y), t); // cats only answer a mouse click
			return;
		}
		if (h) {
			const e = h.ent, top = e.y - entSprite(e).uh;
			if (e.type === 'plant' && e.orbs) { e.flare = 1.4; sound.sparkle(floor(rand(0, 8))); e.orbs.forEach(o => { for (let i = 0; i < 6; i++) motes.push({ x: e.x - entSprite(e).uw / 2 + o.x + rand(-3, 3), y: top + o.y, vx: rand(-10, 10), vy: rand(-24, -8), life: rand(.7, 1.5) }); });}
			else if (e.type === 'plant') { spores(e.x, top + 4, 7); sound.pop(); }
			else if (e.type === 'crystal') { sound.sparkle(floor(rand(0, 8))); for (let i = 0; i < 14; i++) motes.push({ x: e.x + rand(-16, 16), y: e.y - rand(4, e.spr.uh * .9), vx: rand(-14, 14), vy: rand(-30, -6), life: rand(.4, .9) }); }
			else if (e.type === 'beacon') { sound.blipUp(); e.pulse = 1.6; e.flare = 1.4; rings2.push({ x: e.x, y: e.y - 36, r: 2, v: 70, life: .8 }); }
			return;
		}
		if (y > HY) { sound.puff(); dust(x, y, 10); if (canHover) sendCat(clampX(x), clampY(y), t); } // on a touch screen a tap only puffs dust
	}
	function drawGround(t, dt) {
		const r = groundEl.getBoundingClientRect();
		if (r.top > innerHeight) { return; }
		gbuf.set(base);
		const pg = ptr ? { x: (ptr.x - r.left) / scale, y: (ptr.y - r.top) / scale, in: ptr.y > r.top - 150 && ptr.y < r.bottom + 150 && ptr.x >= 0 } : null;
		const inside = pg && pg.y >= 0 && pg.y < GH && pg.x < GW;
		const hit = inside ? groundHit(pg.x, pg.y) : null;
		if (pg) pg.onThing = !!hit; // hovering anything clickable keeps the cats following
		const now = performance.now() / 1000;
		for (let i = prints.length - 1; i >= 0; i--) { // paw prints slowly fill back in
			const p = prints[i], age = (now - p.born) / 20;
			if (age > 1) { prints.splice(i, 1); continue; }
			const px = round(p.x), py = round(p.y);
			[[0, 0], [1, 0], [-1, -1], [0, -2], [2, -1], [1, -2]].forEach(o => { if (hash(px + o[0], py + o[1]) > age) gplot(px + o[0], py + o[1]); });
		}
		const list = ents.slice();
		for (const c of cats) {
			stepCat(c, t, dt, pg);
			c.sz = round((.58 + clamp((c.y - HY) / (GH - HY), 0, 1) * .16) * 20) / 20;
			if (pg) {
				c.lx = clamp(round((pg.x - c.x) * c.dir / 60), -1, 1);
				c.ly = clamp(round((pg.y - (c.y - 42)) / 70), -1, 1);
			} else { c.lx = 0; c.ly = 0; }
			list.push({ cat: c, y: c.y + .1 });
		}
		list.sort((a, b) => a.y - b.y);
		for (const e of list) {
			if (e.cat) {
				const c = e.cat, lookable = c.pose === 'sit' || c.pose === 'idle', s = catSprite(c, catFrame(c, t), lookable ? c.lx : 0, lookable ? c.ly : 0), spr = c.dir > 0 ? s : flipped(s);
				const ax = c.dir > 0 ? CAT_X : s.uw - CAT_X, sx = c.x - ax, sy = c.y - c.z - CAT_Y;
				gblit(spr, sx, sy);
				continue;
			}
			e.cur = entFrame(e, t);
			if (e.type === 'mound') { gblit(e.spr, e.x - e.spr.uw / 2, (e.feet === undefined ? e.y : e.feet) - e.spr.uh); continue; }
			if (e.pulse > 0) e.pulse -= dt;
			e.shake = max(0, e.shake - dt * .8);
			const s = e.cur, sx = e.x - s.uw / 2, sy = e.y - s.uh;
			let offFn = null;
			if (e.type === 'plant') {
				const dx = pg ? pg.x - e.x : 0, dy = pg ? pg.y - (e.y - s.uh * .5) : 0, reach = 26 + s.uw * .55;
				const near = pg && pg.in ? max(0, 1 - hypot(dx, dy * .75) / reach) : 0;
				e.hov = lerp(e.hov, near, near > e.hov ? .05 : .018);
				e.bend = lerp(e.bend, near * (dx > 0 ? -1 : 1) * min(6, s.uh * .1), .035);
				const k = e.stiff || 1, amp = (.35 + e.hov * 2.4) * k, h = s.h, ph = e.ph, bend = e.bend * k, shake = e.shake * 5;
				offFn = j => {
					const q = (h - 1 - j) / h;
					return round((sin(t * .75 + ph + j * .03 / A) * amp + bend + sin(t * 34) * shake) * q * q * A);
				};
				gblit(s, sx, sy, offFn);
			} else {
				gblit(s, sx, sy);
				if (e.type === 'crystal') { // the occasional glint off a facet, or wherever the cursor passes
					const near = pg && pg.in && hypot(pg.x - e.x, pg.y - (e.y - s.uh / 2)) < 50, on = (t * (near ? 3 : .9) % 1) < .4, k = floor(t * (near ? 3 : .9)) % 4;
					if (on) { const gx = e.x + [-1, -12, 12, 4][k] * s.uw / 64, gy = e.y - s.uh * [.9, .4, .46, .7][k]; for (let i = -3; i <= 3; i++) { gplot(gx + i, gy); gplot(gx, gy + i); } }
				}
			}
			if (e.orbs) drawOrbs(e, s, sx, sy, t, dt, offFn);
		}
		for (const c of cats) if (c.bubble) {
			if (t > c.bubble.until) { c.bubble = null; continue; }
			const b = BUBBLES[c.bubble.kind], x = round(c.x + c.dir * 17 - b[0].length / 2), y = round(c.y - c.z - (c.pose === 'sleep' ? 36 : 54) * c.sz - (c.bubble.until - t) * (c.bubble.kind === 'zzz' ? 4 : 0));
			b.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') gplot(x + i, y + j); });
		}
		for (let i = motes.length - 1; i >= 0; i--) {
			const m = motes[i];
			if ((m.life -= dt) <= 0) { motes.splice(i, 1); continue; }
			m.vy += (m.g || 0) * dt; m.x += m.vx * dt; m.y += m.vy * dt;
			gplot(m.x, m.y);
		}
		for (let i = rings2.length - 1; i >= 0; i--) {
			const w = rings2[i];
			if ((w.life -= dt) <= 0) { rings2.splice(i, 1); continue; }
			w.r += w.v * dt;
			if (w.r > 0) for (let a = 0, n = ceil(w.r * 4); a < n; a++) if (a % 3) gplot(w.x + cos(a / n * TAU) * w.r, w.y + sin(a / n * TAU) * w.r * .7);
		}
		const key = hit ? hit.cat || hit.ent || hit.crater : null;
		groundEl.style.cursor = !canHover ? '' : hit || (inside && pg.y > HY) ? 'pointer' : 'default';

		paint(groundCtx, groundImg, gbuf, PW, 'ground');
	}

	/* ==================== loop ==================== */
	const canvasPoint = (el, e, sc) => { const r = el.getBoundingClientRect(); return [(e.clientX - r.left) / sc, (e.clientY - r.top) / sc]; };
	$(skyEl).on('click', e => clickSky(...canvasPoint(skyEl, e, skyScale), e.clientX, e.clientY));
	$(groundEl).on('click', e => clickGround(...canvasPoint(groundEl, e, scale), performance.now() / 1000));

	function setup() {
		const w = document.documentElement.clientWidth;
		skyScale = 1; A = w < 700 ? 1 : 2; scale = A * skyScale; // sky and ground share one dot size
		setupSky(); buildGround();
		$('canvas').attr('data-ready', '');
	}
	let last = 0, timer, width = 0;
	const step = 33;
	function frame(ts) {
		requestAnimationFrame(frame);
		if (ts - last < step) return;
		const dt = min(.1, (ts - last) / 1000); last = ts;
		drawSky(ts / 1000, dt); drawGround(ts / 1000, dt);
		if (oldLut && performance.now() - fadeAt > FADE_MS) oldLut = null;
	}
	setup(); width = document.documentElement.clientWidth;
	requestAnimationFrame(frame);
	$(window).on('resize', () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (document.documentElement.clientWidth === width) return; // ignore mobile URL-bar height changes
			width = document.documentElement.clientWidth; setup();
		}, 180);
	});
});
