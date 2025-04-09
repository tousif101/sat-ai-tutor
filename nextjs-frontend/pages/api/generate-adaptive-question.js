export const runtime = "edge";

import { NEXT_PUBLIC_BASE_URL } from "@/lib/config";

export default async function handler(req) {
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ message: "Method Not Allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }
  
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");
    const topic = searchParams.get("topic");
    const challenge_mode = searchParams.get("challenge_mode");
  
    if (!user_id || !topic) {
      return new Response(
        JSON.stringify({ message: "Missing required parameters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  
    try {
      // Convert challenge_mode to boolean if it's a string
      const challengeModeParam = 
        challenge_mode === "true" || challenge_mode === true ? true : false;
      
      const url = `${NEXT_PUBLIC_BASE_URL}/generate-adaptive-question?user_id=${user_id}&topic=${topic}&challenge_mode=${challengeModeParam}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("FastAPI Error:", errorText);
        return new Response(
          JSON.stringify({ error: `Failed to generate adaptive question: ${errorText}` }),
          { status: response.status, headers: { "Content-Type": "application/json" } }
        );
      }
      
      const data = await response.json();
      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
      
    } catch (error) {
      console.error("Error generating adaptive question:", error);
      return new Response(
        JSON.stringify({ message: "Internal Server Error", error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }