# Video spec

One `spec.json` per video, in `/Volumes/Extreme SSD/chatwoot-videos/<video>/`.

```json
{
  "title": "Chatwoot product tour",
  "config": { "accountId": 3, "email": "maya.chen@paperlayer.com" },
  "voice": { "stability": 0.45, "style": 0.25 },
  "music": { "file": "music.mp3", "volume": 0.06 },
  "sections": [
    { "id": "inbox",
      "card": { "accent": "blue", "icon": "inbox", "badge": "Omnichannel", "title": "Every conversation in one place", "sub": "optional line" },
      "setup": [ { "rails": "..." } ],
      "beats": [
        { "id": "list", "say": "Everything starts with the inbox.",
          "do": [ { "goto": "/app/accounts/{account}/dashboard" }, { "hover": { "text": "WhatsApp", "exact": false } } ],
          "focus": { "selector": ".conversations-list" }, "zoom": 1.25, "hold": 0.5 },
        { "id": "call", "say": "Calls come into the same inbox.",
          "scene": { "template": "call", "params": { } } }
      ] }
  ],
  "ending": { "accent": "blue", "line": "Every channel, one inbox." }
}
```

## config
| Key | Default | Notes |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | |
| `accountId` | `CW_ACCOUNT_ID` env | the video's own account (written by the seed); `{account}` in routes |
| `email` / `password` | `CW_EMAIL` / `CW_PASSWORD` env | the host agent; keep the password in the env, not the spec |
| `viewport`, `scale` | 1440x900, 2 | 2880x1800 frames, enough for 4K with zooms |
| `theme` | `light` | |
| `hide` | `[]` | extra selectors to hide (profiler badge and widget bubble are always hidden) |
| `login` | `true` | `false` for pages that need no session |

## section
| Key | Notes |
|---|---|
| `id` | file names; `--only` takes these |
| `card` | section card: `accent` (blue, purple, green, amber, yellow), `icon` (inbox, message, phone, tag, zap, sparkles, megaphone, book, puzzle, users), `badge`, `title`, `sub`. Omit for no card (the opening hook). The accent also colours the stage behind this section's footage |
| `setup` | steps run before the first beat and not shown (navigation, resets) |
| `beats` | in order |

## beat
| Key | Notes |
|---|---|
| `id` | file names |
| `say` | narration line (starts 0.35s into the beat; the beat lasts at least as long as the line) |
| `do` | steps, recorded. A leading `goto` becomes the beat's opening screen |
| `scene` | instead of `do`: a card template, `{ "template": "call", "params": {} }` |
| `focus` / `zoom` | target to push in on during the beat, zoom factor (default 1.3) |
| `hold` | extra seconds on the final screen |

## steps
`{ "goto": "/path" }` · `{ "click": target }` · `{ "hover": target }` · `{ "type": { "target": t, "text": "...", "every": 2, "replace": true } }` · `{ "press": "Enter" }` · `{ "scrollTo": target }` · `{ "snap": true }` (keep the current screen as a frame) · `{ "hold": 1.5 }` (seconds on the last frame) · `{ "wait": 500 }` (ms, not shown) · `{ "waitFor": target }` · `{ "eval": "js" }`
Staging: `{ "mock": { "urlIncludes": "/x", "method": "POST", "body": {} } }` answers matching API calls; `{ "rails": "ruby" }` runs in the local app (mocked request bodies in `ENV['CAPTURED']`).

## targets
`{ "text": "Resolve", "exact": false, "nth": 0, "within": "selector" }` · `{ "selector": "css" }` · `{ "testid": "x" }` · `{ "placeholder": "..." }` · `{ "rect": [x, y, w, h] }` (CSS px)
Text targets resolve to the clickable control around the text. Icon-only buttons need a selector.

## scene templates (`templates/cards/`)
- `call`: incoming, then ongoing with timer and recording waveform, then ended with player and transcript; optional `outbound`. Params: `caller {name, place, flag, phone, avatar}`, `agent`, `duration`, `thread`, `transcript [[who, text]]`, `outbound {name, place, flag, phone, avatar, line, thread}`. Avatars are file names in `assets/avatars/`.
- `section`, `ending`, `stage` are used by render.py directly.
New templates: set `window.DURATION` and `window.renderAt(t)` (see `base.js`); never use CSS timers, frames are rendered one by one.
