export default function handler(req, res) {
    if (req.method === "POST") {
      const { email, password } = req.body;
      
      if (email === "test@example.com" && password === "password") {
        return res.status(200).json({ message: "Login successful" });
      }
  
      return res.status(401).json({ message: "Invalid credentials" });
    }
  
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  