// Vercel serverless function: fixes Bengali/English spelling word-by-word with Gemini.
// Word count and order never change, so the timing stays exact.
// Needs the secret GEMINI_API_KEY in Vercel (Settings → Environment Variables).
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Gemini is not set up yet. Add GEMINI_API_KEY in Vercel, then redeploy." });
  try {
    let b = req.body; if (typeof b === "string") b = JSON.parse(b);
    const words = Array.isArray(b && b.words) ? b.words.map(String) : [];
    if (!words.length || words.length > 400) return res.status(400).json({ error: "Send between 1 and 400 words." });
    const hint = String((b && b.hint) || "").slice(0, 300);
    const models = [...new Set([process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash"].filter(Boolean))];
    const prompt = [
      "You correct spelling in speech-to-text output. The input is a JSON array of words in spoken order. The speech is Bengali, English, or a mix of both.",
      "Return a JSON array of strings with EXACTLY the same number of items, where item N is the corrected form of input word N.",
      "Rules: fix only spelling (use standard Bengali spelling, e.g. ঠান্ডা, অলসতা, ফজর, দরুদ, ইস্তেগফার). Never merge, split, remove, add, translate or reorder words. Keep punctuation and number marks like '1.' where they are. Keep English words in English. If you are not sure, return the original word unchanged.",
      hint ? "Topic hint from the user: " + hint : "",
      "Input:", JSON.stringify(words)
    ].filter(Boolean).join("\n");

    let lastErr = "Gemini did not answer.";
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } }
          })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          lastErr = r.status === 429 ? "Gemini is busy or the free limit is reached. Try again in a minute." : "Gemini (" + r.status + ", " + model + "): " + ((j.error && j.error.message) || "error");
          if (r.status === 404 || r.status === 400) break; // try the next model name
          return res.status(502).json({ error: lastErr });
        }
        let out = null;
        try { out = JSON.parse(j.candidates[0].content.parts[0].text); } catch (e) { }
        if (Array.isArray(out) && out.length === words.length) return res.status(200).json({ words: out.map((x, k) => String(x || words[k])) });
        lastErr = "The AI changed the number of words. Please try again.";
      }
    }
    return res.status(502).json({ error: lastErr });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error." });
  }
};
