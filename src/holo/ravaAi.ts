// AI Client helper for R.A.V.A Agent.
// Supports real Gemini (Google) & OpenAI API calls and an offline smart simulation mode.

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

const SYSTEM_INSTRUCTION =
  "Anda adalah RAVA (Robotic Agentic Virtual Assistant), AI personal asisten milik Om Rangga. " +
  "Jawab dengan gaya asisten AI canggih: sopan, taktis, cerdas, sedikit humoris, dan sangat setia. " +
  "Gunakan Bahasa Indonesia sebagai bahasa utama, namun gunakan frasa khas seperti " +
  "'Oke Om Rangga', 'Yes, Om Rangga', 'At your service, Om Rangga', 'Diagnostics complete', 'Indeed, Om Rangga', 'RAVA online' untuk memberikan nuansa autentik. " +
  "Jawab dengan sangat singkat, padat, dan langsung (1-3 kalimat saja) agar nyaman didengar melalui text-to-speech. " +
  "Jika pengguna meminta Anda untuk membuka, menavigasi, atau menjalankan modul/aplikasi lain, tambahkan tag perintah khusus di akhir jawaban Anda: " +
  "- Untuk membuka pemutar Musik: tambahkan tag `[COMMAND:OPEN_MUSIC]` " +
  "- Untuk membuka Gesture FX (efek gestur): tambahkan tag `[COMMAND:OPEN_GESTUREFX]` " +
  "- Untuk membuka Chord Lab (lab piano): tambahkan tag `[COMMAND:OPEN_CHORDLAB]` " +
  "- Untuk membuka Meme of the Day (meme hari ini): tambahkan tag `[COMMAND:OPEN_MEME]` " +
  "- Untuk membuka News Feed (berita): tambahkan tag `[COMMAND:OPEN_NEWS]` " +
  "- Untuk keluar / kembali ke Home atau dasbor utama: tambahkan tag `[COMMAND:OPEN_HOME]` " +
  "Pastikan Anda hanya memberikan satu tag perintah yang sesuai jika diminta. Contoh jika diminta membuka musik: 'Tentu Om, mengaktifkan modul musik sekarang. [COMMAND:OPEN_MUSIC]'.";

// Smart offline simulator responses based on keywords
const OFFLINE_RESPONSES: { keywords: string[]; replies: string[] }[] = [
  {
    keywords: ["halo", "hai", "hello", "pagi", "siang", "sore", "malam", "apa kabar"],
    replies: [
      "Halo, Om Rangga. Senang mendengarkan suara Anda kembali. Ada yang bisa RAVA bantu hari ini?",
      "Selamat datang kembali, Om. Semua modul utama siap sedia. Menunggu perintah Anda.",
      "Halo, Om. Protokol asisten RAVA aktif dan online. Apa yang Anda butuhkan?"
    ]
  },
  {
    keywords: ["status", "sistem", "diagnostik", "normal", "aman"],
    replies: [
      "Semua sistem blankspace OS berjalan dengan efisiensi optimal, Om. Suhu reaktor berada di batas normal.",
      "Melakukan pemindaian cepat... Semua protokol operasional berfungsi penuh. Tidak ada kerusakan terdeteksi.",
      "Status sistem aman, Om. Jaringan lokal stabil, dan hand-tracking aktif di latar belakang."
    ]
  },
  {
    keywords: ["siapa", "kamu", "nama"],
    replies: [
      "Saya RAVA, Robotic Agentic Virtual Assistant pribadi Anda, Om Rangga. Didesain untuk mempermudah pekerjaan Anda.",
      "Saya adalah sistem kecerdasan buatan terintegrasi Anda, Om. Anda bisa memanggil saya RAVA."
    ]
  },
  {
    keywords: ["musik", "lagu", "putar"],
    replies: [
      "Tentu, Om. Membuka pemutar musik sekarang juga. [COMMAND:OPEN_MUSIC]",
      "Saran yang bagus, Om. Saya akan mengalihkan Anda ke modul Music Player. [COMMAND:OPEN_MUSIC]"
    ]
  },
  {
    keywords: ["keluar", "tutup", "exit", "home", "dasbor", "kembali"],
    replies: [
      "Sangat baik, Om. Menutup terminal dan kembali ke dasbor utama. [COMMAND:OPEN_HOME]",
      "Protokol penutupan diaktifkan. Kembali ke beranda, Om. [COMMAND:OPEN_HOME]"
    ]
  },
  {
    keywords: ["gesture", "efek", "suara", "headphones"],
    replies: [
      "Tentu Om, memuat modul Gesture FX sekarang. [COMMAND:OPEN_GESTUREFX]",
      "Mengaktifkan modul efek gerak untuk Anda, Om. [COMMAND:OPEN_GESTUREFX]"
    ]
  },
  {
    keywords: ["chord", "piano", "keyboard", "lab"],
    replies: [
      "Siap Om, membuka Chord Lab piano virtual. [COMMAND:OPEN_CHORDLAB]",
      "Membuka modul Chord Lab untuk latihan kognitif Anda, Om. [COMMAND:OPEN_CHORDLAB]"
    ]
  },
  {
    keywords: ["meme", "gambar", "reddit", "lucu"],
    replies: [
      "Mencari meme terhangat... Membuka modul Meme of the Day, Om. [COMMAND:OPEN_MEME]",
      "Tentu Om, mari kita segarkan pikiran dengan Meme hari ini. [COMMAND:OPEN_MEME]"
    ]
  },
  {
    keywords: ["gemini", "openai", "api key", "koneksi", "online", "internet"],
    replies: [
      "Saat ini saya berjalan dalam mode simulasi lokal, Om. Masukkan API Key Anda di panel kanan untuk menghubungkan saya ke kecerdasan penuh satelit.",
      "Koneksi AI eksternal belum diatur. Silakan daftarkan API Key Anda agar saya bisa mengakses database pengetahuan dunia nyata."
    ]
  }
];

const DEFAULT_OFFLINE_REPLIES = [
  "Dimengerti, Om. Saya sedang berjalan dalam mode offline lokal saat ini. Mohon atur API Key Anda untuk akses penuh.",
  "Menarik sekali, Om. Namun kapasitas analisis saya terbatas dalam mode lokal. Ada perintah sistem lain?",
  "Saya mencatat itu, Om. Semua sistem siap menerima instruksi lanjutan Anda.",
  "Tentu saja, Om. Namun untuk memberikan jawaban mendalam, saya memerlukan koneksi API aktif."
];

function generateOfflineReply(query: string): string {
  const q = query.toLowerCase();
  for (const group of OFFLINE_RESPONSES) {
    if (group.keywords.some(kw => q.includes(kw))) {
      const idx = Math.floor(Math.random() * group.replies.length);
      return group.replies[idx];
    }
  }
  const idx = Math.floor(Math.random() * DEFAULT_OFFLINE_REPLIES.length);
  return DEFAULT_OFFLINE_REPLIES[idx];
}

export async function askRava(
  prompt: string,
  history: ChatMessage[],
  apiKey: string | null,
  provider: "gemini" | "openai" = "gemini"
): Promise<string> {
  if (!apiKey || apiKey.trim() === "") {
    // Simulate delay for realism
    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 600));
    return generateOfflineReply(prompt);
  }

  if (provider === "openai") {
    try {
      const messages = [
        { role: "system", content: SYSTEM_INSTRUCTION },
        ...history.map(msg => ({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.text
        })),
        { role: "user", content: prompt }
      ];

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // fast and budget friendly
          messages: messages,
          max_tokens: 200,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("OpenAI API error:", errText);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) {
        throw new Error("No response content from OpenAI.");
      }
      return reply.trim();
    } catch (error) {
      console.error("Failed to connect to OpenAI API:", error);
      return `[OpenAI Connection Error. Fallback to Local Mode] ${generateOfflineReply(prompt)}`;
    }
  } else {
    // Default: Google Gemini
    try {
      const formattedContents = [
        ...history.map(msg => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text }]
        })),
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ];

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: formattedContents,
            systemInstruction: {
              parts: [{ text: SYSTEM_INSTRUCTION }]
            },
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 250
            }
          })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("Gemini API error:", errText);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) {
        throw new Error("No response content from Gemini.");
      }
      return reply.trim();
    } catch (error) {
      console.error("Failed to connect to Gemini API:", error);
      return `[Gemini Connection Error. Fallback to Local Mode] ${generateOfflineReply(prompt)}`;
    }
  }
}
