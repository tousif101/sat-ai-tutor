export const runtime = "edge";

import { NEXT_PUBLIC_BASE_URL } from "@/lib/config";

export default async function handler(req) {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ message: "Method Not Allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }
  
    try {
      const response = await fetch(`${NEXT_PUBLIC_BASE_URL}/tutor-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
  
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
      console.error("Error in tutor chat:", error);
      return new Response(
        JSON.stringify({ message: "Internal Server Error", error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
  