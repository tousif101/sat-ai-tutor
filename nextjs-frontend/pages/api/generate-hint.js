export const runtime = "edge";

import { NEXT_PUBLIC_BASE_URL } from "@/lib/config";

export default async function handler(req) {
    if (req.method === "GET") {
      const { searchParams } = new URL(req.url);
      const topic = searchParams.get("topic");
      const question = searchParams.get("question");
  
      if (!topic || !question) {
        return new Response(
          JSON.stringify({ error: "Topic and question are required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
  
      try {
        const response = await fetch(`${NEXT_PUBLIC_BASE_URL}/generate-hint?topic=${topic}&question=${encodeURIComponent(question)}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("FastAPI Hint API Error:", errorText);
          return new Response(
            JSON.stringify({ error: `FastAPI returned an error: ${errorText}` }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
  
        const data = await response.json();
        return new Response(
          JSON.stringify(data),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        console.error("Error fetching AI-generated hint:", error);
        return new Response(
          JSON.stringify({ error: "Failed to fetch AI-generated hint" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  
    return new Response(
      JSON.stringify({ message: "Method Not Allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }
  