/**
 * Edge Function proxy for GLM (z.ai) models.
 * Holds ZAI_API_KEY server-side so it is never bundled into the client JS.
 * The OpenAI SDK in OpenAIAgent sends requests to /api/glm, which Next.js
 * routes here at /api/glm/chat/completions.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GLM proxy not configured — set ZAI_API_KEY in Vercel env vars" },
      { status: 500 },
    );
  }

  const body = await req.text();

  const upstream = await fetch(
    "https://api.z.ai/api/coding/paas/v4/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    },
  );

  const data = await upstream.text();
  return new NextResponse(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
