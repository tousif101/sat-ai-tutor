export default async function handler(req, res) {
    if (req.method === "GET") {
      const { topic, question } = req.query;
  
      if (!topic || !question) {
        return res.status(400).json({ error: "Topic and question are required" });
      }
  
      try {
        const response = await fetch(`http://127.0.0.1:8000/generate-hint?topic=${topic}&question=${encodeURIComponent(question)}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("FastAPI Hint API Error:", errorText);
          return res.status(500).json({ error: `FastAPI returned an error: ${errorText}` });
        }
  
        const data = await response.json();
        return res.status(200).json(data);
      } catch (error) {
        console.error("Error fetching AI-generated hint:", error);
        return res.status(500).json({ error: "Failed to fetch AI-generated hint" });
      }
    }
  
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  