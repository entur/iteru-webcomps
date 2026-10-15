import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming/create';
// Named import, not the default: esbuild emits a named export per top-level JSON
// key and tree-shakes the rest, so the manager bundle carries the version string
// instead of the whole package.json.
import { version } from '../package.json';

/**
 * Manager (sidebar/toolbar chrome) config — distinct from `preview.tsx`, which
 * themes the *rendered stories*. The palette here mirrors the preview theme so
 * the frame and the canvas read as one surface.
 *
 * The brand block doubles as the guide link: `brandUrl` makes the whole title
 * an anchor. It is the published absolute URL, not a relative `../guide.html`,
 * because Storybook is served from `/storybook/` on Pages but from `/` in
 * `storybook dev` — only the absolute form works in both.
 */
const GUIDE_URL = 'https://entur.github.io/iteru-webcomps/guide.html';
const TEAL = '#11616f',
  RUST = '#e8663d';
const APP_BG = '#f4f1ea',
  INK = '#1c1b19',
  MUTED = '#6b6862',
  LINE = '#e6e2da';
const SANS = '"IBM Plex Sans", system-ui, sans-serif';
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';

/**
 * `brandTitle` is rendered as HTML, so the version rides along as a second line.
 * Storybook lays the brand slot out as a flex *row*, so the two lines need their
 * own column wrapper — `display:block` on the second span alone just parks it
 * beside the first. `nowrap` keeps the package name off two lines in the ~150px
 * sidebar header.
 */
const brandTitle = `
  <span style="display:flex;flex-direction:column;line-height:1.3;font-family:${MONO};white-space:nowrap">
    <span style="font-size:.74rem;letter-spacing:-.01em">@entur/iteru-webcomps</span>
    <span style="font-size:.64rem;color:${MUTED}">v${version} &middot; host guide &rarr;</span>
  </span>`;

addons.setConfig({
  theme: create({
    base: 'light',
    brandTitle,
    brandUrl: GUIDE_URL,
    brandTarget: '_blank',
    colorPrimary: RUST,
    colorSecondary: TEAL,
    appBg: APP_BG,
    appContentBg: '#ffffff',
    appBorderColor: LINE,
    appBorderRadius: 8,
    barSelectedColor: TEAL,
    barHoverColor: TEAL,
    textColor: INK,
    textMutedColor: MUTED,
    fontBase: SANS,
    fontCode: MONO,
  }),
});
