# Anniversary Website — Local Preview & Deployment

A private, single-page anniversary surprise experience. No build step or dependencies required.

## Local Preview

Open `index.html` directly in any modern browser, **or** serve it locally for best results:

```bash
# Python 3
python3 -m http.server 8080
# then open http://localhost:8080
```

```bash
# Node.js (npx)
npx serve .
# then open the URL shown
```

## Deployment Options

### GitHub Pages
1. Push the `site/` folder contents to a GitHub repository.
2. Go to **Settings → Pages** and set the source to the `main` branch, `/` (root).
3. Your site will be live at `https://<username>.github.io/<repo>/`.

### Netlify Drop
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag and drop the `site/` folder.
3. Netlify will give you a live URL instantly.

### Any Static Host
Upload the contents of `site/` (index.html, styles.css, script.js, and assets/) to any static file host.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Entry point — the full single-page experience |
| `styles.css` | All visual styles, animations, and responsive layout |
| `script.js` | Scene management, transitions, and interactions |
| `assets/` | Folder for any future images or SVG artwork |
