export const runtime = "edge";

import { NEXT_PUBLIC_BASE_URL } from "@/lib/config";

export default async function handler(req) {
  if (req.method === "POST") {
    try {
      // Log the enhanced payload
      console.log("Enhanced submission payload:", req.body);

      const response = await fetch(`${NEXT_PUBLIC_BASE_URL}/submit-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("FastAPI Error:", errorText);
        throw new Error(`Failed to submit answer: ${errorText}`);
      }

      const data = await response.json();
      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error submitting answer:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to submit answer" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return new Response(
    JSON.stringify({ message: "Method Not Allowed" }),
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
}