# SpammerZ

> Bulk submit Google Forms with random answers. Serverless Chrome extension.

![SpammerZ](icons/icon128.png)

---

## What is SpammerZ?

SpammerZ is a Chrome browser extension that automates Google Form submissions. It parses any public Google Form, lets you configure answer randomization, and submits hundreds of responses automatically.

**Completely serverless** — all processing happens in your browser. No accounts, no credits, no subscriptions.

---

## Features

- **No server needed** — runs entirely in your browser
- **Reliable parsing** — extracts form data from Google's own internal JSON (FB_PUBLIC_LOAD_DATA_)
- **All question types** — short text, paragraph, multiple choice, checkbox, dropdown, linear scale, date, time, grid
- **Randomization** — uniform random or weighted percentages
- **Configurable delay** — with optional jitter (±50%), default 500ms
- **Live progress** — real-time submission counter
- **Enable/Disable toggle** — hide the UI to use the form normally
- **State persistence** — remembers settings across sessions
- **Live form preview** — fills the real Google Form DOM for preview
- **Minimized progress pill** — keep progress visible while you work

---

## Installation

### 1. Download / Clone

```bash
# Clone or download this repository
git clone https://github.com/yourusername/spammerz.git
# Or just copy the spammerz folder
```

### 2. Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **"Load unpacked"**
4. Select the `spammerz` folder
5. The extension is ready!

### 3. (Optional) Pin the extension

Click the puzzle piece icon in Chrome's toolbar → find SpammerZ → click the pin icon to keep it visible.

---

## How to Use

### 1. Open a Google Form

Navigate to any **public** Google Form. Private forms (requiring login) cannot be parsed.

### 2. Workspace UI Appears

The form loads with SpammerZ's workspace:

- **Left** — Submission & General settings
- **Middle** — Live Google Form (real DOM)
- **Right** — Configure Weights (%)

### 3. Configure Answers

For each question:

- **Checkboxes / MCQ / Dropdown / Scale**: Set weight percentages
- **Sliders** control selection weight per option

### 4. Set Submission Settings

- **Submissions** — How many responses to submit (default: 100)
- **Delay (ms)** — Wait time between submissions (default: 500ms)
- **Randomize delay** — Add ±50% jitter to prevent rate limiting

### 5. Click "Start Submitting"

- Progress modal shows live counter
- Click **Stop** to cancel mid-run
- Use **_** to minimize into a floating pill
- Completion dialog shows results and lets you submit again

### 6. Disable When Not Needed

Click the **✕ button** in the top-right header to disable. The workspace hides and you can use the form normally. Click the floating **⚡ SpammerZ** button to re-enable.

---

## Privacy

SpammerZ:
- Operates entirely in your browser
- Does NOT send data to any server
- Does NOT track or log your submissions
- Does NOT require any permissions beyond what's necessary

Your submissions go directly to Google Forms' servers, just like a normal form submission.

---

## Known Limitations

| Issue | Details |
|---|---|
| Private forms | Cannot parse forms that require login |
| reCAPTCHA | Detected forms may block submissions |
| No-cors responses | Cannot confirm 100% if submission succeeded |
| Rate limiting | Google may throttle rapid submissions |

---

## Colors / Theme

| Element | Color |
|---|---|
| Background | `#000000` (black) |
| Accent | `#39ff14` (neon green) |
| Text | `#ffffff` (white) |

---

## File Structure

```
spammerz/
├── manifest.json              ← Chrome extension config
├── content/
│   └── content.js             ← Main logic (all-in-one)
├── ui/
│   ├── panel.js               ← UI components
│   └── panel.css              ← Dark neon styling
├── background/
│   └── service-worker.js       ← Background persistence
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Troubleshooting

### UI not appearing?
1. Make sure the form is public
2. Check Chrome DevTools console (`F12`) for `[SpammerZ]` errors
3. Reload the extension in `chrome://extensions/`

### Submissions not going through?
1. Increase delay to 2000-3000ms
2. Wait 15-30 minutes (Google may have rate limited your IP)
3. Make sure the form is public

### Error: "Could not parse form"
- The form may require login (not public)
- Try opening the form in an incognito window

---

## Share With Friends (No Store)

### Option A: Load Unpacked (Recommended)
1. Zip the extension folder (the one containing `manifest.json`)
2. Your friend unzips it locally
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked** and select the folder

### Option B: Pack as CRX
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Pack extension**
4. Select the extension folder (with `manifest.json`)
5. Leave **Private key** blank the first time

Chrome will generate:
- `spammerz.crx` (share this)
- `spammerz.pem` (private key, keep safe)

Install on another machine:
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Drag the `.crx` onto the page

Note: Some Chrome versions block CRX installs unless allowed by policy. If blocked, use **Option A**.

---

## License

MIT — Do whatever you want with it.

---

## Credits

Built with vanilla JavaScript, HTM, and dark neon aesthetics.