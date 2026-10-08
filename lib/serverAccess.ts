import type { NextApiRequest, NextApiResponse } from "next";

// Routes that run commands or touch the host machine are only served to the
// local machine, unless YAKGPT_LOCAL_FEATURES=1 (e.g. inside Docker).
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export const allowLocalFeatures = (req: NextApiRequest) =>
  process.env.YAKGPT_LOCAL_FEATURES === "1" ||
  LOOPBACK.has(req.socket.remoteAddress || "");

export const requireLocal = (req: NextApiRequest, res: NextApiResponse) => {
  if (allowLocalFeatures(req)) return true;
  res.status(403).json({
    error:
      "Local features are only available from this machine. Set YAKGPT_LOCAL_FEATURES=1 to allow them.",
  });
  return false;
};
