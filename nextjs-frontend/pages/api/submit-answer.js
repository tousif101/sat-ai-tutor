export default async function handler(req, res) {
    if (req.method === "POST") {
      try {
        const response = await fetch("http://127.0.0.1:8000/submit-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req.body),
        });
  
        if (!response.ok) {
          console.error("FastAPI Error:", await response.text());
          throw new Error("Failed to submit answer");
        }
  
        const data = await response.json();
        return res.status(200).json(data);
  
      } catch (error) {
        console.error("Error submitting answer:", error);
        return res.status(500).json({ error: "Failed to submit answer" });
      }
    }
  
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  