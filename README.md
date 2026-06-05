# Case Art Organizer 🎨

**Case Art Organizer** is a secure, local desktop utility app designed to aggregate creative assets across case folders in your Dropbox (or local workspace) into a consolidated sorting folder (`ART TEMP`). 

It automates file gathering, safely handles filename conflicts, and renders instant `.png` previews for Photoshop (`.psd`) and Illustrator (`.ai`) files (on macOS).

---

## Download

Grab the latest installer for your platform — no Node.js, terminal, or developer setup required:

| Platform | Download |
|----------|----------|
| **macOS** | [Case Art Organizer.dmg](https://github.com/JameyStiling/case-assets/releases/latest) |
| **Windows** | [Case Art Organizer Setup.exe](https://github.com/JameyStiling/case-assets/releases/latest) |

> [!TIP]
> Go to the [**Releases page**](https://github.com/JameyStiling/case-assets/releases) to see all versions. Each release includes pre-built installers attached as downloadable assets.

---

## Key Features

*   **Safe Copy Operations (Data Protection)**: To protect your original casework, the app executes **copy-only** operations. Your source files are never moved, renamed, or deleted.
*   **Intelligent Collision Handling**: Aggregating files from multiple folders "loose" into a single directory normally causes naming collisions. The backend automatically detects duplicate names and appends the source case folder name as a suffix (e.g. `logo_[Case_01_CarCrash].psd`), resolving subsequent increments if conflicts persist.
*   **Cross-Platform Support**: Built to run on both macOS and Windows. Remote downloads, zip extractions, scans, and collision resolution work natively on both.
*   **Automatic PSD & AI Previews (macOS only)**: Instantly generates high-fidelity PNG preview thumbnails of `.psd` (Photoshop) and `.ai` (Illustrator) files side-by-side with the copied assets using macOS native engines (`qlmanage` and `sips`). On Windows, the app gracefully skips preview generation while copying all source files successfully.
*   **Secure Code Warrior Integration**: Strictly validates file paths using `path.resolve()` and `startsWith()` checks, completely blocking path traversal attacks.
*   **Interactive Glassmorphic Dashboard**: A responsive dark interface with:
    *   Dynamic directory scanners.
    *   Multi-select checklist of cases with file type breakdown tags (counts of `.psd`, `.ai`, `.png`, etc.) and estimated total sizes.
    *   Safe **Test Run** toggle to dry-run with a limited set (caps at 2 files per case).
    *   A live, syntax-highlighted scrolling log console and progress bar tracking file copies and preview generation.
*   **AI Image Sorting (100% Local & Offline)**: When enabled, the app uses an on-device MobileNetV4 neural network to analyze each image and automatically sort it into intelligent sub-folders inside `ART TEMP` (e.g. `Vehicles`, `People & Portraits`, `Nature & Landscapes`, `Animals`, `Documents & Diagrams`, `Objects & Products`). **No cloud APIs, no internet connection, and no data ever leaves your machine.** The model (~12 MB) is downloaded once and cached locally.

---

## Directory Structure

```text
caseartorg/
├── client/                 # Vite + React Frontend
│   ├── src/
│   │   ├── components/     # UI Components
│   │   ├── services/       # SSE and Fetch HTTP API Client
│   │   ├── App.tsx         # Dashboard View
│   │   └── index.css       # HSL color variables & glassmorphic stylesheet
│   └── package.json
├── server/                 # Node.js + Express Backend
│   ├── src/
│   │   ├── services/
│   │   │   ├── organizer.ts # Scanner, copy logic, collision checks
│   │   │   └── preview.ts   # macOS qlmanage and sips child process wrappers
│   │   ├── routes.ts       # Scanning (REST) and Organizing (Server-Sent Events)
│   │   └── index.ts        # Express boots & CORS configurations
│   └── package.json
├── mock_dropbox/           # Generated case directories for safe demo runs
├── README.md               # App documentation
└── REACT_RULES.md          # Project coding guidelines
```

---

## Case Sourcing Workflows

The app supports two methods for sourcing case folders:

### Option A: Local Case Folders (Dropbox Desktop App)
*   **How it works**: Simply paste the path to your local Dropbox sync directory (e.g. `/Users/username/Dropbox/Cases`) or any local project folder.
*   **Pros**: Instantaneous scanning, zero download waiting time, and matches your live local filesystem.

### Option B: Dropbox Shared Link URL (No Local Client App)
*   **How it works**: Paste a shared link URL of a Dropbox folder directly (e.g. `https://www.dropbox.com/scl/fo/...`).
*   **Under the hood**: The backend server automatically converts the link to direct download mode, downloads the folder as a ZIP file to a local hidden directory (`.downloaded_cases`), unzips it using macOS native utilities, and scans the extracted subdirectories.
*   **Pros**: Allows users who do not have the Dropbox desktop client to download, scan, and extract case files easily.
*   **Target Output**: Since the source folder is remote, the output directory defaults to your local Downloads folder (`/Users/username/Downloads/ART TEMP`), but you can customize it to any folder on your Mac.

---

## AI Image Sorting (Offline)

When the **AI Sorting** toggle is enabled in the dashboard, the app classifies every image file during the copy phase and places it into a semantically named sub-folder inside your output directory (`ART TEMP`).

| Detail | Value |
|---|---|
| **Runs locally?** | ✅ Yes — 100% on-device, no internet required |
| **Model** | MobileNetV4 Conv Small (`onnx-community/mobilenetv4_conv_small`) |
| **Size** | ~12 MB (downloaded once, cached in `.model_cache/`) |
| **Runtime** | [Hugging Face transformers.js](https://huggingface.co/docs/transformers.js) (ONNX) |
| **Supported formats** | `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp` |
| **Non-image files** | Sorted by extension (e.g. `.pdf` → `Documents & Diagrams`, `.otf` → `Fonts`) |

### Categories

Images are classified into one of these sub-folders:

*   🚗 **Vehicles** — cars, trucks, planes, boats, bikes, etc.
*   👤 **People & Portraits** — faces, crowds, clothing, portraits
*   🌄 **Nature & Landscapes** — mountains, forests, beaches, flowers
*   🐾 **Animals** — dogs, cats, birds, wildlife
*   📄 **Documents & Diagrams** — screens, charts, maps, text
*   📦 **Objects & Products** — furniture, electronics, food, tools
*   🎨 **Illustrations & Graphics** — fallback for low-confidence or abstract images
*   🔤 **Fonts** — `.otf`, `.ttf`, `.woff` files
*   🎬 **Audio & Video** — `.mp3`, `.mp4`, `.mov`, etc.

> [!NOTE]
> AI image sorting runs **100% locally and offline** on your machine. Your files are never uploaded to any external server or cloud service.

---

## Prerequisites

*   **Operating System**: macOS (10.15+) or Windows (10+). Note: macOS is required for `.psd` and `.ai` preview thumbnail rendering. On Windows, files are consolidated and renamed correctly, but preview rendering is skipped.
*   **Node.js**: `v20.0.0` or higher.
*   **npm**: `v10.0.0` or higher.

---

## Quick Start Guide

### 1. Install Workspace Dependencies
Install dependencies across the root, client, and server workspaces in a single command:
```bash
npm run install:all
```

### 2. Start the Development Servers
Start both the Express backend (running on port `3001`) and the Vite React dev server concurrently:
```bash
npm run dev
```

### 3. Open the Dashboard
Navigate to [http://localhost:5173](http://localhost:5173) in your browser.

---

## Guided Tour (Testing with Mock Folder)

To test the application safely without touching your actual case files:

1.  Click the **Load Demo Path** button in the top right header. This fills the input with the path to the project's built-in `mock_dropbox` folder.
2.  Click the **Scan Directory** button (magnifying glass).
3.  The **Case Folders Checklist** will populate:
    *   `Case_01_CarCrash` (contains `.png`, `.txt`, and `.psd` files).
    *   `Case_02_PatentInfringement` (contains `.ai`, `.png`, and `.psd` files).
4.  Leave the **Safe Test Run** option toggled **ON**. This caps copies to a maximum of 2 files per file type per case.
5.  Click **Execute Test Run**.
6.  Watch the **Real-time Logs Console**:
    *   It will log copying files into `mock_dropbox/ART_TEMP`.
    *   It will generate previews (e.g. creating `blueprint.png` from `blueprint.ai`).
    *   It will detect that both cases contain a file named `diagram.png` and automatically rename the second one to `diagram_[Case_02_PatentInfringement].png` to prevent overwriting.
7.  Check `mock_dropbox/ART_TEMP/` in Finder/Explorer to verify the output copies and previews.
8.  Toggle **Safe Test Run** off and click **Execute Full Copy** to run a complete consolidation of all remaining files into `mock_dropbox/ART_TEMP`.

---

## Running the Desktop App in Development

To run the application in a local desktop window container on your machine, you have two options:

### Option 1: Run Compiled Production Build (Recommended)
This compiles the React client, builds the Express server, and boots the Electron window shell in a single step, running it exactly as it would behave when packaged:
```bash
npm run app:start
```

### Option 2: Live Hot Reloading (For Active Development)
If you are modifying code and want edits in the React frontend or Express backend to reload instantly:

1.  **Start Dev Servers**:
    ```bash
    npm run dev
    ```
    This launches the client on `http://localhost:5173` (enforced strictly) and backend on `http://localhost:3001`.
2.  **Open Electron Window**:
    In a separate terminal window, launch the Electron container shell:
    ```bash
    npx electron electron/main.js
    ```
    *(Note: If the Electron window opens to a blank screen before the Vite server finishes starting, click inside the window and press `Cmd+R` on Mac or `Ctrl+R` on Windows to reload).*

---

## Packaging the Desktop Application

The application is configured to package into a standalone desktop installer using `electron-builder`.

### 1. Build for the Host Platform (Autodetect OS)
To compile the frontend, backend, and package the application for your current operating system, run:
```bash
npm run app:dist
```
*   **On macOS**: Generates a double-clickable DMG installer in `dist-app/Case Art Organizer-1.0.0-arm64.dmg` (or `x64` depending on your architecture).
*   **On Windows**: Generates a self-installing NSIS executable in `dist-app/Case Art Organizer Setup 1.0.0.exe`.

### 2. Specific Platform Targeting
You can build for specific operating systems using:
*   **Build macOS App**: `npm run app:dist:mac`
*   **Build Windows App**: `npm run app:dist:win`

> [!NOTE]
> Packaging for Windows works best on a Windows machine. The app itself can then be distributed as a single, zero-dependency executable (`.exe` for Windows, `.dmg` for Mac) that clients can download and run without Node or terminal knowledge.

---

## Publishing a Release (Automated)

This repo includes a GitHub Actions workflow (`.github/workflows/release.yml`) that **automatically builds and publishes** macOS and Windows installers whenever you push a version tag.

### How to publish a new release:

```bash
# 1. Tag the current commit with a version
git tag v1.0.0

# 2. Push the tag to GitHub
git push origin v1.0.0
```

That's it. GitHub Actions will:
1. Build the app on both macOS and Windows runners
2. Package `.dmg` (Mac) and `.exe` (Windows) installers
3. Create a GitHub Release at [github.com/JameyStiling/case-assets/releases](https://github.com/JameyStiling/case-assets/releases)
4. Attach the installers as downloadable assets

> [!TIP]
> Users can then download the app directly from the [**Releases page**](https://github.com/JameyStiling/case-assets/releases) — no Node.js, git, or terminal required.
