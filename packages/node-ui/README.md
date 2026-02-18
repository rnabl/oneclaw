# OneClaw Node UI

**Pure HTML + Vanilla JS** - Zero build dependencies, ~10KB total

## What It Is

A minimal web interface for OneClaw node configuration. No frameworks, no build step, just simple HTML/CSS/JS served by the daemon.

## Size Comparison

- **Vanilla HTML/CSS/JS**: ~10KB (3KB CSS + 7KB JS)
- **SvelteKit**: ~20KB compiled
- **React**: ~140KB

## Files

```
public/
├── index.html         (Dashboard)
├── setup.html         (Setup wizard)
├── receipts.html      (Receipt viewer)
└── static/
    ├── style.css      (~3KB - minimal styles)
    ├── dashboard.js   (~1.5KB - fetch & display config)
    ├── setup.js       (~2KB - wizard state machine)
    └── receipts.js    (~1KB - list receipts)
```

## Features

- **Dashboard**: View node status, config, LLM settings
- **Setup Wizard**: 4-step onboarding flow
- **Receipts**: List all workflow execution traces
- **Dark Mode Ready**: Uses system color scheme (optional)

## How It Works

The daemon serves these static files at `localhost:8787`. The JS modules make fetch calls to the daemon's API endpoints:

- `GET /config` - Node configuration
- `GET /receipts` - List receipts
- `POST /run` - Execute workflow

## Development

No build step needed! Just edit HTML/CSS/JS and refresh.

## Why Vanilla?

1. **Zero dependencies**: No npm packages, no vulnerabilities
2. **Instant load**: No bundle, no hydration, just HTML
3. **Easy to audit**: ~250 lines of JS total
4. **Works offline**: Can be served from any HTTP server

## Browser Support

Works in any browser from 2018+:
- Chrome 63+
- Firefox 60+
- Safari 11.1+
- Edge 79+

## Customization

Want to customize? Just edit the CSS. All styles are in `static/style.css` with clear class names.
