Renders the official Blynk Virtual lockup from the supplied raster artwork — use it anywhere the brand signs a surface (headers, footers, login screens, slide corners).

```jsx
<Logo height={28} assetBase=".." />
<Logo tone="light" height={28} assetBase=".." />   {/* on ink/dark surfaces */}
<Logo variant="mark" height={24} assetBase=".." /> {/* app icon, favicon, tight nav */}
```

- `assetBase` must point at the design-system root; the component appends `/assets/…`.
- Clear space: at least the width of one mark block on all sides.
- Never recolour, stretch, outline, or add effects to the lockup. On busy imagery, place it on a solid ink or white plate rather than directly over the photo.
