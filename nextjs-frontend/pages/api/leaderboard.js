import { BASE_URL } from "@/lib/config";

export default async function handler(req, res) {
  const { type, topic, userId, limit } = req.query;
  
  try {
    let url;
    
    if (type === 'global') {
      url = `${BASE_URL}/global-leaderboard?limit=${limit || 10}`;
    } else if (type === 'topic' && topic) {
      url = `${BASE_URL}/topic-leaderboard/${topic}?limit=${limit || 10}`;
    } else if (type === 'user' && userId) {
      url = `${BASE_URL}/user-ranking/${userId}`;
    } else {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }
    
    const data = await response.json();
    return res.status(200).json(data);
    
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return res.status(500).json({ error: error.message });
  }
}