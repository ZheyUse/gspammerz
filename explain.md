# How to Build a Serverless Google Form Spammer Extension

> **TL;DR** — A Chrome extension that reads a Google Form, fills it with random answers, and submits it 100+ times. No server, no backend, no subscriptions. Just JavaScript running in your browser.

---

## What Are We Building?

A Chrome browser extension that:

1. Detects when you're on a Google Form page
2. Reads all the questions and answer options from the page
3. Loops X times (e.g., 100 times)
4. Each loop: randomly picks answers, fills the form, submits it
5. Adds delays between submissions to avoid getting banned
6. Done. Everything happens in your browser.

**No server. No API. No credits. No login.**

---

## Prerequisites

What you need to know (a little) and what you need to install:

### Knowledge (Don't Panic — I'll Explain Everything)
- Basic JavaScript (variables, functions, loops, `for`/`setTimeout`)
- Basic HTML/CSS (just enough to read the popup UI)
- No prior Chrome extension experience needed

### Tools
- **Google Chrome** — To test your extension
- **Any text editor** — VS Code (recommended), Notepad++, even Notepad
- **An internet connection** — Google Forms need to actually receive submissions

That's it. No Node.js, no Python, no server, nothing else.

---

## How Google Forms Work (The Concept)

Before we build, you need to understand what actually happens when you fill out a Google Form.

### What Happens When You Click "Submit"

When you fill out a Google Form and click Submit:

1. **Your browser sends an HTTP POST request** to Google's servers
2. The POST body contains all your answers encoded as form data
3. Google receives it, adds it to the spreadsheet linked to that form

Here's what that POST request looks like:

```
POST https://docs.google.com/forms/d/e/YOUR_FORM_ID/formResponse

Content-Type: application/x-www-form-urlencoded

entry.1234567890=Answer+for+question+1
entry.0987654321=Answer+for+question+2
draftResponse=[]
pageHistory=0
fbzx=1234567890
```

### The Key Insight

Google Forms don't care if a human or a robot submitted the request. **If you can replicate that POST request, you can submit a form without ever opening the page.** That's what makes this possible — we're not actually "faking" a browser. We're just sending the same request Google Forms expects.

### The Form ID

Every Google Form has a unique ID in its URL:

```
https://docs.google.com/forms/d/e/1FAIpQLSfexampleIDHere/formResponse
                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                    This is the Form ID
```

Our extension needs to grab this ID to know where to send submissions.

### The Entry IDs

Each question in a form has its own `entry.XXXXXXXXX` field name. These are what you need to target:

```
entry.1234567890 = First question
entry.0987654321 = Second question
entry.1112223333 = Third question
```

Our extension needs to:
1. Parse the form page to find these entry IDs
2. Read what answer options exist for each question
3. Map them together

---

## Chrome Extension Basics

A Chrome extension is just a collection of files with a specific structure.

### File Structure

```
my-form-spammer/
├── manifest.json          ← "Hey Chrome, this is an extension"
├── popup.html             ← The popup window when you click the icon
├── popup.css              ← Styling for the popup
├── popup.js               ← Logic for the popup
├── content.js             ← Runs on Google Form pages
└── background.js          ← Manages long-running tasks (optional for this)
```

### The manifest.json

This is the most important file. It tells Chrome:

- What permissions we need
- Which scripts run where
- What the extension is called

```json
{
  "manifest_version": 3,
  "name": "Form Spammer",
  "version": "1.0",
  "permissions": [
    "activeTab"           // Access the current tab
  ],
  "host_permissions": [
    "*://docs.google.com/forms/*"   // Only run on Google Forms
  ],
  "action": {
    "default_popup": "popup.html"  // What shows when you click the icon
  }
}
```

### The Three Parts Explained

**1. Content Script (`content.js`)**

This file runs **inside** the Google Form page. It can:
- Read the page's HTML (the form structure)
- Find all questions and answer options
- Fill in and submit the form

It has access to the page's DOM (the HTML structure).

**2. Popup (`popup.html/js`)**

This is the small window that appears when you click the extension icon in Chrome's toolbar. It provides the user interface to:
- Enter how many submissions you want
- Set delay between submissions
- Click "Start" or "Stop"

**3. Background Script (`background.js`)**

Optional for our use case. It handles things that need to persist or run independently. For a simple spammer, we can skip this or keep it minimal.

---

## Step-by-Step Implementation

### Step 1: Create the Project Folder

Create a new folder somewhere on your computer:

```
C:\Users\You\Documents\FormSpammer\
```

All your files will go in here.

---

### Step 2: Create manifest.json

Create a file named `manifest.json` in your folder:

```json
{
  "manifest_version": 3,
  "name": "Form Spammer",
  "version": "1.0",
  "description": "Bulk submit Google Forms with random answers",
  "permissions": [
    "activeTab"
  ],
  "host_permissions": [
    "*://docs.google.com/forms/*"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Spam Forms"
  },
  "content_scripts": [
    {
      "matches": ["*://docs.google.com/forms/*"],
      "js": ["content.js"]
    }
  ]
}
```

**What this does:**
- `manifest_version: 3` — Use the modern Chrome extension format
- `host_permissions` — Only activate on Google Forms pages
- `action` — Shows a popup when you click the icon
- `content_scripts` — Automatically run `content.js` on Google Forms

---

### Step 3: Create popup.html

This is the user interface. Create `popup.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <h2>Form Spammer</h2>

  <label>Number of submissions:</label>
  <input type="number" id="count" value="100" min="1" max="1000">

  <label>Delay between (seconds):</label>
  <input type="number" id="delay" value="2" min="0" step="0.5">

  <button id="startBtn">Start</button>
  <button id="stopBtn" disabled>Stop</button>

  <div id="status">Ready</div>

  <script src="popup.js"></script>
</body>
</html>
```

Simple form with:
- Input for how many times to submit
- Input for delay between each submission
- Start/Stop buttons
- Status display

---

### Step 4: Create popup.css

Style it, add `popup.css`:

```css
body {
  width: 300px;
  padding: 15px;
  font-family: Arial, sans-serif;
  background: #f5f5f5;
}

h2 {
  margin-top: 0;
  color: #333;
}

label {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: #666;
}

input {
  width: 100%;
  padding: 8px;
  margin-top: 4px;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  width: 48%;
  padding: 10px;
  margin-top: 15px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

#startBtn {
  background: #4CAF50;
  color: white;
}

#startBtn:hover {
  background: #45a049;
}

#stopBtn {
  background: #f44336;
  color: white;
}

#stopBtn:hover {
  background: #da190b;
}

#stopBtn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

#status {
  margin-top: 15px;
  padding: 10px;
  background: white;
  border-radius: 4px;
  text-align: center;
  font-size: 14px;
}
```

Makes it look clean and readable.

---

### Step 5: Create popup.js

This handles the user interaction. Create `popup.js`:

```javascript
// When popup loads
document.addEventListener('DOMContentLoaded', function() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const status = document.getElementById('status');

  // Send "start" message when Start is clicked
  startBtn.addEventListener('click', async function() {
    const count = document.getElementById('count').value;
    const delay = document.getElementById('delay').value;

    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to content script
    chrome.tabs.sendMessage(tab.id, {
      action: 'start',
      count: parseInt(count),
      delay: parseFloat(delay) * 1000  // Convert to milliseconds
    });

    startBtn.disabled = true;
    stopBtn.disabled = false;
    status.textContent = 'Started...';
  });

  // Send "stop" message when Stop is clicked
  stopBtn.addEventListener('click', async function() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'stop' });

    startBtn.disabled = false;
    stopBtn.disabled = true;
    status.textContent = 'Stopped.';
  });

  // Listen for updates from content script
  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.action === 'update') {
      status.textContent = `${msg.current}/${msg.total}`;
    }
    if (msg.action === 'done') {
      status.textContent = 'Done! ' + msg.total + ' submitted.';
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
    if (msg.action === 'error') {
      status.textContent = 'Error: ' + msg.message;
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  });
});
```

**What this does:**
- Reads values from the inputs
- Sends a message to `content.js` with the settings
- Listens for updates to display progress
- Handles Start/Stop buttons

---

### Step 6: Create content.js (The Core Logic)

This is where the real work happens. Create `content.js`:

```javascript
// Variables to track our submission loop
let isRunning = false;
let shouldStop = false;

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener(function(msg) {
  if (msg.action === 'start') {
    startSpamming(msg.count, msg.delay);
  }
  if (msg.action === 'stop') {
    shouldStop = true;
  }
});

async function startSpamming(totalCount, delayMs) {
  // Reset state
  isRunning = true;
  shouldStop = false;
  let submitted = 0;

  // Step 1: Parse the form
  const formData = parseForm();
  if (!formData) {
    chrome.runtime.sendMessage({ action: 'error', message: 'Could not parse form' });
    return;
  }

  // Step 2: Loop!
  while (submitted < totalCount && !shouldStop) {
    // Generate random answers
    const answers = generateRandomAnswers(formData);

    // Submit the form
    const success = await submitForm(formData.formUrl, answers);
    if (success) {
      submitted++;
      // Update popup with progress
      chrome.runtime.sendMessage({ action: 'update', current: submitted, total: totalCount });
    }

    // Wait before next submission (unless this is the last one)
    if (submitted < totalCount && !shouldStop) {
      await sleep(delayMs);
    }
  }

  // We're done
  isRunning = false;
  chrome.runtime.sendMessage({ action: 'done', total: submitted });
}

function parseForm() {
  // Get the form URL (we need this for the endpoint)
  const formUrl = window.location.href.split('/edit')[0].replace('/edit', '/formResponse');

  // Find all questions
  const questions = [];
  const inputs = document.querySelectorAll('input[type="text"], input[type="radio"], input[type="checkbox"], select, textarea');

  // Group inputs by their question
  let currentQuestion = null;

  inputs.forEach(input => {
    // Get the parent question container
    const container = input.closest('.freebirdFormviewerViewItemsItem');

    if (container !== currentQuestion) {
      currentQuestion = container;
      questions.push({
        id: null,
        type: null,
        options: []
      });
    }

    // Process based on input type
    if (input.type === 'text') {
      questions[questions.length - 1].id = input.name;
      questions[questions.length - 1].type = 'text';
    }
    // ... more types handled similarly
  });

  return { formUrl, questions };
}

function generateRandomAnswers(formData) {
  const answers = {};

  formData.questions.forEach(q => {
    switch (q.type) {
      case 'text':
        answers[q.id] = 'Random answer ' + Math.floor(Math.random() * 1000);
        break;
      case 'radio':
        const randomRadio = q.options[Math.floor(Math.random() * q.options.length)];
        answers[q.id] = randomRadio;
        break;
      case 'checkbox':
        // Randomly select some options
        q.options.forEach(opt => {
          if (Math.random() > 0.5) {
            answers[q.id + ' ' + opt] = opt;
          }
        });
        break;
      case 'dropdown':
        const randomDrop = q.options[Math.floor(Math.random() * q.options.length)];
        answers[q.id] = randomDrop;
        break;
    }
  });

  return answers;
}

async function submitForm(url, answers) {
  try {
    const formData = new FormData();
    Object.entries(answers).forEach(([key, value]) => {
      formData.append(key, value);
    });

    await fetch(url, {
      method: 'POST',
      body: formData,
      mode: 'no-cors'  // Google Forms doesn't support CORS, so we use no-cors
    });

    return true;
  } catch (e) {
    console.error('Submission error:', e);
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**What this does, line by line:**

1. **`parseForm()`** — Reads the Google Form page HTML to find all questions and answer options. Extracts the `entry.XXXXXXX` field names for each question.

2. **`generateRandomAnswers()`** — For each question type:
   - Text fields: Generate a random string
   - Radio buttons: Pick a random option
   - Checkboxes: Randomly select some options
   - Dropdowns: Pick a random option

3. **`submitForm()`** — Sends a POST request to Google's form endpoint with the answers. `mode: 'no-cors'` is important because Google Forms doesn't allow cross-origin requests.

4. **`startSpamming()`** — The main loop that coordinates everything:
   - Parse the form once
   - Loop N times
   - Each iteration: generate random answers, submit, wait, repeat

---

## How to Load the Extension in Chrome

Now that you have all the files, let's test it:

1. Open **Google Chrome**
2. Go to `chrome://extensions/`
3. Toggle **Developer mode** (top right corner) to **ON**
4. Click **"Load unpacked"**
5. Select your `FormSpammer` folder
6. The extension icon appears in Chrome's toolbar

### How to Use It

1. Navigate to any Google Form
2. Fill out the form normally (with at least one valid submission) — this helps the extension understand the structure
3. Click the extension icon in Chrome's toolbar
4. Enter how many times to submit (e.g., 100)
5. Enter delay between submissions (in seconds, e.g., 2)
6. Click **Start**
7. Watch the status update as submissions go through
8. Click **Stop** if you need to cancel

---

## How Google Form Field IDs Work

This is the tricky part. Google Forms uses dynamically generated field names like `entry.1234567890`. You need to find these programmatically.

### Finding Input Fields

Google Forms uses these HTML patterns:

```html
<!-- Text input -->
<input type="text" name="entry.1234567890" ...>

<!-- Radio buttons (single choice) -->
<input type="radio" name="entry.0987654321" value="Option 1" ...>
<input type="radio" name="entry.0987654321" value="Option 2" ...>

<!-- Checkboxes (multiple choice) -->
<input type="checkbox" name="entry.1112223333" value="Choice A" ...>
<input type="checkbox" name="entry.1112223333" value="Choice B" ...>

<!-- Dropdown -->
<select name="entry.444555666">
  <option value="First">First</option>
  <option value="Second">Second</option>
</select>
```

Your `content.js` needs to:
1. Select all these inputs using `document.querySelectorAll`
2. Group them by their `name` attribute
3. Track which options are available for each question

### Reading Available Options

For radio buttons:
```javascript
document.querySelectorAll('input[name="entry.0987654321"]');
// Returns: [input[Option 1], input[Option 2], input[Option 3]]
```

For dropdowns:
```javascript
const select = document.querySelector('select[name="entry.444555666"]');
const options = select.querySelectorAll('option');
// options[0].value = "First"
// options[1].value = "Second"
```

---

## Understanding the Submission Flow

Here's exactly what happens when we submit:

```
Browser creates a FormData object:
  entry.1234567890: "Some random text answer"
  entry.0987654321: "Option 2"
  entry.1112223333: "Choice A"
  entry.444555666: "Second"

Browser sends:
  POST https://docs.google.com/forms/d/e/ABC123/formResponse
  Content-Type: application/x-www-form-urlencoded

Google receives it and adds to the spreadsheet — just like if you submitted it manually
```

The `mode: 'no-cors'` setting in `fetch()` is key. It tells the browser to send the request even though Google won't send back a "success" response (Google Forms responds with a redirect that CORS would block). We don't care about the response — we just need the request to go through.

---

## Dealing with Rate Limits

Google has protections against abuse. To avoid getting blocked:

### What's Working (and What's Not)

| Technique | Effectiveness |
|---|---|
| Random delays between submissions | ✅ Essential |
| Randomizing answers | ✅ Essential |
| Different answer patterns | ✅ Helps |
| Proxy IPs | ✅ Most effective but complex |
| Using different Google accounts | ❌ Not needed — Google doesn't auth forms |

### Recommended Settings

- **Delay: 2-5 seconds** between submissions
- **Maximum: 100-200** before taking a break
- **Randomize answers** — never submit the same pattern twice in a row

If you get a CAPTCHA or "too many requests" message, wait 15-30 minutes and reduce your speed.

---

## Improving the Extension

Once you have the basic version working, here are enhancements:

### 1. Save Answer Profiles
```javascript
// Instead of random answers, use predefined profiles
const profiles = [
  { q1: 'Yes', q2: 'Very satisfied', q3: 'Option A' },
  { q1: 'No', q2: 'Dissatisfied', q3: 'Option C' },
];
```
Cycle through these instead of pure randomness.

### 2. Skip Certain Questions
Some surveys have "required" questions you want to ignore. Add logic to check:
```javascript
if (input.hasAttribute('aria-required')) {
  // Always fill required fields
}
```

### 3. Progress Persistence
Save progress across page refreshes:
```javascript
chrome.storage.local.set({ submitted: 47, total: 100 });
```

### 4. Auto-Detect Form Structure on Load
Instead of requiring you to click the extension first, auto-detect and show a floating button on Google Forms:
```javascript
if (window.location.hostname.includes('docs.google.com/forms')) {
  // Inject a floating toolbar
}
```

### 5. Handle Different Question Types
Google Forms has more question types:

| Question Type | HTML Element | Handling |
|---|---|---|
| Short answer | `<input type="text">` | Random string |
| Paragraph | `<textarea>` | Random sentence |
| Multiple choice | `<input type="radio">` | Pick random option |
| Checkboxes | `<input type="checkbox">` | Pick subset randomly |
| Dropdown | `<select>` | Pick random option |
| Linear scale | Radio buttons with numbers | Pick number in range |
| Grid | Multiple radio groups | One pick per row |
| Date | Date picker | Generate valid date |
| Time | Time picker | Generate valid time |

---

## File Summary

Here's your complete file tree:

```
FormSpammer/
├── manifest.json     ← Chrome extension config
├── popup.html       ← User interface
├── popup.css        ← Popup styling
├── popup.js         ← Popup logic (Start/Stop button handling)
└── content.js      ← Core logic (parse form, randomize, submit)
```

---

## Troubleshooting

### "Extension could not be loaded"
- Make sure `manifest.json` has valid JSON (no trailing commas)
- Make sure `content_scripts` file path matches your actual filename

### "Form not being parsed"
- Open Chrome DevTools (F12) on the Google Form page
- Go to Console tab
- Paste this to debug selector issues:
  ```javascript
  document.querySelectorAll('input[name^="entry."]').length
  ```
- If it returns 0, Google's form structure may have changed

### "Submissions not going through"
- Check your network tab for failed requests
- Make sure `delayMs` isn't 0 and overwhelming the server
- Try increasing delay to 3-5 seconds
- Google may have rate-limited you — wait 30 minutes

### "Answers not appearing in the spreadsheet"
- Make sure the Form ID is correct (not the edit URL)
- Check if the form has a quiz/correct answers feature — those still accept any answer, just don't grade them
- Some Google Forms require you to be signed in to the same organization — this extension can't bypass that

---

## Summary

```
What it does:
1. Extension runs on Google Forms pages
2. Content script reads all questions and options from the page
3. User sets count (100) and delay (2 seconds) in popup
4. Click Start → content script loops:
   - Randomize answers for each question
   - Submit via fetch() POST
   - Wait 2 seconds
   - Repeat until 100 done
5. Done. All 100 entries in the form's spreadsheet.
```

Everything runs in your browser. No server. No account. No credits. Just JavaScript making HTTP requests that Google Forms was already designed to accept.

---

## Next Steps

1. Create the files listed above
2. Load the extension in Chrome
3. Test on a test form you create (so you can see the results)
4. Adjust the code as needed based on what works

The code above is intentionally simplified for learning. Once you understand the flow, you can refine it for any specific Google Form structure or question type you encounter.