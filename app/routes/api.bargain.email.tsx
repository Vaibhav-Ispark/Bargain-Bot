/**
 * POST /api/bargain/email
 *
 * Saves a customer's email to an existing session.
 * Called from the widget after the user submits their email.
 *
 * Body: { sessionId: number; email: string }
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import db from "../db.server";

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = request.headers.get("origin") ?? "*";
  return new Response(null, { status: 204, headers: cors(origin) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const origin = request.headers.get("origin") ?? "*";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  try {
    const body = await request.json() as { sessionId: number; email: string };
    const { sessionId, email } = body;

    if (!sessionId) {
      return Response.json({ error: "sessionId required" }, { status: 400, headers: cors(origin) });
    }

    const trimmedEmail = (email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(trimmedEmail)) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400, headers: cors(origin) });
    }

    const session = await db.bargainSession.findUnique({ where: { id: Number(sessionId) } });
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404, headers: cors(origin) });
    }

    await db.bargainSession.update({
      where: { id: session.id },
      data:  { customerEmail: trimmedEmail },
    });

    return Response.json({ ok: true }, { status: 200, headers: cors(origin) });
  } catch (err) {
    console.error("[bargain/email]", err);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: cors(origin) });
  }
};
