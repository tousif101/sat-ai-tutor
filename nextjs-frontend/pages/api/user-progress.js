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
  
    if (!user_id) {
      return new Response(
        JSON.stringify({ message: "Missing user_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  
    try {
      const response = await fetch(`${NEXT_PUBLIC_BASE_URL}/user-progress?user_id=${user_id}`);
      const data = await response.json();
  
      if (!response.ok) {
        return new Response(
          JSON.stringify(data),
          { status: response.status, headers: { "Content-Type": "application/json" } }
        );
      }
  
      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error fetching user progress:", error);
      return new Response(
        JSON.stringify({ message: "Internal Server Error", error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
  