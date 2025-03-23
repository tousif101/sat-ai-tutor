export default async function handler(req, res) {
  if (req.method === "GET") {
    const { topic } = req.query;

    try {
      const response = await fetch(`http://127.0.0.1:8000/generate-question?topic=${topic}`);
      if (!response.ok) {
        throw new Error("FastAPI failed to generate a question.");
      }

      const data = await response.json();
      return res.status(200).json(data);
    } catch (error) {
      console.error("Error fetching AI-generated question:", error);
      return res.status(500).json({ error: "Failed to fetch AI-generated question" });
    }
  }

  return res.status(405).json({ message: "Method Not Allowed" });
}
