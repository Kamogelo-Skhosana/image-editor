# Halide — Image Editor & Converter

Crop, straighten, adjust and convert images in the browser. Nothing is uploaded —
every pixel stays on your machine.

The interface is a fixed-height studio shell: tool rail on the left, canvas in the
middle, options panel on the right, and a status bar along the bottom. Only one tool
panel is open at a time — the rail switches between them.

A welcome sheet explains what the tool is on the first visit — free, no account, nothing
uploaded — and is remembered in `localStorage` under `halide.welcome.seen`. The ⓘ button
in the header reopens it.

## Run

```bash
npm install
npm run dev
```

Opens on http://localhost:5176

## Features

- **Load** — drop or browse, several images at once, switch between them from the filmstrip
- **Transform** — rotate 90° either way, flip horizontally/vertically
- **Crop** — drag a selection with free or fixed aspect ratios (1:1, 16:9, 4:3, 3:4, 9:16)
- **Resize** — exact width/height with optional ratio lock, plus 25/50/75/100% presets
- **Adjust** — brightness, contrast, saturation, hue, blur, greyscale, sepia, invert
- **Presets** — Mono, Vintage, Punch, Cool, Warm, Faded, Negative, each chip previewing
  the current image under that look
- **Convert** — export as PNG, JPEG or WebP with a quality slider and live size estimate
- **Batch** — apply the current adjustments, format and quality to every loaded image,
  optionally capping the longest side
- **Undo / Revert** — undo crops, or go back to the untouched original

## How editing works

Adjustments and rotation are applied at draw time, so they are non-destructive — move a
slider back and the original pixels return. Cropping is the one destructive step: it bakes
the current geometry into a new source image and pushes the old one onto the undo stack.
Everything is rendered at full resolution on export, no matter how small the preview is.

## Notes

- Preview renders are capped at 1400 px on the longest side for speed; exports always use
  the full size shown under the image.
- WebP encoding depends on the browser. Chrome, Edge and Firefox all support it; if an
  export comes back empty, switch to PNG or JPEG.
- JPEG has no transparency, so transparent areas are flattened onto white. Tick
  *Flatten transparency* to do the same for PNG/WebP.

## Stack

Vite + vanilla JS, Canvas 2D. No runtime dependencies.
# image-editor
