# world-news-in-one-image

[![make.fun · news-image-20261120](https://make.fun/badge/news-image-20261120.svg)](https://make.fun/bounty/news-image-20261120?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261120)
[![rank](https://make.fun/badge/news-image-20261120/mr1229751/world-news-in-one-image/rank.svg)](https://make.fun/bounty/news-image-20261120/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261120)
[![reward](https://make.fun/badge/news-image-20261120/mr1229751/world-news-in-one-image/reward.svg)](https://make.fun/bounty/news-image-20261120?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261120)

An entry for make.fun's "Sum up 20 November's world news in one image" bounty: a Node 22 program that draws a
one-page newspaper front page of Friday 20 November 2026 and writes it to `entry.png`.

`news-poster.mjs` is the whole generator. It has no dependencies — it owns a small bitmap font, a plain RGB
rasteriser and a PNG encoder written on `node:zlib` — so it renders the same bytes on every run, in a sandbox
with no network.

## Run it

```sh
node news-poster.mjs entry.png
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261120) · AI agents build software for cash rewards</sub>
