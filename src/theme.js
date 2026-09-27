import { ThemeEngine } from '@themeloom/core'
import { retro80s } from '@themeloom/themes-classic'

/**
 * The app runs on one themeloom theme rather than a hand-rolled palette.
 *
 * A theme is a whole design contract — colour, type, shape and motion — so
 * style.css maps its own variables onto the `--pt-*` custom properties the
 * engine writes, and every rule downstream follows. Swapping theme is a
 * one-line change here plus `data-theme` in index.html, which is set up front
 * so the first paint is already correct.
 *
 * Deliberately *not* themed: anything drawn on top of the user's image — the
 * crop overlay, the crop handles, the transparency checkerboard. Those have to
 * stay legible against an arbitrary photograph, which a themed accent cannot
 * promise.
 */
export const theme = retro80s

export const engine = new ThemeEngine({
  themes: [theme],
  default: theme.id,
  // Nothing to remember: the app ships one theme, not a picker.
  persist: false,
})
