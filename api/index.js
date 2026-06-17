// Vercel serverless entry — bridges Node.js http to React Router's fetch-based handler
import { createRequestHandler } from "@react-router/node";

let handler;

export default async function (req, res) {
  try {
    if (!handler) {
      const build = await import("../build/server/index.js");
      handler = createRequestHandler({ build, mode: "production" });
    }
    return handler(req, res);
  } catch (error) {
    console.error("[BargainBot] Serverless function error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("Internal Server Error: " + error.message);
  }
}
