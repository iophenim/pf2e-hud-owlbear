# PF2e HUD — Owlbear Rodeo Extension

A Pathfinder 2nd Edition (Remaster) HUD for Owlbear Rodeo with:

- **Action Tracker** — 3-action economy (◆◆◆) + Reaction pip, with Slowed/Stunned modifiers and round counter
- **Condition Tracker** — All 34 PF2e Remaster conditions with icons, rules summaries, and value tracking for valued conditions (Frightened, Clumsy, etc.)
- **GM View** — Track conditions on any number of characters/NPCs simultaneously

State is stored in OBR metadata and **synced across the room** automatically.

---

## Project Structure

```
pf2e-hud/
├── index.html          ← Main HUD UI (action popover)
├── package.json
├── vite.config.js
├── src/
│   ├── main.js         ← OBR SDK integration + all UI logic
│   └── conditions.js   ← PF2e conditions data
└── public/
    ├── manifest.json   ← OBR extension manifest
    └── icons/
        └── icon.svg    ← Extension icon
```

---

## Setup & Development

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- npm or yarn

### Install dependencies
```bash
npm install
```

### Run locally (for development)
```bash
npm run dev
```

This starts a local dev server (default: `http://localhost:5173`).

To test in Owlbear Rodeo, you'll need to expose it with a tool like [ngrok](https://ngrok.com/):
```bash
ngrok http 5173
```

Then load the extension in OBR using the ngrok URL + `/manifest.json`.

### Build for production
```bash
npm run build
```

Output goes to `dist/`. Upload that folder to any static host.

---

## Hosting Options

You need a publicly accessible HTTPS URL to use the extension in OBR.

| Option | Cost | Notes |
|---|---|---|
| [Netlify](https://netlify.com) | Free | Drag-and-drop `dist/` folder |
| [Vercel](https://vercel.com) | Free | `vercel deploy --prod` |
| [GitHub Pages](https://pages.github.com) | Free | Push `dist/` to `gh-pages` branch |
| [Cloudflare Pages](https://pages.cloudflare.com) | Free | Connect your repo |

---

## Loading in Owlbear Rodeo

1. Host the extension (see above)
2. In Owlbear Rodeo, open a room
3. Click the **Extensions** button (puzzle piece icon, top-left)
4. Click **Add Extension**
5. Enter your manifest URL, e.g.:
   ```
   https://your-site.netlify.app/manifest.json
   ```
6. Click **Add** — the PF2e HUD icon (🔰) will appear in your room's action bar

---

## How to Use

### Players
- Open the HUD from the action bar
- **Actions tab**: Click diamond pips to mark actions as used; click the circle to use your Reaction. Use Slowed/Stunned steppers to apply condition penalties. "End Turn" resets actions and ticks down Frightened/Stun.
- **Conditions tab**: Search or scroll for a condition and click **+** to add it. Valued conditions (Frightened, Clumsy, etc.) get +/− steppers. Click the active chip's × to remove it.

### GM
- Same as players plus a **GM View** tab
- Add characters/NPCs by name, then click one to manage their conditions separately
- All GM data is saved to room metadata and persists across sessions

---

## Customization

All condition data lives in `src/conditions.js` — you can add homebrew conditions or adjust descriptions there.

The color palette uses CSS custom properties in `index.html` — swap the `--gold` and `--bg-*` values to retheme the HUD.

---

## License

MIT — use freely, modify, and share.
