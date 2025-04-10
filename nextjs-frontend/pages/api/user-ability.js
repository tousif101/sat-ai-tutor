import { BASE_URL } from "@/lib/config";

export default async function handler(req, res) {
    if (req.method !== "GET") {
      return res.status(405).json({ message: "Method Not Allowed" });
    }
  
    const { user_id } = req.query;
  
    if (!user_id) {
      return res.status(400).json({ message: "Missing user_id" });
    }
  
    try {
      const response = await fetch(`${BASE_URL}/user-ability/${user_id}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("FastAPI Error:", errorText);
        return res.status(response.status).json({ error: `Failed to fetch user ability: ${errorText}` });
      }
      
      const data = await response.json();
      return res.status(200).json(data);
      
    } catch (error) {
      console.error("Error fetching user ability:", error);
      return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
  }