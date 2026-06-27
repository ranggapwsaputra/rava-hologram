# 🤖 R.A.V.A (Robotic Agentic Virtual Assistant) — v0.5 JARVISMODE

A futuristic, Iron-Man-inspired holographic OS controlled via webcam hand tracking, empowered with AI financial intelligence and autonomous agent capabilities. **point, pinch, swipe, and fist.**

---

## 🌟 Key Modules & Features

### 📰 R.A.V.A Financial Intel Feed (`NewsApp`)
- **Real-Time Vector DB Integration**: Connects directly to Pinecone Vector DB populated by automated **n8n news scraping workflows**.
- **Unified 2-Column Holographic Feed**: Displays financial news, IDX stock market updates, and currency market analysis side-by-side in a sleek dual-column layout.
- **Live Currency Ticker**: Real-time USD to IDR exchange rate widget (`1 USD = IDR xx.xxx`) embedded in the upper-left status header.
- **Hand Gesture Navigation**:
  - **Swipe Up / Down**: Smoothly navigate and auto-scroll through news articles.
  - **Point & Hold (☝️)**: Trigger R.A.V.A voice synthesis (Text-to-Speech) to read aloud the selected article and AI analysis.
  - **Hold Fist (✊)**: Return to main Holographic Home.

### 😂 Holographic 3D Meme Gallery (`MemeApp`)
- **3D Stellar Card Gallery**: Memes are distributed in a floating $360^\circ$ cylindrical stellar constellation with organic tilt and smooth floating animations.
- **Dual-Hand Gestures**:
  - **Left Hand Open (✋)**: Move around in mid-air to dynamically orbit and tilt the camera.
  - **Right Hand Pinch & Drag (🤏)**: Spin the entire meme gallery wheel in 3D space.
  - **Right Hand Point & Hold (👉)**: Hover on any card and dwell select to pop up a full-screen high-quality preview.
  - **Hold Fist (✊)**: Close the preview or exit the module completely.

---

## 🖐️ Interactive Hands-Free Apps

Built with React + Vite, React-Three-Fiber, MediaPipe Hands, and Web Speech API.

| App | Description & Gestures |
|-----|------------------------|
| 📰 **R.A.V.A Intel Feed** | Pinecone Vector DB financial news · Live USD/IDR ticker · Swipe & Point gesture controls |
| 🎵 **Music Player** | Holographic carousel · Pinch-spin to browse · Point to play/pause |
| 🤖 **Interactive 3D Robot / AI Agent** | Hand-tracked 3D robotic entity simulation & voice assistant integration |
| 🎛️ **Gesture FX** | CDJ-style two-handed audio FX (Filter, Echo, Delay, Reverb, Flanger) |
| 🎹 **Chord Lab** | Dual-wheel aiming · Pinch gesture piano synthesizer |
| 😂 **Meme of the Day** | 3D Floating Stellar Gallery · 🤏 Pinch-drag to spin · ✋ Left hand open to orbit camera · 👉 Point-hold to zoom full-screen |

---

## ⚙️ Configuration Guide

### 1. 🤖 Modifikasi & Update API Key AI (Gemini / OpenAI)
Untuk mengaktifkan respon kecerdasan buatan secara real-time pada R.A.V.A Voice Assistant:
- **Via UI**: Buka aplikasi **Interactive 3D Robot** dari beranda utama, lalu klik tombol Settings/Gear untuk memasukkan **Google Gemini API Key** atau **OpenAI API Key** dan memilih Provider.
- **Via Storage**: Konfigurasi ini secara otomatis disimpan dalam `localStorage` browser menggunakan key berikut:
  - `gemini_api_key`: API Key dari Google AI Studio (Gemini 2.5 Flash).
  - `openai_api_key`: API Key dari OpenAI (GPT-4o-mini).
  - `rava_api_provider`: Provider aktif (`gemini` atau `openai`).

### 2. 📡 Modifikasi & Update RAG News (Pinecone Vector DB)
Untuk memperbarui atau menghubungkan database berita RAG yang di-scrape oleh n8n:
- **Via UI**: Buka modul **News Feed**, lalu klik ikon **Settings (⚙️)** di sudut kanan atas.
- **Parameter yang Dibutuhkan**:
  - **Pinecone Host URL**: URL host indeks Pinecone Anda (contoh: `https://news-index-xxxx.svc.us-east1-gcp.pinecone.io`).
  - **Pinecone API Key**: API key proyek Pinecone Anda.
  - **Namespace (Opsional)**: Nama namespace spesifik tempat n8n menyimpan data. Jika dikosongkan, R.A.V.A akan secara otomatis mendeteksi (*auto-detect*) namespace aktif berdasarkan statistik indeks.
- **Via Storage**: Tersimpan otomatis pada browser via `localStorage`:
  - `rava_pinecone_host`
  - `rava_pinecone_key`
  - `rava_pinecone_ns`

---

## 🚀 Quick Start & Installation

```bash
# Clone repository
git clone https://github.com/ranggapwsaputra/rava-hologram.git
cd rava-hologram

# Install dependencies
npm install

# Run development server
npm run dev
```

> 💡 **Browser Requirement**: Works best on Google Chrome or Microsoft Edge with webcam access allowed.
