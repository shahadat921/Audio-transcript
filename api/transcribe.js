module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: "The server is not set up yet. Add GROQ_API_KEY in Vercel, then redeploy." });
  try {
    const parts = [];
    for await (const c of req) parts.push(c);
    const body = Buffer.concat(parts);
    if (!body.length) return res.status(400).json({ error: "No audio received." });

    const q = new URL(req.url, "http://x").searchParams;
    const lang = (q.get("lang") || "").trim();
    let model = q.get("model");
    if (!["whisper-large-v3-turbo", "whisper-large-v3"].includes(model)) model = "whisper-large-v3-turbo";

    const fd = new FormData();
    fd.append("file", new Blob([body], { type: "audio/wav" }), "audio.wav");
    fd.append("model", model);
    fd.append("response_format", "verbose_json");
    fd.append("timestamp_granularities[]", "word");
    fd.append("timestamp_granularities[]", "segment");
    fd.append("temperature", "0");
    if (lang) fd.append("language", lang);
    else fd.append("prompt", "Mixed Bengali and English speech. Write Bengali in Bengali script and English words in English. বাংলা ও English মিশিয়ে বলা কথা।");

    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: "Bearer " + key }, body: fd
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: (j.error && j.error.message) || "Transcription failed (" + r.status + ")." });

    res.status(200).json({
      segments: (j.segments || []).map(s => ({ start: s.start, end: s.end, text: (s.text || "").trim() })),
      words: (j.words || []).map(w => ({ word: w.word, start: w.start, end: w.end }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error." });
  }
};
