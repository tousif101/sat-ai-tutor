import { BASE_URL } from "@/lib/config";

export default async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method Not Allowed" });
    }
  
    try {
      const response = await fetch(`${BASE_URL}/tutor-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
  
      return res.status(200).json(data);
    } catch (error) {
      console.error("Error in tutor chat:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
  