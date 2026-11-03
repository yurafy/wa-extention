# WhatsApp Business Bulk Chat & Media Exporter (Chrome Extension MV3)

A high-performance, privacy-first Google Chrome extension (Manifest V3) for exporting WhatsApp Business and standard WhatsApp conversations, contacts, messages, and media directly from WhatsApp Web (`https://web.whatsapp.com`).

Built specifically for local execution with **zero external servers, telemetry, or cloud transmission**. Designed to process **2,000+ conversations** safely inside the user's browser without memory leaks or UI freezes.

---

## Key Features

- **Strict Per-Contact Folder Isolation (Section 7)**:
  Every conversation is saved into its own dedicated folder (`WhatsApp-Business-Export/contacts/{phone}_{name}/`) containing `contact.json`, `messages.json`, `messages.csv`, and segregated media subdirectories (`images/`, `videos/`, `audio/`, `documents/`, `stickers/`). Data from different conversations is never mixed.
- **100% Local & Private Processing (Section 10)**:
  Zero telemetry, zero remote servers. All operations happen in the user's local browser context using IndexedDB (`Dexie.js`) and in-browser ZIP generation. Session keys, passwords, and tokens are never read or stored.
- **High-Capacity Bulk Engine**:
  Engineered for 2,000+ conversations with configurable ZIP splitting (e.g. 50 contacts per ZIP), pause/resume, error checkpoints, and background recovery.
- **Modern Responsive Dashboard**:
  Built with React, TypeScript, and Tailwind CSS. Features live WhatsApp Web session monitoring, progress percentage, ETA calculation based on real processing speed, search/filtering, and granular configuration controls.

---

## Required Permissions Explained

The extension requests only minimal permissions strictly necessary for its local functions:

| Permission | Justification |
| :--- | :--- |
| `storage` | Stores user export preferences, UI state, and local configuration cache. |
| `downloads` | Saves the generated ZIP archives directly to the user's local Downloads folder without cloud intermediaries. |
| `tabs` | Detects whether WhatsApp Web (`https://web.whatsapp.com`) is currently open and provides quick tab switching. |
| `host_permissions: ["https://web.whatsapp.com/*"]` | Injects the content script on WhatsApp Web to read accessible chat list items and messages. |

---

## Local Installation Guide (Developer Mode)

The extension is packaged for private use and does not require the Chrome Web Store.

### Option A: Install from Unpacked Folder (Recommended for Developers)

1. Clone or extract this repository to your computer.
2. In Google Chrome, navigate to `chrome://extensions`.
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **Load unpacked** button in the top-left toolbar.
5. Select the `dist` folder located inside this project directory (`c:\Users\pc\Desktop\wa-extention\dist`).
6. The extension **"WhatsApp Business Bulk Chat & Media Exporter"** is now installed!

### Option B: Install from Distributable ZIP Archive

1. Locate the pre-built `wa-business-bulk-chat-media-exporter.zip` in the root folder.
2. Extract the ZIP archive into a folder on your computer.
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the extracted folder.

---

## How to Use the Extension

1. **Open WhatsApp Web**: Go to [https://web.whatsapp.com](https://web.whatsapp.com) and log into your WhatsApp Business or personal account.
2. **Launch Dashboard**: Click the extension icon in Chrome's extensions toolbar. You can use it as a popup or click **"Full Tab"** in the top header for a full-screen view.
3. **Session Indicator**: The header displays a real-time status badge:
   - 🟢 **WhatsApp Web Ready**: Session is authenticated and ready to scan.
   - 🟡 **Awaiting QR Login**: WhatsApp Web is open but awaiting QR scan.
   - 🔴 **WhatsApp Tab Closed**: Click **"Open WhatsApp"** to open it immediately.
4. **Scan Chats**: Click **"Scan Chats"** to discover accessible conversations.
5. **Select & Configure**: Choose specific conversations or click **"Export All"**. Adjust ZIP size and media preferences in **Settings**.
6. **Download ZIP**: Download the cleanly formatted archive.

---

## Build & Test Instructions

### Prerequisites
- Node.js (v18+)
- npm

### Development & Build Commands

```bash
# Install dependencies
npm install

# Run unit tests (Vitest)
npm test

# Build extension into /dist
npm run build

# Build and package installable ZIP
npm run build:all
```

---

## Project Structure

```text
wa-extention/
├── dist/                                  # Production extension build (ready for Chrome)
├── public/
│   ├── manifest.json                      # Manifest V3 configuration
│   └── icons/                             # Extension icons (16px, 48px, 128px)
├── src/
│   ├── background/
│   │   └── index.ts                       # MV3 Service Worker (tab router, messaging)
│   ├── content/
│   │   └── index.ts                       # WhatsApp Web content script & status detector
│   ├── dashboard/
│   │   ├── main.tsx                       # React root entry
│   │   ├── App.tsx                        # Main dashboard state & orchestration
│   │   └── components/
│   │       ├── Header.tsx                 # Status indicator, tab actions, toolbar
│   │       ├── StatsOverview.tsx          # Key metrics, progress bar, speed & ETA
│   │       ├── ActionToolbar.tsx          # Scan, Export, Pause, Resume, Filters
│   │       ├── ChatTable.tsx              # Searchable conversations table with badges
│   │       ├── ExportConfigModal.tsx      # Archive splitting & media format settings
│   │       ├── ConsentBanner.tsx          # Section 10 Privacy disclosure banner
│   │       ├── ClearDataModal.tsx         # IndexedDB purge confirmation dialog
│   │       └── LogViewer.tsx              # Real-time operation & error logs drawer
│   ├── storage/
│   │   ├── db.ts                          # Dexie.js IndexedDB schema definition
│   │   ├── chatRepository.ts              # CRUD, search, filtering, and stats queries
│   │   ├── messageRepository.ts           # Chronological message storage & deduplication
│   │   ├── settingsRepository.ts          # Preferences persistence
│   │   └── logRepository.ts               # Local activity logging
│   ├── types/
│   │   ├── index.ts                       # Core domain entities (Chat, Message, Media)
│   │   └── messaging.ts                   # Chrome runtime message definitions
│   ├── utils/
│   │   ├── sanitizer.ts                   # Filename, phone number, and path traversal safety
│   │   ├── pathBuilder.ts                 # Mandatory Section 7 folder structure generator
│   │   ├── formatters.ts                  # ETA calculation, speed rate, bytes formatting
│   │   └── csv.ts                         # RFC 4180 compliant CSV generator
│   └── styles/
│       └── index.css                      # Tailwind CSS & custom scrollbars
├── tests/
│   ├── setup.ts                           # Vitest setup & fake-indexeddb
│   ├── storage.test.ts                    # IndexedDB repository unit tests
│   ├── sanitizer.test.ts                  # Sanitizer & traversal attack tests
│   ├── pathBuilder.test.ts                # Section 7 folder structure tests
│   ├── chronology.test.ts                 # Chronological sorting & deduplication tests
│   ├── progress.test.ts                   # Speed calculation & ETA tests
│   └── csv.test.ts                        # CSV formatting tests
├── dashboard.html                         # Dashboard HTML entry
├── vite.config.ts                         # Vite configuration (Dashboard & Background)
├── vite.content.config.ts                 # Vite IIFE configuration (Content script)
├── vitest.config.ts                       # Vitest configuration
├── tailwind.config.js                     # Tailwind CSS configuration
└── package.json
```
