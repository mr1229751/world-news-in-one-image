// Friday 20 November 2026 — World Dispatch.
// Usage: node news-poster.mjs [entry.png] [--audit]
// Based on v1's 5x7 proportional font, RGB rasteriser and filter-0 PNG encoder.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 1024, H = 1024;
const img = { data: new Uint8Array(W * H * 3) };
const CREAM = [246, 240, 226];
const PAPER = [253, 248, 236];
const BEIGE = [234, 224, 204];
const INK = [30, 25, 22];
const RED = [165, 35, 33];
const DGREY = [66, 54, 46];
const RULE = [188, 171, 148];
const TINT = [222, 187, 169];

// Layout tree: disjoint siblings, contained descendants, and no clipped paint.
// Rectangles are half-open. Text, rules and art get their own reservations.
const page = { x: 0, y: 0, w: W, h: H, name: 'page', children: [] };
let active = page;
const TEXT_LOG = [];
let boxCount = 0;
function contains(a, b) {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function part(name, x, y, w, h, draw) {
  const parent = active;
  const box = { x: parent.x + x, y: parent.y + y, w, h, name: `${parent.name}/${name}`, children: [] };
  assert([x, y, w, h].every(Number.isInteger) && w > 0 && h > 0 && contains(parent, box),
    `Outside ${parent.name}: ${name} (${x},${y} ${w}x${h})`);
  for (const other of parent.children) assert(!overlaps(other, box), `Overlap: ${box.name} and ${other.name}`);
  parent.children.push(box);
  boxCount++;
  active = box;
  try { draw(box); } finally { active = parent; }
}
function put(x, y, c) {
  if (x < active.x || x >= active.x + active.w || y < active.y || y >= active.y + active.h) {
    throw new Error(`Clipped paint in ${active.name} at ${x},${y}`);
  }
  const i = (y * W + x) * 3;
  img.data[i] = c[0];
  img.data[i + 1] = c[1];
  img.data[i + 2] = c[2];
}
function fillRect(x, y, w, h, c) {
  const paint = { x, y, w, h };
  assert([x, y, w, h].every(Number.isInteger) && w > 0 && h > 0 && contains(active, paint),
    `Clipped rectangle in ${active.name}: ${x},${y} ${w}x${h}`);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) put(xx, yy, c);
  }
}
function area(x, y, w, h, c) {
  fillRect(active.x + x, active.y + y, w, h, c);
}
function background(c) {
  assert.equal(active.children.length, 0, `Late background in ${active.name}`);
  area(0, 0, active.w, active.h, c);
}
function rule(name, x, y, w, h, c = RULE) {
  part(name, x, y, w, h, () => background(c));
}
function disc(cx, cy, r, c) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y < Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x < Math.ceil(cx + r); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2) put(x, y, c);
    }
  }
}
function arc(cx, cy, r, thickness, a0, a1, c) {
  const ro = r + thickness / 2, ri = r - thickness / 2;
  for (let y = Math.floor(cy - ro); y < Math.ceil(cy + ro); y++) {
    for (let x = Math.floor(cx - ro); x < Math.ceil(cx + ro); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      const angle = (Math.atan2(dy, dx) - a0 + 4 * Math.PI) % (2 * Math.PI);
      if (d2 >= ri * ri && d2 <= ro * ro && angle <= a1 - a0) put(x, y, c);
    }
  }
}
function thickLine(x0, y0, x1, y1, th, c) {
  const half = th / 2;
  const vx = x1 - x0, vy = y1 - y0, len2 = vx * vx + vy * vy || 1;
  for (let y = Math.floor(Math.min(y0, y1) - half); y < Math.ceil(Math.max(y0, y1) + half); y++) {
    for (let x = Math.floor(Math.min(x0, x1) - half); x < Math.ceil(Math.max(x0, x1) + half); x++) {
      const t = Math.min(1, Math.max(0, ((x + 0.5 - x0) * vx + (y + 0.5 - y0) * vy) / len2));
      if ((x + 0.5 - x0 - t * vx) ** 2 + (y + 0.5 - y0 - t * vy) ** 2 <= half * half) put(x, y, c);
    }
  }
}
function poly(pts, c) {
  const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
  for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
    const py = y + 0.5;
    for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
      const px = x + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < xi + ((py - yi) / (yj - yi)) * (xj - xi)) inside = !inside;
      }
      if (inside) put(x, y, c);
    }
  }
}

// The v1 capitals and figures, with a lowercase face for decks and briefs.
const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#..', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '####.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  a: ['.....', '.....', '.##..', '...#.', '.###.', '#..#.', '.###.'],
  b: ['#....', '#....', '###..', '#..#.', '#..#.', '#..#.', '###..'],
  c: ['.....', '.....', '.###.', '#....', '#....', '#....', '.###.'],
  d: ['...#.', '...#.', '.###.', '#..#.', '#..#.', '#..#.', '.###.'],
  e: ['.....', '.....', '.##..', '#..#.', '####.', '#....', '.###.'],
  f: ['..##.', '.#...', '###..', '.#...', '.#...', '.#...', '.#...'],
  g: ['.....', '.###.', '#..#.', '#..#.', '.###.', '...#.', '.##..'],
  h: ['#....', '#....', '###..', '#..#.', '#..#.', '#..#.', '#..#.'],
  i: ['.#...', '.....', '##...', '.#...', '.#...', '.#...', '###..'],
  j: ['..#..', '.....', '.##..', '..#..', '..#..', '#.#..', '.#...'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  l: ['##...', '.#...', '.#...', '.#...', '.#...', '.#...', '..#..'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#...#', '#...#'],
  n: ['.....', '.....', '###..', '#..#.', '#..#.', '#..#.', '#..#.'],
  o: ['.....', '.....', '.##..', '#..#.', '#..#.', '#..#.', '.##..'],
  p: ['.....', '###..', '#..#.', '#..#.', '###..', '#....', '#....'],
  q: ['.....', '.###.', '#..#.', '#..#.', '.###.', '...#.', '...#.'],
  r: ['.....', '.....', '#.##.', '##...', '#....', '#....', '#....'],
  s: ['.....', '.....', '.###.', '#....', '.##..', '...#.', '###..'],
  t: ['.#...', '.#...', '###..', '.#...', '.#...', '.#...', '..##.'],
  u: ['.....', '.....', '#..#.', '#..#.', '#..#.', '#..#.', '.###.'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#..#.', '#..#.', '.##..', '#..#.', '#..#.'],
  y: ['.....', '#..#.', '#..#.', '#..#.', '.###.', '...#.', '.##..'],
  z: ['.....', '.....', '####.', '...#.', '..#..', '.#...', '####.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '####.', '.....', '.....', '.....'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '%': ['#...#', '...#.', '..#..', '..#..', '.#...', '#...#', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
  ';': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.#...'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
};
const GLYPH_H = 7;
const METRICS = new Map(Object.entries(GLYPHS).map(([ch, rows]) => {
  assert(rows.length === GLYPH_H && rows.every(row => /^[.#]{5}$/.test(row)), `Bad glyph ${ch}`);
  const columns = Array.from({ length: 5 }, (_, col) => col).filter(col => rows.some(row => row[col] === '#'));
  return [ch, { rows, lead: columns[0], ink: columns.length ? columns.at(-1) - columns[0] + 1 : 0 }];
}));
function glyph(ch) {
  const m = METRICS.get(ch);
  assert(m, `Unsupported glyph ${JSON.stringify(ch)}`);
  return m;
}
function advance(ch, sx, tracking) {
  return (ch === ' ' ? 3 : glyph(ch).ink + 1) * sx + tracking;
}
function textWidth(text, sx, tracking = 0) {
  assert(text.length && text === text.trim(), `Empty or padded text in ${active.name}`);
  return [...text].reduce((w, ch) => w + advance(ch, sx, tracking), 0) - sx - tracking;
}
function line(name, x, y, maxWidth, text, {
  sx = 1, sy = sx, tracking = 0, color = INK, align = 'left',
} = {}) {
  assert([sx, sy, tracking, maxWidth].every(Number.isInteger) && sx >= 1 && sy >= 1 && tracking >= 0,
    `Invalid type metrics in ${active.name}/${name}`);
  const w = textWidth(text, sx, tracking), h = GLYPH_H * sy;
  assert(w <= maxWidth, `${active.name}/${name} exceeds width: ${w}/${maxWidth} "${text}"`);
  const left = (align === 'right' ? maxWidth - w : align === 'center' ? Math.floor((maxWidth - w) / 2) : 0);
  part(name, x, y, maxWidth, h, band => {
    part('ink', left, 0, w, h, box => {
      TEXT_LOG.push({ name: band.name, x: box.x, y: box.y, w, h, sx, sy, text });
      let cursor = box.x;
      for (const ch of text) {
        const { rows, lead } = glyph(ch);
        if (ch !== ' ') {
          for (let row = 0; row < GLYPH_H; row++) {
            for (let col = 0; col < 5; col++) {
              if (rows[row][col] === '#') fillRect(cursor + (col - lead) * sx, box.y + row * sy, sx, sy, color);
            }
          }
        }
        cursor += advance(ch, sx, tracking);
      }
    });
  });
}
function wrap(text, width, sx, tracking) {
  assert(text && text === text.trim() && !/\s{2,}/.test(text), `Bad paragraph: "${text}"`);
  const lines = [];
  let row = '';
  for (const word of text.split(' ')) {
    assert(textWidth(word, sx, tracking) <= width, `Unbreakable word: "${word}" in ${active.name}`);
    const next = row ? `${row} ${word}` : word;
    if (textWidth(next, sx, tracking) <= width) row = next;
    else { lines.push(row); row = word; }
  }
  lines.push(row);
  // Keep the minimum line count, but avoid leaving a year or lone word on
  // line two. Measure the complete candidate lines, including space advances.
  if (lines.length === 2) {
    const words = text.split(' ');
    let best = Infinity;
    for (let split = 1; split < words.length; split++) {
      const a = words.slice(0, split).join(' '), b = words.slice(split).join(' ');
      const aw = textWidth(a, sx, tracking), bw = textWidth(b, sx, tracking);
      // For equal fits prefer the wider first line.
      const cost = Math.abs(aw - bw) * 2 + Number(aw < bw);
      if (aw <= width && bw <= width && cost < best) {
        best = cost;
        lines[0] = a;
        lines[1] = b;
      }
    }
  }
  assert.equal(lines.join(' '), text);
  return lines;
}
function para(name, x, y, w, h, copy, step, style = {}) {
  part(name, x, y, w, h, () => {
    const sx = style.sx ?? 1, sy = style.sy ?? sx;
    const lines = typeof copy === 'string' ? wrap(copy, w, sx, style.tracking ?? 0) : copy;
    assert(lines.length && step > GLYPH_H * sy, `Insufficient leading in ${active.name}`);
    assert((lines.length - 1) * step + GLYPH_H * sy <= h,
      `Paragraph exceeds band in ${active.name}: ${lines.join(' | ')}`);
    lines.forEach((text, i) => line(`line ${i + 1}`, 0, i * step, w, text, style));
  });
}

// Editorial ledger. R = Raj Global Studies item number; Z = Zhudong text line.
// Region describes the primary subject, not necessarily the dateline (ICJ/IEA).
const REGIONS = ['Europe', 'Americas', 'Asia-Pacific', 'Mideast', 'Africa', 'Oceania', 'World'];
const [EU, AM, AP, ME, AF, OC, WW] = REGIONS;
const story = (id, region, place, section, head, deck, source) =>
  ({ id, region, place, section, head, deck, source });
const LEADS = [
  story('akvan', AP, 'Gopalpur', 'Weather', ['Akvan nears', 'Indian coast'],
    'Forecasters put landfall near Gopalpur by noon on 20 Nov, with gusts to 110 km/h.', 'R41-43'),
  story('trilateral', AP, 'Shenzhen', 'Diplomacy', ['Three powers', 'pledge talks'],
    'Trump, Xi and Putin pledge more talks on nuclear risks and energy flows. No Ukraine deal.', 'R1; Z24-25'),
  story('anthropic', AM, 'New York', 'Markets', ['Anthropic', 'jumps on debut'],
    'ANT opened at $111.50 from an $83 offer. Over 846m shares traded on its first day.', 'Z13-16'),
];
const SECONDARY = [
  story('berlin', EU, 'Berlin', 'Diplomacy', 'Europe gets a seat',
    'Leaders back a four-party format: Ukraine, Europe, the US and Russia.', 'R11; Z3-7'),
  story('ukraine-aid', EU, 'Brussels', 'Aid', 'EU proposes Kyiv aid',
    'The Commission seeks up to EUR 45bn for Ukraine in 2027.', 'R13'),
  story('rohingya', AP, 'Myanmar', 'Justice', 'ICJ rules on Rohingya',
    'Digest reports a genocide ruling over the 2017 military campaign.', 'Z28-30; single source'),
  story('iea', WW, 'Hormuz', 'Energy', 'IEA charts oil shock',
    'The IEA sees Hormuz oil flows at 8.5m barrels a day by 2030.', 'Z35-38'),
  story('iran-escalation', ME, 'Gulf', 'Security', 'US weighs Iran strikes',
    'Western officials see rising risk; Israel is pressing for joint action.', 'Z8-12'),
  story('crimea', EU, 'Crimea', 'Conflict', 'Crimean Bridge struck',
    'Rail traffic was paused after the attack; Putin ruled out ceasefire talks.', 'R16; Z18-22'),
  story('nvidia', AM, 'California', 'Tech', 'Nvidia faces subpoena',
    'Digest reports a state inquiry into chip exports and investor disclosures.', 'Z44-46; single source'),
  story('gta', WW, 'Global', 'Games', 'GTA VI draws crowds',
    'Nearly 6m watched streams at one point on launch day, 19 Nov.', 'Z63-66'),
  story('sco', AP, 'New Delhi', 'Culture', 'Delhi hosts SCO forum',
    'The first dialogue at Purana Qila is scheduled for 20-22 Nov.', 'R44'),
];
const WIRE = [
  story('apec', AP, 'Shenzhen', 'Trade', 'APEC adopts outlook',
    '21 economies call for open trade and action on online scams.', 'R29'),
  story('japan-china', AP, 'Shenzhen', 'Diplomacy', 'Japan seeks dialogue',
    'PM Takaichi urges more talks to ease tensions with China.', 'R32'),
  story('trade-truce', AP, 'Shenzhen', 'Trade', 'US-China truce in focus',
    'Trump and Xi meet; no new terms are disclosed.', 'R3; Z68-71'),
  story('phuket', AP, 'Phuket', 'Disaster', 'Fire inquiry continues',
    'Reports put the toll at 11 dead, with several injured.', 'R37'),
  story('poultry', AP, 'Bhopal', 'Health', 'Poultry vaccine due',
    "India plans to unveil its first homegrown H5N1 shot for chickens.", 'R45'),
  story('epfo', AP, 'India', 'Pensions', 'EPFO eases withdrawals',
    'The minimum provident fund balance falls from 25% to 10%.', 'R47'),
  story('cricket', OC, 'Wellington', 'Sport', 'Nicholls hits 113 not out',
    'New Zealand finish day one at 243/5 against India.', 'R49'),
  story('aus-settlers', OC, 'Australia', 'Sanctions', 'Australia targets settlers',
    'Sanctions hit settlers and groups over West Bank expansion.', 'R20'),
  story('zamfara', AF, 'Zamfara', 'Security', 'Police free 20 captives',
    'The abducted women and children were freed in northwest Nigeria.', 'R22'),
  story('sa-shootings', AF, 'South Africa', 'Crime', 'Police probe 17 deaths',
    'Two weekend shootings hit Pretoria and KwaZulu-Natal.', 'R23'),
  story('au-peace', AF, 'Sudan & Congo', 'Diplomacy', 'AU urges regional peace',
    'The bloc is pushing for solutions in Sudan and eastern Congo.', 'R25'),
  story('egypt-india', AF, 'Egypt', 'Trade', 'Egypt and India plan talks',
    'A working group will explore a trade deal spanning farms and tech.', 'R24'),
  story('eu-sanctions', EU, 'Brussels', 'Sanctions', 'EU adds Russia sanctions',
    '113 measures target nearly 50 banks and financial institutions.', 'R15'),
  story('front-line', EU, 'Ukraine', 'Conflict', 'Kyiv reports 211 clashes',
    'The fiercest fighting was around Pokrovsk and Kostiantynivka.', 'R17'),
  story('moscow', EU, 'Moscow', 'Diplomacy', 'Russia invites Europeans',
    'Putin says Moscow offered talks on a role in US-led negotiations.', 'R18'),
  story('gaza', ME, 'Central Gaza', 'Conflict', 'Main Gaza road reopens',
    'Israel says its operation beyond the Yellow Line has ended.', 'Z51-53'),
  story('iran-inspection', ME, 'Iran', 'Nuclear', 'Iran defers UN inspections',
    'Tehran says access to damaged sites must wait as conflict continues.', 'R38'),
  story('israel-deadlock', ME, 'Israel', 'Politics', 'Unity bid rebuffed',
    'Digest says Eisenkot rejected Netanyahu\'s call for a unity cabinet.', 'Z31-33; single source'),
  story('oil-rebound', WW, 'Hormuz', 'Markets', 'Brent rebounds to $93.62',
    'WTI hit $84.47 as traders weighed Gulf supply risks.', 'Z39-42'),
  story('voyager', AM, 'United States', 'Space', 'Voyager a light-day away',
    'NASA confirmed the milestone; science data are still not coming back.', 'Z59-62'),
  story('faa', AM, 'Washington', 'Aviation', 'FAA nears ground-stop cause',
    'The agency says findings are close but has yet to name a cause.', 'Z55-58; single source'),
  story('outages', AM, 'United States', 'Tech', 'US reviews wave of outages',
    'Tech and banking services hit; officials cite no sign of coordination.', 'R7; Z47-49'),
  story('investment', AM, 'United States', 'Business', 'Indian firms pledge $20.5bn',
    'A US diplomat calls this year\'s new investment plans a record.', 'R9'),
  story('mail-vote', AM, 'Washington', 'Law', 'Mail voting order in limbo',
    'The US top court temporarily let parts stand; legality is unresolved.', 'R10'),
];
const allStories = [...LEADS, ...SECONDARY, ...WIRE];
const tally = new Map(REGIONS.map(region => [region, 0]));
for (const field of ['id', 'head', 'deck']) {
  assert.equal(new Set(allStories.map(item => [item[field]].flat().join(' ').toLowerCase())).size,
    allStories.length, `Duplicate story ${field}`);
}
for (const item of allStories) {
  assert(tally.has(item.region) && item.place && item.section && item.source && item.head && item.deck,
    `Incomplete story: ${item.id}`);
  tally.set(item.region, tally.get(item.region) + 1);
}
const numbered = item => String(allStories.indexOf(item) + 1).padStart(2, '0');
const kicker = item => `${numbered(item)}  ${item.place.toUpperCase()} / ${item.section.toUpperCase()}`;

// Figures annotate the reporting; they are not counted as additional stories.
const STATS = [
  ['$97.17', ['Anthropic first close', '+17% on Nasdaq debut']],
  ['120,000', ['People evacuated', 'ahead of Cyclone Akvan']],
  ['EUR 45bn', ['EU aid proposed', 'for Ukraine in 2027']],
  ['2.8bn', ['Barrels of oil lost', 'to Mideast war (IEA)']],
  ['17.1m', ['GTA VI preorders', 'before launch (est.)']],
  ['$81.3bn', ['Raised by Anthropic', 'in record IPO']],
];

// Small, hand-drawn map in local schematic coordinates (no external assets).
const COASTS = [
  [[3,15],[11,10],[22,9],[25,5],[40,6],[49,9],[57,8],[63,12],[58,16],[53,16],[49,22],[45,24],[42,29],[37,31],[33,28],[31,30],[32,35],[39,39],[37,41],[31,38],[27,33],[23,27],[17,26],[12,20],[7,19]],
  [[48,5],[58,2],[70,4],[68,9],[64,13],[57,12],[54,8]],
  [[38,39],[43,38],[48,41],[53,41],[61,46],[59,51],[54,54],[51,60],[46,65],[42,63],[42,55],[39,50],[36,45]],
  [[76,19],[81,15],[86,15],[89,11],[94,9],[96,12],[95,16],[101,14],[107,8],[117,8],[129,6],[139,8],[150,7],[162,10],[172,10],[177,14],[169,17],[162,17],[158,21],[152,22],[155,26],[150,31],[144,32],[143,36],[139,34],[135,39],[137,45],[132,43],[129,38],[126,35],[122,33],[118,39],[115,37],[111,31],[106,30],[102,35],[99,33],[96,26],[90,25],[87,22],[82,24],[76,23]],
  [[77,27],[82,24],[90,25],[97,28],[101,35],[105,39],[99,44],[96,51],[91,56],[85,53],[83,44],[77,43],[73,39],[72,33]],
  [[104,47],[106,49],[103,55],[101,54]],
  [[136,45],[143,44],[151,47],[157,46],[159,49],[151,49],[146,48],[141,49]],
  [[144,54],[150,52],[156,53],[162,50],[167,56],[167,61],[160,64],[155,61],[146,62],[142,59]],
  [[176,56],[178,57],[175,62],[171,65],[169,64],[172,61]],
  [[155,25],[158,22],[160,20],[161,23],[158,27]],
  [[76,15],[77,17],[75,20],[73,19]],
];
function worldMap() {
  background(PAPER);
  const { x, y } = active;
  for (const ly of [17, 35, 53]) area(4, ly, 172, 1, BEIGE);
  for (const coast of COASTS) poly(coast.map(([px, py]) => [x + px, y + py]), RULE);
}
function leadArt(i) {
  background(BEIGE);
  const { x, y } = active;
  const stroke = (a, b, c, d, t, color) => thickLine(x + a, y + b, x + c, y + d, t, color);
  if (i === 0) {
    for (const [r, start] of [[10,0.5],[18,1.5],[27,2.5]]) {
      arc(x + 37, y + 41, r, 4, start, start + 4.5, RED);
    }
    disc(x + 37, y + 41, 4, INK);
  } else if (i === 1) {
    // Three seats at a round table, without implying a completed agreement.
    disc(x + 37, y + 42, 18, RED);
    disc(x + 37, y + 42, 15, PAPER);
    for (const [px, py] of [[37,13],[12,57],[62,57]]) disc(x + px, y + py, 6, INK);
    area(29, 40, 16, 3, RULE);
  } else {
    for (const [px, bar] of [[13,12],[27,23],[41,19],[55,42]]) area(px, 64 - bar, 7, bar, TINT);
    area(9, 66, 57, 2, INK);
    stroke(11, 47, 25, 30, 3, RED);
    stroke(25, 30, 40, 37, 3, RED);
    stroke(40, 37, 60, 14, 3, RED);
    stroke(52, 14, 60, 14, 3, RED);
    stroke(60, 14, 60, 22, 3, RED);
  }
}

const M = 24, CW = W - 2 * M;
const small = { color: RED, tracking: 1 };
const condensed = { sy: 2, tracking: 1, color: DGREY };
const rendered = new Set();
function mark(item) {
  assert(!rendered.has(item), `Story drawn twice: ${item.id}`);
  rendered.add(item);
}
function grid(items, cols, top, pitch, height, gap, draw) {
  const available = active.w - (cols - 1) * gap;
  items.forEach((item, i) => {
    const c = i % cols, start = Math.floor(available * c / cols);
    const width = Math.floor(available * (c + 1) / cols) - start;
    part(item.id ?? `cell ${i + 1}`, start + c * gap, top + Math.floor(i / cols) * pitch, width, height,
      box => draw(item, width, i, box));
  });
}
function sectionTitle(title, aside) {
  line('heading', 0, 3, 450, title, { sx: 2, tracking: 1 });
  line('folio', 462, 7, CW - 462, aside, { ...small, align: 'right' });
}
function masthead() {
  const date = 'FRIDAY 20 NOVEMBER 2026';
  const sx = Math.floor(CW / textWidth(date, 1));
  const tracking = Math.floor((CW - textWidth(date, sx)) / (date.length - 1));
  line('nameplate', 0, 3, 470, 'WORLD DISPATCH', { sx: 2, tracking: 3 });
  line('edition', 480, 3, CW - 480, 'WORLD NEWS / FRIDAY EDITION',
    { sx: 2, color: RED, tracking: 1, align: 'right' });
  rule('hairline', 0, 24, CW, 1, INK);
  line('date', 0, 33, CW, date, { sx, sy: 10, tracking, align: 'center' });
  rule('lower rule', 0, 112, CW, 3, INK);
  line('edition scope', 0, 119, 500, 'REPORTING DATE / SEE DATE CHECK', small);
  line('index', 508, 119, CW - 508, `${allStories.length} REPORTS / ${tally.size} REGIONS / 6 KEY FIGURES`,
    { ...small, align: 'right' });
}
function figures() {
  grid(STATS, 6, 0, 84, 84, 8, ([value, caption], w) => {
    background(BEIGE);
    rule('top rule', 0, 0, w, 3, RED);
    line('value', 7, 10, w - 14, value, { sx: 3, sy: 4, color: RED, align: 'center' });
    para('caption', 6, 44, w - 12, 34, caption, 17, { ...condensed, color: INK, align: 'center' });
  });
}
function leads() {
  grid(LEADS, 3, 0, 155, 155, 12, (item, w, i) => {
    mark(item);
    background(i === 0 ? BEIGE : PAPER);
    rule('top edge', 0, 0, w, 4, i === 0 ? RED : INK);
    line('dateline', 12, 12, w - 24, kicker(item), small);
    para('headline', 12, 28, w - 108, 62, item.head, 32, { sx: 3, sy: 4 });
    part('illustration', w - 86, 23, 74, 81, () => leadArt(i));
    rule('deck rule', 12, 103, w - 111, 1);
    para('deck', 12, 111, w - 24, 37, item.deck, 17, condensed);
  });
}
function secondary() {
  sectionTitle('IN FOCUS', 'DIPLOMACY / COURTS / MARKETS / CULTURE');
  grid(SECONDARY, 3, 22, 56, 56, 12, (item, w) => {
    mark(item);
    background(PAPER);
    rule('top rule', 0, 0, w, 1);
    line('dateline', 9, 5, w - 18, kicker(item), small);
    line('headline', 9, 15, w - 18, item.head, { sx: 2 });
    para('deck', 9, 33, w - 18, 20, item.deck, 9, { color: DGREY, tracking: 1 });
  });
}
function wires() {
  sectionTitle('WORLD WIRE', `BRIEFS ${numbered(WIRE[0])}-${numbered(WIRE.at(-1))} / AROUND THE GLOBE`);
  grid(WIRE, 4, 21, 44, 43, 12, (item, w, i) => {
    mark(item);
    if (Math.floor(i / 4) % 2 === 0) background(PAPER);
    rule('top rule', 0, 0, w, 1);
    line('dateline', 6, 3, w - 12, kicker(item), { color: RED });
    line('headline', 6, 12, w - 12, item.head, { sy: 2, tracking: 1 });
    para('deck', 6, 27, w - 12, 15, item.deck, 8, { color: DGREY });
  });
}
function footer() {
  part('coverage', 0, 0, 423, 101, () => {
    background(PAPER);
    rule('top rule', 0, 0, 423, 3, INK);
    line('heading', 10, 10, 183, 'WORLD COVERAGE', { sx: 2, tracking: 1 });
    part('map', 8, 28, 180, 67, worldMap);
    part('region chips', 197, 9, 216, 82, () => {
      [...tally].forEach(([region, count], i) => {
        part(region, (i % 2) * 110, Math.floor(i / 2) * 21, 106, 19, () => {
          background(BEIGE);
          line('region', 5, 2, 75, region.toUpperCase(), { sy: 2 });
          line('count', 82, 2, 19, String(count), { sx: 2, color: RED, align: 'right' });
        });
      });
    });
  });
  part('date check', 435, 0, CW - 435, 101, ({ w }) => {
    background(BEIGE);
    rule('top rule', 0, 0, w, 3, RED);
    line('heading', 12, 9, 150, 'DATE CHECK', { sx: 2, tracking: 1 });
    line('source note', 166, 13, w - 178, 'SOURCES: RAJ GLOBAL STUDIES / ZHUDONG DIGEST',
      { ...small, align: 'right' });
    rule('column divider', 302, 31, 1, 60);
    line('Thursday', 12, 30, 280, '19 NOV / THURSDAY EVENTS', { sy: 2, color: RED, tracking: 1 });
    para('Thursday examples', 12, 48, 280, 49, [
      'Shenzhen talks; Berlin summit; Crimea strike.',
      'Anthropic debut; GTA VI launch; ICJ ruling.',
      'IEA outlook and Nvidia subpoena also dated 19 Nov.',
    ], 16, { sy: 2, color: DGREY });
    line('Friday', 314, 30, w - 326, '20 NOV / FRIDAY REPORTS', { sy: 2, color: RED, tracking: 1 });
    para('Friday examples', 314, 48, w - 326, 49, [
      'Issue date, not the date of every event.',
      'Akvan landfall forecast near Gopalpur;',
      'SCO forum due to open in Delhi.',
    ], 16, { sy: 2, color: DGREY });
  });
}
function drawPage() {
  background(CREAM);
  rule('red edge', 0, 0, W, 7, RED);
  part('masthead', M, 17, CW, 130, masthead);
  part('figures', M, 155, CW, 84, figures);
  part('leads', M, 252, CW, 155, leads);
  part('secondary grid', M, 418, CW, 190, secondary);
  part('wire grid', M, 616, CW, 285, wires);
  part('footer', M, 907, CW, 101, footer);
  assert.equal(rendered.size, allStories.length, 'Incomplete story rendering');
  const date = TEXT_LOG.find(item => item.name === 'page/masthead/date');
  assert(date && TEXT_LOG.every(item => item === date || item.h < date.h), 'Date is not the largest type');
}


// PNG encoding: v1's 8-bit truecolour, filter-0 rows, single IDAT.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG() {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = W * 3;
  const raw = Buffer.alloc(H * (stride + 1));
  for (let y = 0; y < H; y++) {
    Buffer.from(img.data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))]);
}

const [outPath = 'entry.png', ...extra] = process.argv.slice(2).filter(arg => arg !== '--audit');
assert(!extra.length && !outPath.startsWith('--'), 'Usage: node news-poster.mjs [entry.png] [--audit]');
drawPage();
const png = encodePNG();
assert(png.length <= 1_048_576 && W <= 1024 && H <= 1024, 'PNG exceeds entry limits');
writeFileSync(outPath, png);
console.log(`${outPath}: ${W}x${H}, ${png.length} bytes; ${allStories.length} stories; ` +
  `${TEXT_LOG.length} text lines / ${boxCount} regions checked`);
console.log([...tally].map(([region, count]) => `${region} ${count}`).join(' | '));
if (process.argv.includes('--audit')) {
  for (const { name, x, y, w, h, sx, sy, text } of TEXT_LOG) {
    console.log(`${x},${y}  ${w}x${h}  ${sx}x${sy}  ${name}: ${text}`);
  }
  for (const item of allStories) console.log(`${numbered(item)} ${item.id}: ${item.source}`);
}
