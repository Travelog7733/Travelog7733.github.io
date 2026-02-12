import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 🔴 Put your ChatGPT API key here (KEEP THIS PRIVATE)
const OPENAI_API_KEY = "PASTE_YOUR_OPENAI_API_KEY_HERE";

app.post("/generate", async (req, res) => {
  const { destination, startDate, endDate } = req.body;

  const prompt = `Write a professional, attractive travel itinerary description for a trip to ${destination} from ${startDate} to ${endDate}. Make it suitable for a travel agency customer.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful travel copywriter." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "No text generated.";

    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate" });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
