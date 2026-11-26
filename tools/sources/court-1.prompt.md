# court-1.png: the town hall's court (envoys and petitioners)

Generated with GPT image generation in ChatGPT, landscape 3:2, with two reference images attached:
`tools/sources/ref-style.png` (style) and `tools/sources/ambiance-1.png` (scale and sheet layout).
Cut by `tools/sync_creatures.py` (3 rows x 3 columns).

## Prompt

```
Create a pixel-art sprite sheet in exactly the same style as the two attached images: the same
high-detail 16-bit fantasy RPG pixel art, the same dark 1-px outlines, warm top-left light, the
same muted rich palette, and the same character scale as the villagers in the second image.

Layout: a landscape 3:2 sheet, a grid of 3 rows x 3 columns, one character per row, one pose per
column. Every figure is full body, centred in its cell, the same height as the others in its row,
feet on the same baseline, with plenty of empty space between figures (no figure touches or
overlaps another, no props cross into another cell). The background is ONE flat solid colour,
#4d6b38 (muted green), everywhere: no ground, no shadows, no gradient, no texture, no grid lines,
no frames, no text, no labels. All figures face slightly to the LEFT (three-quarter view, like the
villagers in the second image).

Row 1, the ENVOY: a young royal messenger in a short tabard of deep royal blue with silver trim
and a small silver key emblem on the chest, a blue cap with a white feather, grey hose, brown
boots, a leather satchel at the hip. He carries a rolled parchment scroll sealed with red wax.
  Column 1: standing straight, holding the sealed scroll up in front of his chest, proud.
  Column 2: walking (mid-stride, one leg forward), scroll in hand.
  Column 3: dejected: shoulders slumped, head lowered, scroll hanging down at his side.

Row 2, the PETITIONER (woman): a middle-aged townswoman in a plain russet dress, a cream apron and
a cream head scarf, holding a rolled petition (plain parchment, tied with a ribbon).
  Column 1: standing, holding the petition with both hands in front of her, waiting patiently.
  Column 2: walking, petition in hand.
  Column 3: impatient: arms crossed with the petition tucked under one arm, frowning, one foot
  tapping.

Row 3, the PETITIONER (old man): an old townsman with a white beard, a long brown coat, a grey
hood, leaning on a wooden cane in one hand and holding a rolled petition in the other.
  Column 1: standing, leaning on the cane, petition held up a little.
  Column 2: walking slowly with the cane, petition in hand.
  Column 3: impatient: tapping the cane on the ground, waving the petition, scowling.

None of them carry weapons, baskets or tools. Keep their outfits clearly different from the
peasant woman, the farmer, the guard and the merchant in the second image.
```

## Fixes for a second try (send in the same chat)

- Background not flat: `Redo it with the background one perfectly flat #4d6b38, nothing else behind the figures.`
- Figures touch: `Same sheet, but with more empty space between the figures; nothing may cross into another cell.`
- Wrong scale or style: `Match the pixel size and detail of the attached villagers exactly; the figures are too smooth / too big / too small.`
- One row is wrong: `Keep rows 1 and 3 exactly as they are and redraw only row 2: ...`
