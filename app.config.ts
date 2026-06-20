export default defineAppConfig({
  ui: {
    // primary maps to the brand teal (--color-accent #00c2a8) so UButton's
    // default solid style matches the logo/markets instead of generic green.
    // success stays green — that's a semantic PnL/bid color, separate from brand.
    colors: {
      primary: 'teal',
      success: 'green',
      warning: 'yellow',
      error: 'red',
      neutral: 'slate',
    },
  },
  uiPro: {},
})
