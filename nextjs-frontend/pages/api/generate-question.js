export const runtime = "edge";

import { NEXT_PUBLIC_BASE_URL } from "@/lib/config";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { searchParams } = new URL(req.url);
    const topic = searchParams.get("topic");

    try {
      const response = await fetch(`${NEXT_PUBLIC_BASE_URL}/generate-question?topic=${topic}`);
      if (!response.ok) {
        throw new Error("FastAPI failed to generate a question.");
      }

      const data = await response.json();
      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error fetching AI-generated question:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch AI-generated question" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return new Response(
    JSON.stringify({ message: "Method Not Allowed" }),
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
}
