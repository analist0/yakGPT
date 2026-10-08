// Server side of the fetch_url tool: fetches a page (avoiding browser CORS) and
// returns readable text.
import type { NextApiRequest, NextApiResponse } from "next";
import { requireLocal } from "@/lib/serverAccess";

const MAX_CHARS = 20000;

const htmlToText = (html: string) =>
  html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireLocal(req, res)) return;

  let url: URL;
  try {
    url = new URL(req.body?.url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Hamal fetch_url tool)" },
      signal: AbortSignal.timeout(15000),
    });
    const type = response.headers.get("content-type") || "";
    const body = await response.text();
    const text = type.includes("html") ? htmlToText(body) : body;
    return res.json({
      status: response.status,
      contentType: type,
      text: text.slice(0, MAX_CHARS),
      truncated: text.length > MAX_CHARS,
    });
  } catch (error) {
    return res.status(502).json({ error: (error as Error).message });
  }
}
