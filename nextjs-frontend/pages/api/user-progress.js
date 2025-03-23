export default async function handler(req, res) {
    if (req.method !== "GET") {
      return res.status(405).json({ message: "Method Not Allowed" });
    }
  
    const { user_id } = req.query;
  
    if (!user_id) {
      return res.status(400).json({ message: "Missing user_id" });
    }
  
    try {
      const response = await fetch(`http://127.0.0.1:8000/user-progress?user_id=${user_id}`);
      const data = await response.json();
  
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
  
      return res.status(200).json(data);
    } catch (error) {
      console.error("Error fetching user progress:", error);
      return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
  }
  