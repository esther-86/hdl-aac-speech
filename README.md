# HDL ClearVoice AAC Speech (`hdl-aac-speech`)

An offline-capable mobile and web **Augmentative and Alternative Communication (AAC)** WordPress plugin based on [esther-86/aac-speech](https://github.com/esther-86/aac-speech), tailored for children and communicators with speech delays or articulation differences.

---

## 🌟 Core Workflow (Minimal Two-Panel Screen)

1. **1. Push to Listen (Left Panel)**:
   - When your child wants the app to listen, she pushes **1. Push to Listen** and speaks at her own pace.
   - The microphone stays continuously active across pauses until she pushes the button a second time (**Listening... Push When Done**), capturing unbroken 16kHz mono `.wav` audio plus live browser speech hypotheses.
2. **What I Heard You Say (Right Panel)**:
   - Displays the reconstructed sentence in real time as she speaks, then refines it using her **personal learned speech patterns**, **phonological process decoder** (`l➔d`, `y➔d`, `r➔w`, `sw/sl/fl/str➔fw/f`, `ch/th➔t/d`, final cluster reconstruction), and **local Faster-Whisper / OpenAI Whisper audio transcription**.
3. **Voice Selector & 2. Push to Say It Out (Right Panel)**:
   - Includes a **Voice** selector right above the speak button so she can choose her preferred Text-to-Speech voice at any time.
   - When ready, she pushes **2. Push to Say It Out** to speak the sentence out loud clearly.
4. **Edit / Teach (`Save & Teach Pattern`)**:
   - Tapping **Edit / Teach** opens a correction box where any edit is saved to her personal speech profile and registered as an on-the-fly audio training/test case (`Save & Teach Pattern`) without speaking it out loud prematurely—returning to the main screen so she can push **2. Push to Say It Out** when ready.
5. **Individual Per-User Profiles**:
   - Each user gets an isolated `IndexedDB` speech model on their device (plus optional multi-profile switching via the top-right profile menu or `?user=Name`).

---

## 🚀 How to Access in WordPress

- **Standalone Fullscreen Mobile & Web App (PWA)**:
  - Local: `http://localhost/wordpress/hdl-aac-speech` (or `/aac-speech`, `/clearvoice`)
  - Per-person direct link: `http://localhost/wordpress/hdl-aac-speech?user=Maya`
- **WordPress Shortcode (Embed in any Page/Post)**:
  - `[hdl_aac_speech]` or `[aac_speech]`
- **WordPress Admin Settings & Profile Backups**:
  - Go to **Settings → ClearVoice AAC Speech** in `wp-admin`.

---

## 🧪 Audio Benchmark & Local ASR Server (`benchmark/`)

The `benchmark/` directory includes a 70/30 Train/Held-Out Test evaluation pipeline and local Faster-Whisper ASR daemon:

```bash
# Run the 70/30 Train & Held-Out Test benchmark
python benchmark/run_benchmark.py

# Start the persistent local Faster-Whisper ASR server (port 8765)
python benchmark/local_asr_server.py
```

> **Privacy Note**: Raw `.wav` voice recordings (`benchmark/*.wav`, `benchmark/clips/*.wav`, `benchmark/user_clips/*.wav`) are excluded via `.gitignore` so personal child voice recordings remain strictly on your local machine.

---

## 🛠️ Development & Testing

```bash
# Install dependencies
npm install

# Rebuild production bundle (assets/dist/app.js & assets/dist/app.css)
npm run build

# Run Playwright end-to-end tests
npx playwright test
```
