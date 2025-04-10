import { BASE_URL } from "@/lib/config";

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      // Log the enhanced payload
      console.log("Enhanced submission payload:", req.body);

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      const response = await fetch(`${BASE_URL}/submit-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("FastAPI Error:", errorText);
        throw new Error(`Failed to submit answer: ${errorText}`);
      }

      const data = await response.json();
      return res.status(200).json(data);

    } catch (error) {
      console.error("Error submitting answer:", error);
      return res.status(500).json({ error: error.message || "Failed to submit answer" });
    }
  }

  return res.status(405).json({ message: "Method Not Allowed" });
}