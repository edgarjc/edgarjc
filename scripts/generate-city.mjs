// Draws a skyline of the past year of GitHub contributions to city.svg.
// Usage: node scripts/generate-city.mjs [--sample]
//   GH_TOKEN  token for the GitHub GraphQL API (needs read:user to include private work)
//   GH_LOGIN  profile to draw (default: edgarjc)
import { writeFileSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'edgarjc';
const OUT = new URL('../city.svg', import.meta.url);
const W = 53, D = 7;

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar { weeks { contributionDays { contributionCount weekday } } }
    }
  }
}`;

// Returns a flat array indexed by week * 7 + weekday.
async function fetchContributions() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks.slice(-W);
  const data = new Array(W * D).fill(0);
  weeks.forEach((week, w) => {
    for (const day of week.contributionDays) data[w * D + day.weekday] = day.contributionCount;
  });
  return data;
}

// Fake data so the look can be checked offline.
function sampleContributions() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const data = [];
  for (let w = 0; w < W; w++) {
    const burst = 0.3 + 0.7 * Math.abs(Math.sin(w / 5));
    for (let d = 0; d < D; d++) {
      const weekend = d === 0 || d === 6 ? 0.4 : 1;
      data.push(rnd() < 0.2 ? 0 : Math.round(rnd() * 14 * burst * weekend));
    }
  }
  return data;
}

function renderCity(data) {
  // Scale to the 95th percentile so one huge day doesn't flatten everything else.
  const nonZero = data.filter((v) => v > 0).sort((a, b) => a - b);
  const max = nonZero.length ? Math.max(1, nonZero[Math.floor(nonZero.length * 0.95)] ?? nonZero.at(-1)) : 1;

  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const palette = [
    ['#1b2d24', '#142119', '#0f1a14'],
    ['#0e6b34', '#0a5128', '#073d1e'],
    ['#26a641', '#1d8333', '#15622a'],
    ['#39d353', '#2ba842', '#1f7f33'],
    ['#7ee787', '#4fc460', '#35a047'],
  ];
  const TW = 14, TH = 9, SH = 6, MAXH = 90;
  const P = (x, y, z) => [x * TW - y * SH, y * TH - z];
  const fx = (n) => n.toFixed(1);
  const poly = (arr, fill) => `<polygon points="${arr.map((p) => `${fx(p[0])},${fx(p[1])}`).join(' ')}" fill="${fill}"/>`;

  let out = '';
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const grow = (p) => {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  };

  // One box: front wall, side wall, roof, plus a grid of windows on the front.
  function box(x0, x1, y0, y1, z0, z1, c, windows) {
    const top = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
    const front = [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)];
    const side = [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)];
    [...top, ...front, ...side].forEach(grow);
    out += poly(front, c[1]) + poly(side, c[2]) + poly(top, c[0]);
    const e = [P(x0, y1, z1), P(x1, y1, z1)];
    out += `<line x1="${fx(e[0][0])}" y1="${fx(e[0][1])}" x2="${fx(e[1][0])}" y2="${fx(e[1][1])}" stroke="#d2ffd9" stroke-opacity=".5" stroke-width=".8"/>`;
    if (!windows) return;
    const cols = x1 - x0 > 0.55 ? 3 : 2;
    const cw = (x1 - x0) / (cols * 2 + 1);
    for (let z = z0 + 6; z < z1 - 4; z += 7) {
      for (let k = 0; k < cols; k++) {
        const wx0 = x0 + cw * (1 + k * 2), wx1 = wx0 + cw;
        const a = P(wx0, y1, z + 3), b = P(wx1, y1, z), r = rnd();
        const fill = r < 0.62 ? '#d2ffd9' : r < 0.74 ? '#ffd866' : '#0a2415';
        out += `<rect x="${fx(a[0])}" y="${fx(a[1])}" width="${fx(b[0] - a[0])}" height="${fx(b[1] - a[1])}" fill="${fill}" fill-opacity=".8"/>`;
      }
    }
  }

  for (let d = 0; d < D; d++) {            // far row first so near buildings cover far ones
    for (let w = 0; w < W; w++) {
      const v = data[w * D + d];
      const f = Math.min(1, v / max);
      const level = v === 0 ? 0 : Math.min(4, 1 + Math.floor(f * 4));
      const pad = 0.32 - 0.28 * f;         // more commits => wider building
      const x0 = w + pad, x1 = w + 1 - pad, y0 = d + pad, y1 = d + 1 - pad;
      const h = v === 0 ? 1 : 6 + Math.pow(f, 0.85) * MAXH;
      const c = palette[level];
      const kind = (w * 7 + d * 3) % 4;    // varies silhouettes between neighbours

      if (level <= 1) { box(x0, x1, y0, y1, 0, h, c, false); continue; }

      if (level >= 3 && kind !== 0) {      // setback tower
        const base = h * 0.62, inX = (x1 - x0) * 0.2, inY = (y1 - y0) * 0.2;
        box(x0, x1, y0, y1, 0, base, c, true);
        box(x0 + inX, x1 - inX, y0 + inY, y1 - inY, base, h, c, true);
      } else {
        box(x0, x1, y0, y1, 0, h, c, h > 20);
      }

      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      if (level === 4 && f > 0.8) {        // spire with a beacon
        const a = P(mx, my, h), b = P(mx, my, h + 14);
        out += `<line x1="${fx(a[0])}" y1="${fx(a[1])}" x2="${fx(b[0])}" y2="${fx(b[1])}" stroke="#7ee787" stroke-width="1.6"/><circle cx="${fx(b[0])}" cy="${fx(b[1])}" r="1.4" fill="#ff7b72"/>`;
        grow(b);
      } else if (level >= 2 && kind === 0) {
        box(mx - 0.12, mx + 0.12, my - 0.12, my + 0.12, h, h + 3.5, c, false);
      }
    }
  }

  const pad = 12;
  const vx = minX - pad, vy = minY - pad, vw = maxX - minX + pad * 2, vh = maxY - minY + pad * 2;
  // The dark backdrop keeps it readable on GitHub's light and dark themes.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fx(vx)} ${fx(vy)} ${fx(vw)} ${fx(vh)}" role="img" aria-label="City skyline of my commits over the past year"><rect x="${fx(vx)}" y="${fx(vy)}" width="${fx(vw)}" height="${fx(vh)}" rx="10" fill="#0d1117"/>${out}</svg>\n`;
}

async function main() {
  const sample = process.argv.includes('--sample');
  if (!sample && !process.env.GH_TOKEN) throw new Error('GH_TOKEN is not set (or pass --sample)');
  const data = sample ? sampleContributions() : await fetchContributions();
  writeFileSync(OUT, renderCity(data));
  console.log(`city.svg written (${sample ? 'sample' : 'live'} data, ${data.reduce((a, b) => a + b, 0)} contributions)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
