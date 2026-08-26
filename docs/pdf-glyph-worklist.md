# PDF glyph migration work list

PDF export draws block symbols from `src/lib/export/blockGlyphs.ts`. Symbols
that Helvetica can render (WinAnsiEncoding) are drawn as vector text. Everything
below currently falls back to a **canvas-rasterised bitmap** or a text stand-in.

Replacing these with authored SVG glyphs would make every block fully vector and
let `src/lib/export/browserGlyphs.ts` be deleted.

Generated from `glyphWorkList()` — regenerate rather than editing by hand.

**27 block types** need attention.

## Tabler icon components (7)

The canvas renders these with a React icon component. PDF currently substitutes
a short text label. Extracting the icon's SVG path data would resolve them.

| Block type | Canvas icon |
|---|---|
| `clock` | Tabler IconClockCog |
| `integrator` | Tabler IconMathIntegral |
| `limit` | Tabler IconMathMaxMin |
| `no_connection` | Tabler IconX |
| `signal_display` | Tabler IconChartCovariate |
| `signal_logger` | Tabler IconFileTypeCsv |
| `subsystem` | Tabler IconCube |

## Bespoke SVG on canvas (4)

Drawn with purpose-built SVG (fractions, plotted curves). These need equivalent
vector drawing routines in the PDF renderer; none is difficult, but each is
custom.

| Block type | Notes |
|---|---|
| `discrete_transform` | bespoke SVG on canvas |
| `lookup_1d` | bespoke SVG on canvas |
| `lookup_2d` | bespoke SVG on canvas |
| `transfer_function` | bespoke SVG on canvas |

## Symbols outside WinAnsiEncoding (14)

The glyph exists as text but Helvetica cannot encode it, so it is rasterised.

| Block type | Symbol (codepoints) |
|---|---|
| `body2quaternion_rates` | ω→q̇ (U+03C9 U+2192 U+0307) |
| `data_store_read` | DS↑ (U+2191) |
| `data_store_write` | DS↓ (U+2193) |
| `demux` | ▥ (U+25A5) |
| `edge_detect` | ⌃ (U+2303) |
| `mag` | ‖v‖ (U+2016 U+2016) |
| `matrix_multiply` | ⊗ (U+2297) |
| `mux` | ▦ (U+25A6) |
| `rate_limiter` | d/dt⊏ (U+228F) |
| `sheet_label_sink` | ↓ (U+2193) |
| `sheet_label_source` | ↑ (U+2191) |
| `sum` | ∑ (U+2211) |
| `transpose` | Aᵀ (U+1D40) |
| `unit_delay` | z⁻¹ (U+207B) |

## Labels built at runtime (2)

The displayed label is derived from block parameters and can contain characters
the static table does not reveal.

| Block type | Notes |
|---|---|
| `orientation_conversion` | E→DCM, q→DCM, … (U+2192) |
| `units_conversion` | deg→rad, m/s→kts, … (U+2192); ~90 conversion labels |
