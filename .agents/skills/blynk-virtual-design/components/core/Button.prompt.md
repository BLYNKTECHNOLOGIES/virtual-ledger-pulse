The standard Blynk action control — one `primary` per view, everything else `secondary` or `ghost`.

```jsx
<Button iconRight="arrow-right">Request a demo</Button>
<Button variant="secondary" iconLeft="play">Watch the tour</Button>
<Button variant="ghost" size="sm">Cancel</Button>
```

Hover on `primary` deepens to `--cyan-600` and gains `--shadow-brand`; press scales to .985. Labels are sentence case, verb-first, never ALL CAPS.
