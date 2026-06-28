# R.A.V.A Voice Agent

Python daemon yang menjadi **otak suara** sistem R.A.V.A. Menjalankan dua fitur secara bersamaan:

1. **Double-clap detection** — dengarkan mikrofon dan jalankan welcome flow (Spotify, Chrome, ElevenLabs, Cursor) saat dua tepuk terdeteksi.
2. **WebSocket TTS bridge** — terima perintah `speak` dari frontend React (`ws://localhost:7788`) dan mainkan suara via ElevenLabs.

---

## Setup

```bash
cd voiceagent
python -m pip install -r requirements.txt
```

## Environment Variables

Buat file `.env` di folder `voiceagent/` (atau salin dari `.env.local`):

```env
ELEVENLABS_API_KEY=your_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here
```

### Semua variabel tersedia

| Variable | Default | Keterangan |
|---|---|---|
| `ELEVENLABS_API_KEY` | *(wajib)* | API key dari [ElevenLabs](https://elevenlabs.io) |
| `ELEVENLABS_VOICE_ID` | *(wajib)* | Voice ID dari ElevenLabs |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | Model TTS |
| `ELEVENLABS_OUTPUT_FORMAT` | `pcm_24000` | Format output audio |
| `JARVIS_WS_PORT` | `7788` | Port WebSocket bridge |
| `JARVIS_INPUT_DEVICE` | *(auto)* | Index atau substring nama mikrofon |
| `JARVIS_WELCOME_CACHE_DIR` | `.cache/jarvis_welcome/` | Folder cache audio |
| `CLAUDE_CODE_URL` | `https://claude.ai/new` | URL Claude di Chrome |
| `BINANCE_BTC_URL` | `https://www.binance.com/en/trade/BTC_USDT` | URL Binance di Chrome |
| `CHROME_NEW_WINDOW_WAIT_S` | `25` | Detik tunggu window Chrome baru |

---

## Run

```bash
python jarvis.py
```

Agent akan:
- Mulai WebSocket server di `ws://localhost:7788`
- Mulai mic detection loop di background thread
- Izinkan mikrofon jika Windows meminta

Stop dengan **Ctrl+C**.

---

## WebSocket Protocol

Frontend React (voiceBridge.ts) berkomunikasi dengan protocol berikut:

**Frontend → Agent:**
```json
{ "action": "speak", "text": "Selamat datang, Om." }
{ "action": "cancel" }
```

**Agent → Frontend:**
```json
{ "status": "ready" }
{ "status": "speaking", "text": "..." }
{ "status": "done" }
{ "status": "error", "message": "..." }
```

---

## Tuning Double-Clap

Edit konstanta di bagian atas `jarvis.py`:

| Konstanta | Efek |
|---|---|
| `SPIKE_RATIO` | Naikkan jika terlalu banyak false trigger; turunkan jika clap tidak terdeteksi |
| `COOLDOWN_S` | Waktu minimum antara dua double-clap |
| `BLOCK_MS` | Lebih besar = sedikit kurang presisi, CPU lebih rendah |
| `MIN_RMS` | Floor kekerasan suara (bantu di ruang sangat tenang) |
| `SAMPLE_RATE` | Coba `48000` jika device tidak support `44100` |

---

## Troubleshooting

- **Mic salah atau diam**: Script probe default input. Jika diam, auto-select mic terloud. Set `JARVIS_INPUT_DEVICE` di `.env` untuk override.
- **PortAudio / audio error**: Update driver audio atau coba `SAMPLE_RATE` lain.
- **Tidak ada reaksi saat tepuk**: Turunkan `SPIKE_RATIO` atau tepuk lebih keras.
- **Spam log**: Naikkan `SPIKE_RATIO` atau `COOLDOWN_S`.
- **Tidak ada suara welcome**: Pastikan `ELEVENLABS_API_KEY` dan `ELEVENLABS_VOICE_ID` ada di `.env`.
- **Frontend tidak dapat suara ElevenLabs**: Pastikan `python jarvis.py` berjalan sebelum membuka frontend.
