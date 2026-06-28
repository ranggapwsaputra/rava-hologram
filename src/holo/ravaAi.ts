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


export async function askRava(
  prompt: string,
  history: ChatMessage[],
  apiKey: string | null,
  provider: "gemini" | "openai" = "gemini"
): Promise<string> {
  if (!apiKey || apiKey.trim() === "") {
    return "API Key belum dikonfigurasi, Om. Silakan masukkan Gemini atau OpenAI API Key Anda di pengaturan untuk mengaktifkan percakapan RAVA.";
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
      return "Maaf Om Rangga, terjadi kesalahan saat menghubungkan ke OpenAI API. Mohon periksa koneksi atau API Key Anda.";
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
      return "Maaf Om Rangga, terjadi kesalahan saat menghubungkan ke Gemini API. Mohon periksa koneksi atau API Key Anda.";
    }
  }
}
