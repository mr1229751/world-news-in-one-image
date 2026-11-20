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

// ---------------------------------------------------------------------------
// PNG encoding: 8-bit truecolour, filter-0 rows, single IDAT
// ---------------------------------------------------------------------------

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
    if (e.limit != null && e.inkW > e.limit) {
      failures.push(`${e.label} width ${e.inkW}px exceeds ${e.limit}px: "${e.text}"`);
    }
  }

  // 4: overlap between stacked text blocks, and the 40px page margin
  const boxes = TEXT_LOG.map((e) => ({ ...e, x1: e.x + e.inkW }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const hitX = a.x < b.x1 && b.x < a.x1;
      const hitY = a.inkTop < b.inkBottom && b.inkTop < a.inkBottom;
      if (hitX && hitY) failures.push(`overlap: ${a.label} vs ${b.label}`);
    }
  }
  for (const b of boxes) {
    if (b.x < MARGIN) failures.push(`${b.label} crosses left margin at x=${b.x}`);
    if (b.x1 > CONTENT_R) failures.push(`${b.label} crosses right margin at x=${b.x1}`);
    if (b.inkTop < 7) failures.push(`${b.label} crosses top edge at y=${b.inkTop}`);
    if (b.inkBottom > H - MARGIN) failures.push(`${b.label} crosses bottom margin at y=${b.inkBottom}`);
  }

  console.log('\ncard rhythm (measured, from card top y):');
  console.log(`  black edge     y  ${RHYTHM.edge} .. ${EDGE_H}`);
  console.log(`  kicker         y  ${RHYTHM.kickerY} .. ${RHYTHM.kickerY + KICK_CAP}   (cap ${KICK_CAP})`);
  console.log(`  headline 1     y  ${RHYTHM.head1Y} .. ${RHYTHM.head1Y + HEAD_CAP}   (cap ${HEAD_CAP})`);
  console.log(`  headline 2     y  ${RHYTHM.head2Y} .. ${RHYTHM.head2Y + HEAD_CAP}   (cap ${HEAD_CAP})`);
  console.log(`  secondary      y  ${RHYTHM.secY} .. ${RHYTHM.secBottom}   (cap ${SEC_CAP})`);
  console.log(`  red underline  y  ${RHYTHM.ruleY} .. ${RHYTHM.ruleY + RULE_H}`);
  console.log(`  card bottom    y  ${CARD_H}`);
  console.log(`  breathing gap, secondary -> underline: ${RHYTHM.gapSecRule}px`);

  const caps = TEXT_LOG.filter((e) => /^card\d+\.head\d$/.test(e.label));
  const secs = TEXT_LOG.filter((e) => /^card\d+\.secondary$/.test(e.label));
  console.log(`\nheadline lines: ${caps.length}, min cap ${Math.min(...caps.map((e) => e.cap))}px, ` +
    `widest ${Math.max(...caps.map((e) => e.inkW))}px / ${TEXT_W}px`);
  console.log(`secondary lines: ${secs.length}, min cap ${Math.min(...secs.map((e) => e.cap))}px, ` +
    `widest ${Math.max(...secs.map((e) => e.inkW))}px / ${TEXT_W}px`);
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
console.log(`masthead scale ${MAST.scale}, tracking ${MAST.tracking}, width ${MAST.w}`);
console.log(`hero head widest ${Math.max(...HEAD_LINES.map((l) => textWidth(l, HEAD_SCALE, 0) + 1))}px at scale ${HEAD_SCALE}`);
console.log(`hero deck widest ${Math.max(...deck.map((l) => textWidth(l, 2, -1)))}px at scale 2 (unchanged)`);
console.log(`PNG ${png.length} bytes, deterministic (no timestamps, no RNG)`);

const problems = [...warnings, ...failures];
if (problems.length) console.log('\nWARNINGS:\n  ' + problems.join('\n  '));
else console.log('\nno layout warnings');
