// Vercel serverless function — wraps the React Router Node.js server
const { createRequestHandler } = await import("@react-router/node");
const build = await import("../build/server/index.js");

const handler = createRequestHandler({ build });

export default async function (req, res) {
  try {
    await handler(req, res);
  } catch (err) {
    console.error("BargainBot server error:", err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
}
