# Shot spec

One `spec.json` per Notion page. `capture.mjs` writes `<id>.png` next to it and a `manifest.json`.

```json
{
  "config": { "urlRewrites": [["/captain/1/", "/captain/2917/"]] },
  "shots": [
    { "id": "02-connected-inboxes", "route": "/app/accounts/{account}/captain/1/inboxes",
      "viewport": { "width": 1440, "height": 520 } }
  ]
}
```

## config (all optional)
| Key | Default | Notes |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | |
| `accountId` | `1` | local account; `{account}` in routes |
| `theme` | `dark` | `light` also works |
| `viewport`, `scale` | 1440x900, 2 | |
| `displayHost` | `app.chatwoot.com` | `chat.paperlayer.com` for self-hosted shots |
| `displayAccountId` | `318452` | fake ID shown in the address bar |
| `urlRewrites` | `[]` | `[from, to]` pairs for other IDs in the path |
| `crop` | `null` (full window, Safari frame) | handbook default is to crop: set it per shot to the area the step is about (plain frame, no address); leave it off only for "where in the app" shots |
| `frame` | `true` | `false` = raw screenshot; per shot `frameStyle: "safari" or "plain"` overrides the automatic choice |
| `hide` | `[]` | extra selectors to hide |

## shot
| Key | Notes |
|---|---|
| `id` | file name |
| `route` | first page to open |
| `steps` | list, run in order (below) |
| `viewport` | override, e.g. a shorter height to avoid empty space |
| `crop` | `{ target, padding }`, or `null` for the full window |
| `url` / `urlBar: false` | force the address text, or drop the bar |
| `image` | frame an existing PNG instead of capturing (for screens taken by hand) |
| `annotations` | `box`, `highlight`, `arrow`, `spotlight`, `blur`, `svg` (`markup`, `anchor`, `dx`, `dy`, `width`). Default color is handbook red `#FE2500`; set `color: "#46A7F6"` (brand blue) for a secondary mark |

## steps
`{ "goto": "/path" }` · `{ "click": target }` · `{ "hover": target }` · `{ "type": { "target": t, "text": "..." } }` · `{ "press": "Enter" }` · `{ "wait": 500 }` · `{ "waitFor": target }` · `{ "scrollTo": target }` · `{ "eval": "js" }`
Staging: `{ "mock": { "urlIncludes": "/playground", "method": "POST", "body": {} } }` answers matching API calls; `{ "rails": "ruby" }` runs in the local app with the caught request bodies in `ENV['CAPTURED']`.

## targets
`{ "text": "Create", "exact": false, "nth": 0, "within": "selector" }` · `{ "selector": "css" }` · `{ "testid": "x" }` · `{ "placeholder": "..." }` · `{ "rect": [x, y, w, h] }`
Text targets resolve to the clickable control around the text. Icon-only buttons need a selector, e.g. `main button:has(.i-lucide-chevron-down)`.

## Known recipes
- Captain assistant switcher: click `main button:has(.i-lucide-chevron-down)`, then text `Create Assistant`.
- Playground reply (no AI key): mock `/playground`, type the question, press Enter, then a `rails` step calling `ActionCableBroadcastJob.perform_now([user.pubsub_token], 'captain.playground.response', { response: '...', account_id: 1, request_id: <caught request_id> })`.
