# Smoke Tests

End-to-end Playwright tests that launch Chromium with the unpacked extension and verify the profile proposal Apply pipeline.

## Setup

```bash
npm install
npx playwright install chromium
```

## Run

```bash
# Headless (default)
npm run test:smoke

# Headed (visible browser)
npm run test:smoke:headed
```

## What They Test

11 smoke tests verify the full profile Apply safety path:

| Test | What it covers |
|---|---|
| skills add + undo | Successful apply, confirm dialog, storage update, undo restore |
| summary update + undo | Summary change, summaries[] not modified, undo restore |
| duplicate skill blocked | Duplicate warning, Apply disabled, profile unchanged |
| certification add + undo | Cert name/issuer/year preserved, undo restore |
| duplicate certification blocked | Duplicate blocked, profile unchanged |
| experience add + readiness | Experience proposal renders readiness panel |
| incomplete experience blocked | Missing details blocks Apply |
| duplicate experience blocked | Duplicate blocks Apply |
| cancel dialog prevents apply | Dismissing confirm dialog leaves profile unchanged |
| locked skills blocks apply | Locked section blocks Apply, profile unchanged |
| stale fingerprint blocks apply | Storage mutation between review and Apply blocks save |

## How It Works

- Launches Chromium via `chromium.launchPersistentContext` with `--load-extension`
- Discovers extension ID via CDP `Target.getTargets`
- Opens `dashboard/dashboard.html?mode=full`
- Seeds `chrome.storage.local` with mock provider + test profile
- Interacts with Job Chat, Preview Changes, Review Apply Requirements
- Verifies Apply/Undo flow and `chrome.storage` mutations
- Uses mock AI provider (no API keys needed)
