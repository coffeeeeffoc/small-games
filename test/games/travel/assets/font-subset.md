# Local UI fonts

Downloaded from the official Google Fonts CSS2 service on 2026-09-12. These WOFF2 files contain a 560-codepoint text subset: the unique non-ASCII characters in `index.html`, `app.mjs`, and `game-state.mjs`, plus printable ASCII U+0020 through U+007E.

- `noto-sans-sc.woff2`: Noto Sans SC, normal style, weight 400, 72984 bytes.
- `noto-serif-sc.woff2`: Noto Serif SC, normal style, weight 600, 97080 bytes.

The matching `*-OFL.txt` license files were downloaded from `https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt` and `https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt`.

CSS to place in the project-root stylesheet:

```css
@font-face{font-family:'Noto Sans SC';font-style:normal;font-weight:400;font-display:swap;src:url('./assets/noto-sans-sc.woff2') format('woff2')}
@font-face{font-family:'Noto Serif SC';font-style:normal;font-weight:600;font-display:swap;src:url('./assets/noto-serif-sc.woff2') format('woff2')}
```

These are static font weights, not variable fonts. Other requested weights use browser matching/synthesis. Additional UI characters fall back to the configured system font; regenerate the text subset if new copy must retain exactly the same typeface.
