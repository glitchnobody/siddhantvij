// Numbers every block that blurs in on load, in reading order, so they arrive top to bottom 35ms apart.
// The animation itself lives under "Blur-in" in global.css. Blocks further down the page share the last slot.
const blocks = document.querySelectorAll('.masthead > *, .about > p, .group h2, .group h3, .group .row, .setup .sub li, .not-found > *, .contact-fab');
blocks.forEach((block, i) => block.style.setProperty('--i', Math.min(i, 24)));
