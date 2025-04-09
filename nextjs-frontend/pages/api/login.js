export const runtime = "edge";

export default function handler(req) {
    if (req.method === "POST") {
      const { email, password } = req.body;
      
      if (email === "test@example.com" && password === "password") {
        return new Response(
          JSON.stringify({ message: "Login successful" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
        
      }
  
      return new Response(
        JSON.stringify({ message: "Invalid credentials" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  
    return new Response(
      JSON.stringify({ message: "Method Not Allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }
  