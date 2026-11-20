// news-poster.mjs — draws a one-page newspaper front page for Friday 20 November 2026
// and writes it as a PNG. Node 22 standard library only: own proportional bitmap font,
// own RGB rasteriser, own PNG encoder (node:zlib + hand-rolled CRC32). Deterministic.
//
//   node news-poster.mjs [out.png]        (default: entry.png)

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// canvas
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;

const img = { w: W, h: H, data: new Uint8Array(W * H * 3) };

const CREAM = [245, 240, 231];
const PAPER = [252, 250, 246];
const BEIGE = [234, 227, 214];
const INK = [24, 22, 20];
const RED = [186, 32, 33];
const GREY = [122, 116, 108];
const DGREY = [68, 64, 58];
const BORDER = [216, 207, 193];
const GREEN = [26, 122, 62];
const BLUE = [26, 54, 148];
const YELLOW = [250, 220, 62];
const PALELINE = [196, 189, 178];

function put(x, y, c) {
  const i = (y * W + x) * 3;
  img.data[i] = c[0];
  img.data[i + 1] = c[1];
  img.data[i + 2] = c[2];
}

function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) put(xx, yy, c);
  }
}

function rectOutline(x, y, w, h, t, c) {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function disc(cx, cy, r, c) {
  const r2 = r * r;
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) put(x, y, c);
    }
  }
}

// ring segment; angles in radians measured from +x, clockwise on screen
function arc(cx, cy, r, thickness, a0, a1, c) {
  const ro = r + thickness / 2;
  const ri = r - thickness / 2;
  const ro2 = ro * ro;
  const ri2 = ri * ri;
  const TAU = Math.PI * 2;
  const s = ((a0 % TAU) + TAU) % TAU;
  const e = ((a1 % TAU) + TAU) % TAU;
  const y0 = Math.max(0, Math.floor(cy - ro));
  const y1 = Math.min(H - 1, Math.ceil(cy + ro));
  const x0 = Math.max(0, Math.floor(cx - ro));
  const x1 = Math.min(W - 1, Math.ceil(cx + ro));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 > ro2 || d2 < ri2) continue;
      let a = Math.atan2(dy, dx);
      if (a < 0) a += TAU;
      if (s <= e ? a >= s && a <= e : a >= s || a <= e) put(x, y, c);
    }
  }
}

function thickLine(x0, y0, x1, y1, th, c) {
  const half = th / 2;
  const minx = Math.max(0, Math.floor(Math.min(x0, x1) - half - 1));
  const maxx = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + half + 1));
  const miny = Math.max(0, Math.floor(Math.min(y0, y1) - half - 1));
  const maxy = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + half + 1));
  const vx = x1 - x0;
  const vy = y1 - y0;
  const len2 = vx * vx + vy * vy || 1;
  for (let y = miny; y <= maxy; y++) {
    const py = y + 0.5;
    for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5;
      let t = ((px - x0) * vx + (py - y0) * vy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - (x0 + t * vx);
      const dy = py - (y0 + t * vy);
      if (dx * dx + dy * dy <= half * half) put(x, y, c);
    }
  }
}

function poly(pts, c) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [px, py] of pts) {
    if (px < minx) minx = px;
    if (px > maxx) maxx = px;
    if (py < miny) miny = py;
    if (py > maxy) maxy = py;
  }
  const x0 = Math.max(0, Math.floor(minx));
  const y0 = Math.max(0, Math.floor(miny));
  const x1 = Math.min(W - 1, Math.ceil(maxx));
  const y1 = Math.min(H - 1, Math.ceil(maxy));
  const n = pts.length;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = pts[i][0], yi = pts[i][1];
        const xj = pts[j][0], yj = pts[j][1];
        if (yi > py !== yj > py) {
          const xint = xi + ((py - yi) / (yj - yi)) * (xj - xi);
          if (px < xint) inside = !inside;
        }
      }
      if (inside) put(x, y, c);
    }
  }
}

function star(cx, cy, r, c) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 === 0 ? r : r * 0.42;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  poly(pts, c);
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font
// ---------------------------------------------------------------------------

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
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
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
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '####.', '.....', '.....', '.....'],
  '\u2014': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '%': ['#...#', '...#.', '..#..', '..#..', '.#...', '#...#', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
  ';': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '\u20ac': ['.###.', '#...#', '#....', '#####', '#....', '#...#', '.###.'],
  '\u00a3': ['..##.', '.#..#', '.#...', '####.', '.#...', '.#...', '#####'],
  '\u00b7': ['.....', '.....', '.....', '.##..', '.##..', '.....', '.....'],
};

const GLYPH_H = 7;
const GAP = 1; // base letter gap in font cells

// ink metrics per glyph: leading blank columns trimmed, trailing blanks dropped
const METRICS = {};
for (const [ch, rows] of Object.entries(GLYPHS)) {
  let lo = 99;
  let hi = -1;
  for (const row of rows) {
    for (let c = 0; c < 5; c++) {
      if (row[c] === '#') {
        if (c < lo) lo = c;
        if (c > hi) hi = c;
      }
    }
  }
  if (hi < 0) {
    METRICS[ch] = { lead: 0, ink: 0 };
  } else {
    METRICS[ch] = { lead: lo, ink: hi - lo + 1 };
  }
}

function axes(scale) {
  return Array.isArray(scale) ? scale : [scale, scale];
}

function glyph(ch) {
  return METRICS[ch] || METRICS['?'];
}

function advance(ch, sx, tracking) {
  const m = glyph(ch);
  if (ch === ' ') return 3 * sx + tracking;
  return m.ink * sx + GAP * sx + tracking;
}

function textWidth(text, sx, tracking) {
  if (text.length === 0) return 0;
  let w = 0;
  for (const ch of text) w += advance(ch, sx, tracking);
  return Math.max(0, w - (GAP * sx + tracking));
}

// Splits a caption into lines that each fit maxWidth at the fixed scale, and
// returns the widest of them. Captions are never shrunk to fit: a stat caption
// the reader cannot resolve is worse than a caption on two lines.
function wrapAt(text, sx, maxWidth, tracking = 0) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, sx, tracking) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return { lines, width: Math.max(...lines.map((l) => textWidth(l, sx, tracking))) };
}

// audit trail: every visible string drawn is recorded with its measured pixel
// metrics, so --audit can report cap heights and widths instead of eyeballing.
const TEXT_LOG = [];
let TEXT_LABEL = 'page';
let TEXT_LIMIT = null;

function label(name, limit = null) {
  TEXT_LABEL = name;
  TEXT_LIMIT = limit;
}

// draws text glyph by glyph as filled rectangles; bold adds one column to each run
function drawText(x, y, text, scale, color, tracking = 0, bold = false) {
  const [sx, sy] = axes(scale);
  const top = Math.round(y);
  const startX = Math.round(x);
  let cursor = startX;
  for (const raw of text) {
    const ch = raw.toUpperCase();
    const g = GLYPHS[ch] || GLYPHS['?'];
    const m = glyph(ch);
    if (ch !== ' ') {
      for (let row = 0; row < GLYPH_H; row++) {
        const bits = g[row];
        let col = 0;
        while (col < 5) {
          if (bits[col] === '#') {
            let run = 1;
            while (col + run < 5 && bits[col + run] === '#') run++;
            fillRect(cursor + (col - m.lead) * sx, top + row * sy,
              run * sx + (bold ? 1 : 0), sy, color);
            col += run;
          } else {
            col += 1;
          }
        }
      }
    }
    cursor += advance(ch, sx, tracking);
  }
  const w = textWidth(text, sx, tracking);

  // record ink extents as actually rasterised (bold adds 1px to each inked run)
  let inkTop = GLYPH_H * sy;
  let inkBottom = 0;
  for (const raw of text) {
    const ch = raw.toUpperCase();
    const g = GLYPHS[ch] || GLYPHS['?'];
    if (ch === ' ') continue;
    for (let row = 0; row < GLYPH_H; row++) {
      if (g[row].includes('#')) {
        if (row * sy < inkTop) inkTop = row * sy;
        if ((row + 1) * sy > inkBottom) inkBottom = (row + 1) * sy;
      }
    }
  }
  if (inkBottom === 0) {
    inkTop = 0;
  }
  TEXT_LOG.push({
    label: TEXT_LABEL,
    text,
    scale: sx === sy ? sx : `${sx}x${sy}`,
    x: startX,
    y: top,
    w,
    inkW: w + (bold ? 1 : 0),
    cap: inkBottom - inkTop,
    inkTop: top + inkTop,
    inkBottom: top + inkBottom,
    tracking,
    bold,
    limit: TEXT_LIMIT,
  });

  return w;
}

// fitted sizes are cached so measuring and drawing use identical numbers
const fitCache = new Map();

// largest (sx, sy) from the ladder whose width fits, then letterspace to fill
function fitText(text, maxWidth, ladder, maxTracking = 0) {
  const key = `${text}|${maxWidth}|${ladder.join(',')}|${maxTracking}`;
  if (fitCache.has(key)) return fitCache.get(key);
  let chosen = { sx: ladder[0][0], sy: ladder[0][1], tracking: 0 };
  for (const [sx, sy] of ladder) {
    if (textWidth(text, sx, 0) + (sx > 1 ? 1 : 0) <= maxWidth) chosen = { sx, sy, tracking: 0 };
  }
  let tracking = 0;
  if (maxTracking > 0 && text.length > 1) {
    const slack = maxWidth - textWidth(text, chosen.sx, 0);
    tracking = Math.max(0, Math.min(maxTracking, Math.floor(slack / (text.length - 1))));
  }
  const result = { ...chosen, tracking, w: textWidth(text, chosen.sx, tracking) };
  fitCache.set(key, result);
  return result;
}

function drawTextRight(right, y, text, scale, color, tracking = 0) {
  return drawText(right - textWidth(text, axes(scale)[0], tracking), y, text, scale, color, tracking);
}

// public helpers: measure(text, scale) -> {w, h}; wrap(text, scale, maxWidth) -> lines
function measure(text, scale, tracking = 0) {
  const [sx, sy] = axes(scale);
  return { w: textWidth(text, sx, tracking), h: GLYPH_H * sy };
}

// greedy wrapper, used where a single line count is not critical
function wrap(text, scale, maxWidth, tracking = 0) {
  const sx = axes(scale)[0];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, sx, tracking) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// balanced wrapper: split into exactly `maxLines` lines with the least raggedness
function wrapBalanced(text, scale, maxWidth, maxLines, tracking = 0) {
  const sx = axes(scale)[0];
  const words = text.split(/\s+/).filter(Boolean);
  const n = words.length;
  const spaceW = advance(' ', sx, tracking);
  const w = words.map((word) => textWidth(word, sx, tracking));
  // lineWidth[i][j] = width of words i..j on one line
  const width = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = i; j < n; j++) {
      acc += w[j];
      if (j > i) acc += spaceW;
      width[i][j] = acc;
    }
  }
  const INF = Infinity;
  // best[k][i] = cost of laying words i.. on k lines
  const best = Array.from({ length: maxLines + 1 }, () => new Array(n + 1).fill(INF));
  const from = Array.from({ length: maxLines + 1 }, () => new Array(n + 1).fill(-1));
  best[0][n] = 0;
  for (let k = 1; k <= maxLines; k++) {
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i; j < n; j++) {
        if (width[i][j] > maxWidth) break;
        if (best[k - 1][j + 1] === INF) continue;
        const slack = maxWidth - width[i][j];
        const cost = slack * slack + best[k - 1][j + 1];
        if (cost < best[k][i]) {
          best[k][i] = cost;
          from[k][i] = j;
        }
      }
    }
  }
  if (best[maxLines][0] === INF) return null;
  const lines = [];
  let i = 0;
  for (let k = maxLines; k >= 1; k--) {
    const j = from[k][i];
    lines.push(words.slice(i, j + 1).join(' '));
    i = j + 1;
  }
  return lines;
}

function wrapUpTo(text, scale, maxWidth, maxLines, tracking = 0) {
  for (let k = 2; k <= maxLines; k++) {
    const lines = wrapBalanced(text, scale, maxWidth, k, tracking);
    if (lines) return lines;
  }
  return wrap(text, scale, maxWidth, tracking);
}

// biggest integer scale whose line fits, then letterspace out to fill the column
function fitLine(text, maxWidth, minScale = 4, maxScale = 18) {
  let scale = maxScale;
  while (scale > minScale && textWidth(text, scale, 0) > maxWidth) scale -= 1;
  const n = text.length;
  let tracking = 0;
  if (n > 1) {
    const slack = maxWidth - textWidth(text, scale, 0);
    tracking = Math.max(0, Math.min(scale * 2, Math.floor(slack / (n - 1))));
  }
  return { scale, tracking, w: textWidth(text, scale, tracking) };
}

/* STAGED REBUILD: legacy layout retained below for reference, not rendered.
// ---------------------------------------------------------------------------
// page furniture
// ---------------------------------------------------------------------------

const MARGIN = 40;
const CONTENT_R = W - MARGIN; // 984
const CONTENT_W = CONTENT_R - MARGIN; // 944

fillRect(0, 0, W, H, CREAM);
fillRect(0, 0, W, 7, RED); // full-width top bar

// folio row
label('folio.left');
drawText(MARGIN, 22, 'FRIDAY', 2, RED, 2);
label('folio.right');
drawTextRight(CONTENT_R, 22, 'THE DAY IN ONE IMAGE', 2, GREY, 2);
fillRect(MARGIN, 46, CONTENT_W, 2, INK);

// masthead, autofit inside the 944px column
const MAST = fitLine('20 NOVEMBER 2026', CONTENT_W, 5, 18);
label('masthead', CONTENT_W);
drawText(MARGIN, 56, '20 NOVEMBER 2026', MAST.scale, INK, MAST.tracking, true);

const MAST_BOTTOM = 56 + GLYPH_H * MAST.scale;
fillRect(MARGIN, MAST_BOTTOM + 8, CONTENT_W, 5, INK);
fillRect(MARGIN, MAST_BOTTOM + 19, CONTENT_W, 1, INK);
label('summary');
drawText(MARGIN, MAST_BOTTOM + 29, 'WORLD NEWS SUMMARY', 2, GREY, 3);

// ---------------------------------------------------------------------------
// hero panel
// ---------------------------------------------------------------------------

const HERO_X = MARGIN;
const HERO_Y = 186;
const HERO_W = CONTENT_W;
const HERO_H = 266;
const HERO_BOTTOM = HERO_Y + HERO_H; // 452

fillRect(HERO_X, HERO_Y, HERO_W, HERO_H, BEIGE);
fillRect(HERO_X, HERO_Y, 9, HERO_H, RED); // 9px accent edge

const TEXT_X = 70;
const TEXT_R = 720;

// kicker + date chip
const KICK_Y = HERO_Y + 12; // 198
const kicker = 'THE SUMMIT  \u00b7  SHENZHEN';
label('hero kicker');
const kickerW = drawText(TEXT_X, KICK_Y, kicker, 2, RED, 1);
const chipText = '20 NOV 2026';
const chipW = textWidth(chipText, 2, 0) + 26;
const chipX = TEXT_X + kickerW + 16;
const chipY = KICK_Y - 6;
fillRect(chipX, chipY, chipW, 26, INK);
label('hero chip');
drawText(chipX + 13, chipY + 6, chipText, 2, CREAM);

// headline: three lines, last in red
const HEAD_Y = 232;
const HEAD_PITCH = 56;
const HEAD_SCALE = 7;
const HEAD_LINES = ['THREE POWERS', 'PLEDGE NO', 'NUCLEAR WAR'];
label('hero headline', TEXT_R - TEXT_X);
for (let i = 0; i < HEAD_LINES.length; i++) {
  drawText(TEXT_X, HEAD_Y + i * HEAD_PITCH, HEAD_LINES[i], HEAD_SCALE,
    i === 2 ? RED : INK, 0, true);
}

// deck: three lines of dark grey at scale 3, so the lead story reads as well
// as the card secondaries do at 300px
const deck = wrapUpTo(
  "Trump, Xi and Putin sign a 'Peace Declaration'; no Ukraine deal.",
  3,
  640,
  2,
  -1,
);
let deckY = 400;
const deckLines = [...deck];
label('hero deck', 640);
for (const line of deckLines) {
  drawText(TEXT_X, deckY, line, 3, DGREY, -1);
  deckY += 25;
}

// right column: three flags, then the document card
const COL_X = 728;
const COL_W = 238;
const FLAG_W = 70;
const FLAG_H = 46;
const FLAG_Y = HERO_Y + 24; // 210..256

function flagFrame(x, y) {
  rectOutline(x - 1, y - 1, FLAG_W + 2, FLAG_H + 2, 1, [150, 143, 133]);
}

// United States: 13 stripes, blue canton with a star grid
function drawUS(x, y) {
  fillRect(x, y, FLAG_W, FLAG_H, [255, 255, 255]);
  const stripe = FLAG_H / 13;
  for (let i = 0; i < 13; i += 2) fillRect(x, y + i * stripe, FLAG_W, stripe, [178, 34, 52]);
  const cw = Math.round(FLAG_W * 0.46);
  const ch = Math.round(FLAG_H * (7 / 13));
  fillRect(x, y, cw, ch, [38, 58, 122]);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) fillRect(x + 4 + c * 7, y + 4 + r * 6, 2, 2, [255, 255, 255]);
  }
  flagFrame(x, y);
}

// China: red field, one big star and four small stars arcing toward it
function drawCN(x, y) {
  fillRect(x, y, FLAG_W, FLAG_H, [206, 38, 44]);
  const bigX = x + 18;
  const bigY = y + 15;
  star(bigX, bigY, 11, YELLOW);
  // four small stars in the constellation to the right of the big one
  const small = [
    [bigX + 20, bigY - 11, 4],
    [bigX + 27, bigY - 2, 4],
    [bigX + 27, bigY + 9, 4],
    [bigX + 20, bigY + 18, 4],
  ];
  for (const [sx, sy, sr] of small) star(sx, sy, sr, YELLOW);
  flagFrame(x, y);
}

// Russia: white / blue / red bands
function drawRU(x, y) {
  const band = FLAG_H / 3;
  fillRect(x, y, FLAG_W, band, [255, 255, 255]);
  fillRect(x, y + band, FLAG_W, band, [38, 70, 148]);
  fillRect(x, y + 2 * band, FLAG_W, FLAG_H - 2 * band, [196, 40, 45]);
  flagFrame(x, y);
}

const flagGap = (COL_W - 3 * FLAG_W) / 2; // 15
drawUS(COL_X, FLAG_Y);
drawCN(COL_X + FLAG_W + flagGap, FLAG_Y);
drawRU(COL_X + 2 * (FLAG_W + flagGap), FLAG_Y);

// document card
const DOC_X = COL_X;
const DOC_Y = FLAG_Y + FLAG_H + 18; // 274
const DOC_W = COL_W;
const DOC_H = HERO_BOTTOM - 16 - DOC_Y; // 162

fillRect(DOC_X, DOC_Y, DOC_W, DOC_H, PAPER);
rectOutline(DOC_X, DOC_Y, DOC_W, DOC_H, 1, BORDER);
fillRect(DOC_X, DOC_Y, DOC_W, 5, INK);

const DOC_PAD = 14;
label('doc card');
drawText(DOC_X + DOC_PAD, DOC_Y + 18, 'PEACE DECLARATION', 2, DGREY, 0);
fillRect(DOC_X + DOC_PAD, DOC_Y + 44, DOC_W - 2 * DOC_PAD, 1, BORDER);

// three grey text lines, right side left free for the check mark
const docLineWidths = [150, 120, 92];
for (let i = 0; i < 3; i++) {
  fillRect(DOC_X + DOC_PAD, DOC_Y + 58 + i * 14, docLineWidths[i], 4, PALELINE);
}

// big green check mark
thickLine(DOC_X + 128, DOC_Y + 110, DOC_X + 154, DOC_Y + 136, 13, GREEN);
thickLine(DOC_X + 154, DOC_Y + 136, DOC_X + 214, DOC_Y + 80, 13, GREEN);

// ---------------------------------------------------------------------------
// six story cards
// ---------------------------------------------------------------------------

const CARD_W = 463;
const CARD_H = 158;
const COL_GAP = 18;
const CARD_COLS = [MARGIN, MARGIN + CARD_W + COL_GAP];
const CARD_ROWS = [472, 644, 816];
const CARD_PAD = 18;
const TILE = 126;
// measured text column: card width, less both pads, less the icon tile, less a
// 6px safety gutter between the last glyph and the tile's left edge
const TEXT_COL = CARD_W - 2 * CARD_PAD - TILE; // 301
const TILE_GUTTER = 6;
const TEXT_W = TEXT_COL - TILE_GUTTER; // 295

// each icon draws inside a TILE x TILE box at (tx, ty)
function iconHalt(tx, ty) {
  // two red pause bars above a black trapezoid base
  fillRect(tx + 40, ty + 27, 16, 36, RED);
  fillRect(tx + 72, ty + 27, 16, 36, RED);
  poly([
    [tx + 24, ty + 99],
    [tx + 102, ty + 99],
    [tx + 89, ty + 76],
    [tx + 37, ty + 76],
  ], INK);
}

function iconEU(tx, ty) {
  // blue disc with twelve yellow dots in a ring
  disc(tx + 63, ty + 63, 37, BLUE);
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6 - Math.PI / 2;
    disc(tx + 63 + Math.cos(a) * 25, ty + 63 + Math.sin(a) * 25, 3.4, YELLOW);
  }
}

function iconGavel(tx, ty) {
  // gavel: two crossing thick bars over a bench line
  thickLine(tx + 34, ty + 90, tx + 76, ty + 48, 11, INK);
  thickLine(tx + 52, ty + 32, tx + 94, ty + 74, 17, RED);
  fillRect(tx + 22, ty + 95, 82, 10, INK);
}

function iconChart(tx, ty) {
  // rising green polyline with an arrowhead
  const pts = [
    [tx + 24, ty + 94],
    [tx + 46, ty + 74],
    [tx + 63, ty + 83],
    [tx + 88, ty + 42],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    thickLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 8, GREEN);
  }
  poly([
    [tx + 104, ty + 26],
    [tx + 71, ty + 35],
    [tx + 94, ty + 58],
  ], GREEN);
}

function iconCyclone(tx, ty) {
  // concentric blue arcs around a red eye, plus wind marks
  const cx = tx + 58;
  const cy = ty + 66;
  arc(cx, cy, 13, 6, 0.3, 4.2, BLUE);
  arc(cx, cy, 27, 6, 1.1, 5.0, BLUE);
  arc(cx, cy, 41, 6, 1.9, 5.8, BLUE);
  disc(cx, cy, 6.5, RED);
  thickLine(tx + 80, ty + 24, tx + 104, ty + 24, 6, BLUE);
  thickLine(tx + 86, ty + 37, tx + 106, ty + 37, 6, BLUE);
  thickLine(tx + 80, ty + 106, tx + 104, ty + 106, 6, BLUE);
}

function iconDrop(tx, ty) {
  // black oil drop
  disc(tx + 63, ty + 76, 27, INK);
  poly([
    [tx + 63, ty + 26],
    [tx + 37, ty + 72],
    [tx + 89, ty + 72],
  ], INK);
}

// Card copy is fixed, pre-fitted wording: headline lines are sized to sit at
// scale 4 and the secondary line at scale 3 inside TEXT_W. Long lines were the
// whole legibility problem, so the copy is short by design, not by autofit.
const STORIES = [
  {
    cat: 'MIDDLE EAST',
    head: ['IRAN STRIKES', 'ON HOLD'],
    // "Slips past New Year" measures 312px at scale 3, so the same news is
    // stated in the short form that fits
    body: 'Slipped to 2027',
    icon: iconHalt,
  },
  {
    cat: 'EUROPE',
    head: ['EUROPE WINS', 'A SEAT'],
    // "for Ukraine" measures 330px at scale 3; Kyiv is the short form that fits
    body: 'EUR 45bn for Kyiv',
    icon: iconEU,
  },
  {
    cat: 'ASIA \u00b7 JUSTICE',
    head: ['ICJ: MYANMAR', 'GENOCIDE'],
    body: 'Rohingya ruling',
    icon: iconGavel,
  },
  {
    cat: 'BUSINESS \u00b7 AI',
    head: ['ANTHROPIC', '$2 TRILLION'],
    // "Record Nasdaq debut" measures 321px at scale 3; IPO is the fitting form
    body: 'Record Nasdaq IPO',
    icon: iconChart,
  },
  {
    cat: 'SOUTH ASIA',
    head: ['CYCLONE AKVAN', 'HITS INDIA'],
    body: '120,000 evacuated',
    icon: iconCyclone,
  },
  {
    cat: 'ENERGY \u00b7 MARKETS',
    head: ['HORMUZ SHOCK', "'NO WAY BACK'"],
    body: 'Brent near $93',
    icon: iconDrop,
  },
];

// card type sizes: headline must stay >= 4, secondary >= 3
const CARD_KICK = 2;
const CARD_HEAD = 4;
const CARD_SEC = 3;
const KICK_TRACK = 1;
const EDGE_H = 6; // black top edge height
const RULE_H = 3; // red underline thickness
const RULE_INSET = 16; // underline top, measured up from the card's bottom edge

// vertical rhythm expressed in measured glyph heights, never fixed offsets
const KICK_CAP = measure('A', CARD_KICK).h; // 14
const HEAD_CAP = measure('A', CARD_HEAD).h; // 28
const SEC_CAP = measure('A', CARD_SEC).h; // 21
const RHYTHM = (() => {
  const gapEdgeKick = 8; // black edge -> kicker
  const gapKickHead = 8; // kicker -> first headline line
  const headLead = 4; // extra leading between the two headline lines
  const gapHeadSec = 9; // second headline line -> secondary
  const kickerY = EDGE_H + gapEdgeKick;
  const head1Y = kickerY + KICK_CAP + gapKickHead;
  const head2Y = head1Y + HEAD_CAP + headLead;
  const secY = head2Y + HEAD_CAP + gapHeadSec;
  return {
    kickerY,
    head1Y,
    head2Y,
    secY,
    edge: 0,
    ruleY: CARD_H - RULE_INSET,
    secBottom: secY + SEC_CAP,
    gapSecRule: CARD_H - RULE_INSET - (secY + SEC_CAP),
  };
})();

// draw one line at the requested scale, tightening tracking by at most 1px/char
// if the line would otherwise cross the card's text width
function drawCardLine(x, y, text, scale, color, bold) {
  let tracking = 0;
  if (textWidth(text, scale, 0) + (bold ? 1 : 0) > TEXT_W) tracking = -1;
  drawText(x, y, text, scale, color, tracking, bold);
  return tracking;
}

const warnings = [];

if (RHYTHM.gapSecRule < 6) warnings.push(`secondary line ${RHYTHM.gapSecRule}px from underline`);
if (RHYTHM.secY + SEC_CAP > CARD_H - RULE_INSET - RULE_H) warnings.push('card rhythm collides with underline');

for (let i = 0; i < STORIES.length; i++) {
  const story = STORIES[i];
  const cx = CARD_COLS[i % 2];
  const cy = CARD_ROWS[Math.floor(i / 2)];

  fillRect(cx, cy, CARD_W, CARD_H, PAPER);
  rectOutline(cx, cy, CARD_W, CARD_H, 1, BORDER);
  fillRect(cx, cy, CARD_W, EDGE_H, INK); // black top edge

  const tx = cx + CARD_PAD;
  const logStart = TEXT_LOG.length;

  label(`card${i + 1}.kicker`, TEXT_W);
  drawText(tx, cy + RHYTHM.kickerY, story.cat, CARD_KICK, RED, KICK_TRACK);

  // headline: two lines, both pinned to CARD_HEAD
  label(`card${i + 1}.head1`, TEXT_W);
  drawCardLine(tx, cy + RHYTHM.head1Y, story.head[0], CARD_HEAD, INK, true);
  label(`card${i + 1}.head2`, TEXT_W);
  drawCardLine(tx, cy + RHYTHM.head2Y, story.head[1], CARD_HEAD, INK, true);

  // secondary: exactly one line at CARD_SEC
  label(`card${i + 1}.secondary`, TEXT_W);
  drawCardLine(tx, cy + RHYTHM.secY, story.body, CARD_SEC, DGREY, false);
  if (wrap(story.body, CARD_SEC, TEXT_W, 0).length > 1) {
    warnings.push(`card${i + 1} secondary needs >1 line: ${story.body}`);
  }

  // measure the four lines as actually rasterised, including any tracking applied
  const drawn = TEXT_LOG.slice(logStart);
  for (const line of drawn) {
    if (line.inkW > TEXT_W) {
      warnings.push(`card${i + 1} line wider than text column (${line.inkW}px): ${line.text}`);
    }
  }

  fillRect(tx, cy + RHYTHM.ruleY, 46, RULE_H, RED); // short red underline

  const tileX = cx + CARD_W - CARD_PAD - TILE;
  const tileY = cy + Math.round((CARD_H - TILE) / 2);
  fillRect(tileX, tileY, TILE, TILE, BEIGE);
  story.icon(tileX, tileY);

  const widest = Math.max(...drawn.map((line) => line.inkW));
  if (tx + widest + 6 > tileX) warnings.push(`card${i + 1} text runs into tile (${widest}px)`);
}

*/

// ---------------------------------------------------------------------------
// staged replacement layout — corpus facts only
// ---------------------------------------------------------------------------
const MARGIN = 28;
const CONTENT_R = W - MARGIN;
const CONTENT_W = CONTENT_R - MARGIN;
const bands = [];
const warnings = [];
fillRect(0, 0, W, H, CREAM);

function band(name, y0, y1) { bands.push({ name, y0, y1 }); }
function text(name, x, y, value, scale, color, tracking = 0, bold = false, limit = CONTENT_R - x) {
  label(name, limit);
  return drawText(x, y, value, scale, color, tracking, bold);
}
function rule(y, x = MARGIN, w = CONTENT_W, color = PALELINE, h = 1) {
  fillRect(x, y, w, h, color);
}
function fitDate(value, maxWidth) {
  let scale = 16;
  while (scale > 4 && textWidth(value, scale, 0) + 1 > maxWidth) scale--;
  return { scale, width: textWidth(value, scale, 0) + 1 };
}

// Band 1: masthead with hairline rules.
band('masthead', 12, 38);
rule(10);
text('masthead.left', MARGIN, 17, 'THE WORLD IN ONE DAY', 2, RED, 1);
text('masthead.right', 570, 17, "FRIDAY'S NEWS · ONE PAGE · 36 STORIES", 2, INK, 0, false, CONTENT_R - 570);
rule(38);

// Band 2: the date is the largest typographic element.
band('date', 47, 134);
const DATE_TEXT = 'FRIDAY 20 NOVEMBER 2026';
const DATE_FIT = fitDate(DATE_TEXT, CONTENT_W);
text('date', MARGIN, 49, DATE_TEXT, DATE_FIT.scale, INK, 0, true, CONTENT_W);
const TEASER = 'AKVAN REACHES INDIA · ANTHROPIC MAKES HISTORY · KYIV UNDER FIRE';
{
  let ts = 3;
  while (ts > 1 && textWidth(TEASER, ts, 0) + 1 > CONTENT_W) ts--;
  text('teaser', MARGIN, 117, TEASER, ts, RED, 0, false, CONTENT_W);
}

// Band 3: corpus stat table, six equally measured cells.
band('statistics', 145, 211);
rule(143, MARGIN, CONTENT_W, INK, 2);
const STATS = [
  ['120,000', 'PEOPLE EVACUATED'], ['$97.17', 'ANTHROPIC FIRST CLOSE'],
  ['€45bn', 'EU AID PROPOSED'], ['2.8bn', 'BARRELS OF OIL LOST'],
  ['17.1m', 'GTA VI PRE-ORDERS'], ['$81.3bn', 'ANTHROPIC IPO RAISED'],
];
const STAT_W = CONTENT_W / STATS.length;
const STAT_CAP = 1;
for (let i = 0; i < STATS.length; i++) {
  const x = MARGIN + i * STAT_W;
  if (i) rule(151, x - 7, 1, BORDER, 60);
  const [value, caption] = STATS[i];
  let s = 9;
  while (s > 4 && textWidth(value, s, 0) > STAT_W - 14) s--;
  text(`stat${i + 1}.value`, x + 4, 154, value, s, RED, 0, true, STAT_W - 14);
  // one line at scale 1: the band closes at y 211 and the chip row starts at 219,
  // so a second caption line would sit on top of the chips
  const wrapped = wrapAt(caption, STAT_CAP, STAT_W - 14);
  if (wrapped.lines.length > 1) warnings.push(`stat${i + 1} caption needs ${wrapped.lines.length} lines`);
  text(`stat${i + 1}.caption`, x + 4, 198, wrapped.lines[0], STAT_CAP, INK, 0, false, STAT_W - 14);
}
rule(211);

// Band 4: region chips. Drawn below, once STORY_DATA is known, so the counts
// are the table's own tally.
band('regions', 219, 249);

// Stories 1-13: heroes and numbered grid cards. Copy is restricted to the brief.
// The region chip counts below are computed from this table, never hard-coded:
// a tally that the stories do not support is an invented statistic.
const STORY_DATA = [
  { place:'GOPALPUR', region:'ASIA-PACIFIC', section:'DISASTER', head:'CYCLONE AKVAN', deck:'Landfall near Gopalpur · 120,000 evacuated', kind:'cyclone' },
  { place:'NASDAQ', region:'THE AMERICAS', section:'MARKETS', head:'ANTHROPIC IPO', deck:'First close $97.17 · $81.3bn raised', kind:'chart' },
  { place:'KYIV', region:'EUROPE', section:'UKRAINE', head:'WINTER AIR DEFENCE', deck:'Kyiv braces for drone threat', },
  { place:'SHENZHEN', region:'ASIA-PACIFIC', section:'DIPLOMACY', head:'PEACE DECLARATION', deck:'Three powers pledge talks', },
  { place:'WASHINGTON', region:'THE AMERICAS', section:'TECH', head:'NVIDIA PROBE', deck:'California AG subpoena' },
  { place:'EARTH', region:'WORLD', section:'SPACE', head:'VOYAGER 1', deck:'One light-day away' },
  { place:'WASHINGTON', region:'THE AMERICAS', section:'AVIATION', head:'FAA PROBE', deck:'Close to root cause' },
  { place:'BERLIN', region:'EUROPE', section:'UKRAINE', head:'BERLIN SUMMIT', deck:'40+ countries · four-party' },
  { place:'KYIV', region:'EUROPE', section:'FRONT LINE', head:'211 ENGAGEMENTS', deck:'Reported on the front line' },
  { place:'MYANMAR', region:'ASIA-PACIFIC', section:'COURTS', head:'ICJ: GENOCIDE', deck:'Rohingya 2017 campaign' },
  { place:'HORMUZ', region:'MIDEAST', section:'ENERGY', head:'OIL SUPPLY SHOCK', deck:'IEA: 2.8bn barrels lost' },
  { place:'GOPALPUR', region:'ASIA-PACIFIC', section:'RESCUE', head:'300 TEAMS', deck:'Ahead of Akvan landfall' },
  { place:'SHENZHEN', region:'ASIA-PACIFIC', section:'APEC', head:'APEC OUTLOOK', deck:'21 economies adopt it' },
  // 14-36: the brief list at the foot of the page.
  { place:'WASHINGTON', region:'THE AMERICAS', section:'CONGRESS', head:'IRAN WAR POWERS', deck:'Bill rejected in the Senate' },
  { place:'MANAMA', region:'MIDEAST', section:'SECURITY', head:'IRAN STRIKES', deck:'US facilities hit in Bahrain and Kuwait' },
  { place:'VIENNA', region:'WORLD', section:'ENERGY', head:'HORMUZ DECLINE', deck:'20m b/d pre-war · 8.5m by 2030' },
  { place:'BERLIN', region:'EUROPE', section:'DIPLOMACY', head:'WILLING COALITION', deck:'Merz hosts 40+ countries' },
  { place:'BRUSSELS', region:'EUROPE', section:'UKRAINE', head:'113 MEASURES', deck:'New sanctions package proposed' },
  { place:'CRIMEA', region:'EUROPE', section:'FRONT LINE', head:'BRIDGE HIT AGAIN', deck:'Third strike in four days' },
  { place:'MOSCOW', region:'EUROPE', section:'UKRAINE', head:'NO CEASEFIRE', deck:'Putin rules out talks' },
  { place:'LONDON', region:'EUROPE', section:'DEFENCE', head:'1,000 DRONES', deck:'£260m winter aid package' },
  { place:'GAZA', region:'MIDEAST', section:'CONFLICT', head:'YELLOW LINE', deck:'Rare ground operation beyond it' },
  { place:'GLOBAL', region:'WORLD', section:'ENERGY', head:'DEMAND FALLS', deck:'102.3m b/d · first drop since 2020' },
  { place:'NEW DELHI', region:'ASIA-PACIFIC', section:'DIPLOMACY', head:'SCO FORUM', deck:'Civilisational Dialogue opens' },
  { place:'BHOPAL', region:'ASIA-PACIFIC', section:'HEALTH', head:'H5N1 VACCINE', deck:'First indigenous dose launched' },
  { place:'NEW DELHI', region:'ASIA-PACIFIC', section:'ECONOMY', head:'EPFO FLOOR', deck:'Withdrawal minimum 25% to 10%' },
  { place:'CHRISTCHURCH', region:'OCEANIA', section:'SPORT', head:'NICHOLLS 113*', deck:'New Zealand 243/5 on day one' },
  { place:'LOS ANGELES', region:'THE AMERICAS', section:'TECH', head:'OUTAGE WEEK', deck:'Microsoft, JPMorgan, Apple, NSA hit' },
  { place:'NEW YORK', region:'THE AMERICAS', section:'MARKETS', head:'846m SHARES', deck:'Traded in ANT on day one' },
  { place:'SAN FRANCISCO', region:'THE AMERICAS', section:'MARKETS', head:'$2 TRILLION', deck:'Market value near the peak' },
  { place:'WASHINGTON', region:'THE AMERICAS', section:'CONGRESS', head:'HUANG TO TESTIFY', deck:'Senate Banking Committee' },
  { place:'ZAMFARA', region:'AFRICA', section:'SECURITY', head:'20 FREED', deck:'Police rescue abducted people' },
  { place:'JOHANNESBURG', region:'AFRICA', section:'SECURITY', head:'17 DEAD', deck:'Police probe two shootings' },
  { place:'NUKUALOFA', region:'OCEANIA', section:'CLIMATE', head:'TONGA DROUGHT', deck:'Emergency declared' },
  { place:'LOS ANGELES', region:'THE AMERICAS', section:'GAMES', head:'METACRITIC 99', deck:'GTA VI review score' },
  { place:'TEL AVIV', region:'MIDEAST', section:'SECURITY', head:'4-7 DAY CAMPAIGN', deck:'Israel presses for joint air action' },
];
const REGION_ORDER = [
  ['EUROPE', BLUE], ['THE AMERICAS', RED], ['ASIA-PACIFIC', GREEN],
  ['MIDEAST', [136, 79, 39]], ['AFRICA', [99, 103, 54]],
  ['OCEANIA', [39, 112, 125]], ['WORLD', INK],
];
const REGION_TALLY = REGION_ORDER.map(([name]) => [
  name, STORY_DATA.filter((s) => s.region === name).length,
]);
const EXPECTED_TOTAL = STORY_DATA.length;

function fitDraw(name, x, y, value, maxWidth, minScale, maxScale, color, bold = false) {
  let scale = maxScale;
  while (scale > minScale && textWidth(value, scale, 0) + (bold ? 1 : 0) > maxWidth) scale--;
  text(name, x, y, value, scale, color, 0, bold, maxWidth);
  return scale;
}

// Fits a string into a fixed box by shrinking, then by wrapping. Returns the
// lines drawn so the caller can report a box that still does not fit. A headline
// is never allowed past its cell: overflow is what made the first draft unreadable.
function fitWrapped(name, x, y, value, maxWidth, minScale, maxScale, color, bold, maxLines, lineStep) {
  for (let scale = maxScale; scale >= minScale; scale--) {
    const w = wrapAt(value, scale, maxWidth);
    if (w.lines.length <= maxLines) {
      w.lines.forEach((l, i) => text(`${name}${i}`, x, y + i * lineStep, l, scale, color, 0, bold, maxWidth));
      return { scale, lines: w.lines.length, overflow: false };
    }
  }
  const w = wrapAt(value, minScale, maxWidth);
  w.lines.slice(0, maxLines).forEach((l, i) => text(`${name}${i}`, x, y + i * lineStep, l, minScale, color, 0, bold, maxWidth));
  return { scale: minScale, lines: w.lines.length, overflow: w.lines.length > maxLines };
}
function iconRadar(x, y, w, h) {
  fillRect(x, y, w, h, [13, 28, 52]);
  const cx=x+w*0.5, cy=y+h*0.54;
  arc(cx,cy,18,3,0.2,5.6,[62,177,206]); arc(cx,cy,34,3,0.8,5.8,[62,177,206]);
  arc(cx,cy,51,3,1.5,5.9,[62,177,206]); disc(cx,cy,6,RED);
  thickLine(cx,cy,cx+38,cy-28,2,[62,177,206]);
}
function iconCandles(x,y,w,h) {
  fillRect(x,y,w,h,[20,55,43]);
  for(let i=0;i<4;i++) rule(y+h-18-i*25,x+15,w-30,[42,86,68],1);
  const vals=[[32,63,40],[74,48,34],[116,53,30],[158,30,42],[200,18,37],[242,12,26]];
  for(let i=0;i<vals.length;i++){
    const [dx,dy,bh]=vals[i], c=i%2? [215,103,85]:[112,201,139];
    thickLine(x+dx+8,y+dy-8,x+dx+8,y+dy+bh+8,2,c); fillRect(x+dx,y+dy,16,bh,c);
  }
}
function iconNight(x,y,w,h) {
  fillRect(x,y,w,h,[15,22,44]);
  for(let i=0;i<34;i++) disc(x+12+(i*47)%Math.max(1,w-24),y+8+(i*29)%(Math.max(1,h-16)),1,[198,205,210]);
  poly([[x,y+h-19],[x+36,y+h-19],[x+36,y+h-52],[x+59,y+h-52],[x+59,y+h-30],[x+85,y+h-30],[x+85,y+h-68],[x+116,y+h-68],[x+116,y+h-25],[x+152,y+h-25],[x+152,y+h-49],[x+181,y+h-49],[x+181,y+h-20],[x+w,y+h-20],[x+w,y+h],[x,y+h]],[41,48,68]);
  for(let i=0;i<3;i++){thickLine(x+40+i*65,y+5,x+67+i*65,y+43,2,[236,114,82]);disc(x+67+i*65,y+43,3,[255,198,119]);}
}
function illustration(kind,x,y,w,h) {
  if(kind==='cyclone') iconRadar(x,y,w,h);
  else if(kind==='chart') iconCandles(x,y,w,h);
  else if(kind==='skyline') iconNight(x,y,w,h);
  else { fillRect(x,y,w,h,BEIGE); disc(x+w/2,y+h/2,Math.min(w,h)*0.27, kind==='eu' ? BLUE : RED); }
}
function cardStory(item,index,x,y,w,h,hero=false) {
  fillRect(x,y,w,h,PAPER); rectOutline(x,y,w,h,1,BORDER);
  // 5x7 font: a line at scale s occupies exactly 7*s px. Leading is computed
  // from that, never guessed — mismatched leading is what stacked the first draft.
  const artH=hero?Math.round(h*0.40):0;
  if(hero){ illustration(item.kind,x+1,y+1,w-2,artH); }
  const pad=hero?12:8, tx=x+pad, tw=w-pad*2;
  const kScale=1, kY=hero? y+artH+9 : y+6;
  const kWrapped=wrapAt(`${index} · ${item.place} · ${item.section}`,kScale,tw);
  if(kWrapped.lines.length>1) warnings.push(`story${index} kicker needs ${kWrapped.lines.length} lines`);
  text(`story${index}.kicker`,tx,kY,kWrapped.lines[0],kScale,RED,0,false,tw);

  const hTop=kY+7*kScale+3;
  const hMax=hero?5:3, hMin=hero?3:2;
  let hScale=hMax, hLines=[];
  for(;hScale>=hMin;hScale--){
    // a line count under the limit is not enough: every line must also fit the
    // column. One oversized word ("DECLARATION") bled into the next cell.
    const w2=wrapAt(item.head,hScale,tw);
    const fits=w2.lines.length<=2 && w2.lines.every((l)=>textWidth(l,hScale,0)+1<=tw);
    if(fits){ hLines=w2.lines; break; }
  }
  if(!hLines.length){ hScale=hMin; hLines=wrapAt(item.head,hScale,tw).lines.slice(0,2); warnings.push(`story${index} headline truncated`); }
  const hStep=7*hScale+2;
  hLines.forEach((l,i)=>text(`story${index}.headline${i}`,tx,hTop+i*hStep,l,hScale,INK,0,true,tw));

  const dTop=hTop+hLines.length*hStep+3;
  const dScale=1, dStep=7*dScale+2;
  const dWrapped=wrapAt(item.deck,dScale,tw);
  const dLines=dWrapped.lines.slice(0,2);
  if(dWrapped.lines.length>2) warnings.push(`story${index} deck needs ${dWrapped.lines.length} lines`);
  const dEnd=dTop+dLines.length*dStep;
  if(dEnd>y+h-3) warnings.push(`story${index} bottom overflows card by ${Math.round(dEnd-(y+h-3))}px`);
  dLines.forEach((l,i)=>text(`story${index}.secondary${i}`,tx,dTop+i*dStep,l,dScale,DGREY,0,false,tw));
}

// Band 5: three illustrated heroes.
band('heroes',263,455);
const HERO_GAP=12, HERO_W=(CONTENT_W-HERO_GAP*2)/3, HERO_H=188;
for(let i=0;i<3;i++) cardStory(STORY_DATA[i],i+1,MARGIN+i*(HERO_W+HERO_GAP),263,HERO_W,HERO_H,true);
rule(455);

// Bands 6-7: two exact rows of five, stories 4-13.
band('grid.row1',463,558); band('grid.row2',565,660);
const GRID_GAP=8, GRID_W=(CONTENT_W-GRID_GAP*4)/5, GRID_H=94;
for(let i=3;i<13;i++){
  const row=Math.floor((i-3)/5), col=(i-3)%5;
  cardStory(STORY_DATA[i],i+1,MARGIN+col*(GRID_W+GRID_GAP),463+row*102,GRID_W,GRID_H,false);
}

// ---------------------------------------------------------------------------
// Band 8: region chips, tallied from STORY_DATA above.
// ---------------------------------------------------------------------------
const CHIP_GAP = 8;
const CHIP_W = (CONTENT_W - CHIP_GAP * (REGION_TALLY.length - 1)) / REGION_TALLY.length;
for (let i = 0; i < REGION_TALLY.length; i++) {
  const [name, count] = REGION_TALLY[i];
  const color = REGION_ORDER[i][1];
  const x = MARGIN + i * (CHIP_W + CHIP_GAP);
  fillRect(x, 219, CHIP_W, 30, color);
  const cap = `${name} ${count}`;
  let scale = 2;
  while (scale > 1 && textWidth(cap, scale, 0) > CHIP_W - 10) scale--;
  text(`region.${name}`, x + 5, 229, cap, scale, PAPER, 0, true, CHIP_W - 10);
}

// ---------------------------------------------------------------------------
// Band 9: world map, flat equirectangular projection, and the date check.
// ---------------------------------------------------------------------------
band('map', 668, 788);
const MAP_X = MARGIN, MAP_Y = 676, MAP_W = 442, MAP_H = 112;
const mp = (lon, lat) => [MAP_X + ((lon + 180) / 360) * MAP_W, MAP_Y + ((90 - lat) / 180) * MAP_H];
fillRect(MAP_X, MAP_Y, MAP_W, MAP_H, BEIGE);
for (let gx = 0; gx <= MAP_W; gx += MAP_W / 12) fillRect(MAP_X + gx, MAP_Y, 1, MAP_H, BORDER);
for (let gy = 0; gy <= MAP_H; gy += MAP_H / 6) fillRect(MAP_X, MAP_Y + gy, MAP_W, 1, BORDER);
const LAND = [
  [[-168,65],[-140,70],[-100,72],[-80,70],[-60,60],[-55,48],[-70,42],[-75,35],[-81,25],[-97,26],[-105,20],[-115,30],[-125,40],[-130,55],[-155,58]],
  [[-81,8],[-60,10],[-50,0],[-35,-6],[-38,-22],[-48,-25],[-58,-38],[-65,-45],[-72,-52],[-75,-40],[-71,-20],[-78,-5]],
  [[-17,15],[0,35],[10,37],[32,31],[35,15],[43,11],[51,12],[41,-2],[40,-15],[35,-25],[25,-34],[18,-34],[12,-18],[9,-1],[3,5],[-8,5]],
  [[-10,36],[0,44],[10,45],[28,41],[30,55],[20,60],[30,70],[10,58],[-5,58],[-10,44]],
  [[30,70],[60,72],[100,76],[140,72],[160,68],[170,60],[140,45],[130,35],[122,30],[108,20],[100,10],[95,15],[88,22],[78,8],[72,20],[60,25],[45,15],[35,30],[28,41],[30,55]],
  [[113,-22],[129,-12],[142,-11],[153,-28],[146,-38],[135,-35],[125,-33]],
];
for (const shape of LAND) {
  poly(shape.map(([lo, la]) => mp(lo, la)), [206, 196, 178]);
}
rectOutline(MAP_X, MAP_Y, MAP_W, MAP_H, 1, INK);
for (const [name, count] of REGION_TALLY) {
  const anchor = { EUROPE:[-2,50], 'THE AMERICAS':[-95,40], 'ASIA-PACIFIC':[105,30],
    MIDEAST:[45,26], AFRICA:[20,2], OCEANIA:[134,-25], WORLD:[0,-58] }[name];
  if (anchor) disc(...mp(anchor[0], anchor[1]), 3, RED);
}
text('map.caption', MAP_X, MAP_Y - 8, 'WHERE THE 36 STORIES ARE', 2, RED, 1);

// date check block, right of the map
const DC_X = MAP_X + MAP_W + 16, DC_W = CONTENT_R - DC_X;
rectOutline(DC_X, MAP_Y, DC_W, MAP_H, 2, INK);
fillRect(DC_X, MAP_Y, DC_W, 20, INK);
text('datecheck.title', DC_X + 7, MAP_Y + 6, 'DATE CHECK', 2, PAPER, 1, true, DC_W - 14);
const DC_LINES = [
  ['EDITION', 'Friday 20 November 2026'],
  ['STORIES', '36 numbered · seven regions'],
  ['STATISTICS', 'Six, each with its unit'],
];
// both label and value at scale 1: at scale 2 the label alone owns 14px and the
// value underneath it collided with the next label
for (let i = 0; i < DC_LINES.length; i++) {
  const y = MAP_Y + 26 + i * 24;
  text(`datecheck.k${i}`, DC_X + 7, y, DC_LINES[i][0], 1, RED, 0, true, DC_W - 14);
  text(`datecheck.v${i}`, DC_X + 7, y + 10, DC_LINES[i][1], 1, INK, 0, false, DC_W - 14);
}
if (DC_LINES.length * 24 + 26 > MAP_H - 14) warnings.push('date check lines run past the box');
text('datecheck.foot', DC_X + 7, MAP_Y + MAP_H - 10, 'ONE DAY · ONE PAGE', 1, DGREY, 0, false, DC_W - 14);

// ---------------------------------------------------------------------------
// Band 10: stories 14-36 as a numbered wire list, four columns.
// ---------------------------------------------------------------------------
band('wire', 796, 992);
rule(792, MARGIN, CONTENT_W, INK, 2);
text('wire.title', MARGIN, 798, 'THE REST OF FRIDAY · STORIES 14 TO 36', 2, RED, 1);
const WIRE_TOP = 814, WIRE_COLS = 4, WIRE_ROWS = 6;
const WIRE_GAP = 16;
const WIRE_W = (CONTENT_W - WIRE_GAP * (WIRE_COLS - 1)) / WIRE_COLS;
const wire = STORY_DATA.slice(13);
// one row is three lines of scale-1 type: 7px cap + 2px lead, three times, plus rule
const WIRE_H = 30;
for (let i = 0; i < wire.length; i++) {
  const col = Math.floor(i / WIRE_ROWS), row = i % WIRE_ROWS;
  if (col >= WIRE_COLS) break;
  const x = MARGIN + col * (WIRE_W + WIRE_GAP);
  const y = WIRE_TOP + row * WIRE_H;
  const item = wire[i];
  const n = i + 14;
  if (row) rule(y - 6, x, WIRE_W - 2, PALELINE, 1);
  const kicker = `${n} · ${item.place}`;
  text(`wire${n}.kicker`, x, y, kicker, 1, RED, 0, false, WIRE_W);
  const headLines = wrapAt(item.head, 1, WIRE_W).lines.slice(0, 1);
  text(`wire${n}.headline`, x, y + 9, headLines[0], 1, INK, 0, true, WIRE_W);
  const deckLines = wrapAt(item.deck, 1, WIRE_W).lines.slice(0, 1);
  text(`wire${n}.deck`, x, y + 18, deckLines[0], 1, DGREY, 0, false, WIRE_W);
}
if (wire.length > WIRE_COLS * WIRE_ROWS) {
  warnings.push(`wire list holds ${wire.length} stories in ${WIRE_COLS * WIRE_ROWS} cells`);
}

// ---------------------------------------------------------------------------
// Self-check: the chips, the index and the masthead must all agree.
// A page that says 36 stories and indexes 35 is a factual error, not a style one.
// ---------------------------------------------------------------------------
const TALLY_SUM = REGION_TALLY.reduce((a, [, c]) => a + c, 0);
if (TALLY_SUM !== EXPECTED_TOTAL) {
  failures.push(`region chips sum to ${TALLY_SUM}, STORY_DATA holds ${EXPECTED_TOTAL}`);
}
const shown = 13 + wire.length;
if (shown !== EXPECTED_TOTAL) {
  failures.push(`page numbers ${shown} stories, STORY_DATA holds ${EXPECTED_TOTAL}`);
}
if (EXPECTED_TOTAL !== 36) {
  failures.push(`STORY_DATA holds ${EXPECTED_TOTAL} stories, the masthead claims 36`);
}


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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = W * 3;
  const raw = Buffer.alloc(H * (stride + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0
    Buffer.from(img.data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// main: write, then report ink bounds and layout assertions
// ---------------------------------------------------------------------------

const outPath = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'entry.png';
const AUDIT = process.argv.includes('--audit');
const png = encodePNG();
writeFileSync(outPath, png);

// ---- audit -----------------------------------------------------------------
// cap-height floors and width ceilings per element class
const FLOORS = [
  [/^card\d+\.head\d$/, { cap: 28, scale: 4 }],
  [/^card\d+\.secondary$/, { cap: 21, scale: 3 }],
  [/^card\d+\.kicker$/, { cap: 14, scale: 2 }],
];
const failures = [];

console.log(`${outPath}: ${W}x${H}, ${png.length} bytes`);

// distance the first story band begins at, so ink above it (masthead rules) is
// allowed to touch the page edge
const EDGE_H = 260;

if (AUDIT) {
  console.log('\nelement                     scale  cap  width  limit   x..x        y..y');
  console.log('-'.repeat(78));
  for (const e of TEXT_LOG) {
    const x1 = e.x + e.inkW;
    const lim = e.limit == null ? '  -  ' : `${String(e.limit).padStart(4)}px`;
    const flag = e.limit != null && e.inkW > e.limit ? ' OVER' : '';
    console.log(
      `${e.label.padEnd(26).slice(0, 26)}  ${String(e.scale).padStart(2)}   ` +
      `${String(e.cap).padStart(3)}  ${String(e.inkW).padStart(5)}  ${lim}  ` +
      `${String(e.x).padStart(4)}..${String(x1).padStart(4)}  ` +
      `${String(e.inkTop).padStart(4)}..${String(e.inkBottom).padStart(4)}${flag}`,
    );
  }

  // 1-3: scale / cap-height floors and card text width ceilings
  for (const e of TEXT_LOG) {
    const rule = FLOORS.find(([re]) => re.test(e.label));
    if (rule) {
      const { cap: minCap, scale: minScale } = rule[1];
      if (e.scale < minScale) failures.push(`${e.label} drawn at scale ${e.scale} < ${minScale}`);
      if (e.cap < minCap) failures.push(`${e.label} cap height ${e.cap}px < ${minCap}px`);
    }
  }

  console.log('\nbands (staged layout):');
  for (const b of bands) console.log(`  ${b.name.padEnd(12)} y  ${b.y0} .. ${b.y1}`);
}

// ---------------------------------------------------------------------------
// Geometry gates: run on every build, not only under --audit. The first draft
// looked fine to the internal table and still bled past the page edge, because
// these checks sat behind a flag nobody passed.
// ---------------------------------------------------------------------------
for (const e of TEXT_LOG) {
  if (e.limit != null && e.inkW > e.limit + 0.5) {
    failures.push(`${e.label} width ${Math.round(e.inkW)}px exceeds ${Math.round(e.limit)}px: "${e.text}"`);
  }
}
const boxes = TEXT_LOG.map((e) => ({ ...e, x1: e.x + e.inkW }));
for (let i = 0; i < boxes.length; i++) {
  for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i];
    const b = boxes[j];
    const hitX = a.x < b.x1 - 0.5 && b.x < a.x1 - 0.5;
    const hitY = a.inkTop < b.inkBottom - 0.5 && b.inkTop < a.inkBottom - 0.5;
    if (hitX && hitY) failures.push(`overlap: ${a.label} vs ${b.label}`);
  }
}
for (const b of boxes) {
  if (b.x < MARGIN - 0.5) failures.push(`${b.label} crosses left margin at x=${Math.round(b.x)}`);
  if (b.x1 > CONTENT_R + 0.5) failures.push(`${b.label} crosses right margin at x=${Math.round(b.x1)}`);
  if (b.inkTop < 7) failures.push(`${b.label} crosses top edge at y=${Math.round(b.inkTop)}`);
  if (b.inkBottom > H - MARGIN + 0.5) failures.push(`${b.label} crosses bottom margin at y=${Math.round(b.inkBottom)}`);
}

// every band must hold its own ink: a caption that spills into the next band is
// a collision even when no two strings touch
for (const [i, b] of bands.entries()) {
  const nextTop = bands[i + 1] ? bands[i + 1].y0 : H - MARGIN;
  for (const e of boxes) {
    if (e.inkTop >= b.y0 && e.inkTop < b.y1 && e.inkBottom > Math.min(b.y1, nextTop) + 0.5) {
      failures.push(`${e.label} spills out of band ${b.name} (ends y=${Math.round(e.inkBottom)}, band ends ${Math.min(b.y1, nextTop)})`);
    }
  }
}

let minX = W, minY = H, maxX = -1, maxY = -1, marginHits = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const d = img.data;
    if (d[i] === CREAM[0] && d[i + 1] === CREAM[1] && d[i + 2] === CREAM[2]) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (y > EDGE_H + 1 && (x < MARGIN || x >= CONTENT_R || y > H - MARGIN - 1)) marginHits++;
  }
}

console.log(`\nink bbox x ${minX}..${maxX}, y ${minY}..${maxY}; margin hits ${marginHits}`);
console.log(`PNG ${png.length} bytes, deterministic (no timestamps, no RNG)`);

const problems = [...warnings, ...failures];
if (problems.length) console.log('\nWARNINGS:\n  ' + problems.join('\n  '));
else console.log('\nno layout warnings');
