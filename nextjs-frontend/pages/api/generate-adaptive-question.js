export default async function handler(req, res) {
    if (req.method !== "GET") {
      return res.status(405).json({ message: "Method Not Allowed" });
    }
  
    const { user_id, topic, challenge_mode } = req.query;
  
    if (!user_id || !topic) {
      return res.status(400).json({ message: "Missing required parameters" });
    }
  
    try {
      // Convert challenge_mode to boolean if it's a string
      const challengeModeParam = 
        challenge_mode === "true" || challenge_mode === true ? true : false;
      
      const url = `http://127.0.0.1:8000/generate-adaptive-question?user_id=${user_id}&topic=${topic}&challenge_mode=${challengeModeParam}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("FastAPI Error:", errorText);
        return res.status(response.status).json({ error: `Failed to generate adaptive question: ${errorText}` });
      }
      
      const data = await response.json();
      return res.status(200).json(data);
      
    } catch (error) {
      console.error("Error generating adaptive question:", error);
      return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
  }