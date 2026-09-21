# Tidemark

**Clear documents. Confident departures.**

Tidemark is the shipping document verification workspace. Its name connects the precision of a reference mark with the movement of maritime trade.

- **Mark:** three document lines rising toward a forward course. The reusable SVG lives in `src/components/Brand.tsx`; the favicon is `public/tidemark.svg`.
- **Palette:** sea green `#193d36`, warm ivory `#f6f5f0`, signal orange `#b34c28`, and peach `#efa07b` on dark surfaces. Semantic review and comparison colours retain their labels and icons.
- **Typography:** Manrope for headings, DM Sans for reading and controls, IBM Plex Mono for references and small editorial labels. System fallbacks are included.
- **Illustration:** fine chart grids, tide contours, and a receive–verify–proceed course line. Use as supporting artwork, never as a live-data chart.
- **Voice:** calm, precise, and human. Brand headlines can reference a clear course; document instructions should state the concrete action.
- **Implementation:** `src/styles/brand.css` extends the existing shared components, with light, dark, tablet, and mobile treatments. The `/design-system` screen shows resolved colour tokens and component examples.

The legacy `sdvs.theme` and `sdvs.role` preference keys remain in place to preserve existing demo preferences. Display text and generated export filenames use Tidemark.
