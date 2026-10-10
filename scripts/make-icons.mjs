// Generates the app icons (an origami bird on warm paper) with sharp.
import sharp from 'sharp';
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><radialGradient id="bg" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#3a2a20"/><stop offset="1" stop-color="#1c1612"/></radialGradient></defs>
  <rect width="512" height="512" rx="110" fill="url(#bg)"/>
  <polygon points="256,96 400,300 256,262" fill="#f2b84b"/>
  <polygon points="256,96 112,300 256,262" fill="#e39a2e"/>
  <polygon points="256,262 400,300 256,420" fill="#c8344a"/>
  <polygon points="256,262 112,300 256,420" fill="#a8293c"/>
  <polygon points="400,300 470,210 420,320" fill="#f2b84b"/>
  <circle cx="226" cy="318" r="13" fill="#231a17"/><circle cx="286" cy="318" r="13" fill="#231a17"/>
  <circle cx="222" cy="313" r="4.5" fill="#fff"/><circle cx="282" cy="313" r="4.5" fill="#fff"/>
</svg>`;
for (const s of [192, 512]) await sharp(Buffer.from(svg(s))).png().toFile(`public/icons/icon-${s}.png`);
console.log('icons ok');
