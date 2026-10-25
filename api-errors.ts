// JSON for every API failure, in the same { error, message } shape as the routes. Without these an unknown
// /api route gets the site's index.html with a 200, and bad JSON or a too-big body gets Express's default
// HTML error page, which prints the stack trace.
import type { NextFunction, Request, Response } from "express";

// Mount under /api after every API router and before the site's catch-all.
export function apiNotFound(_req: Request, res: Response) {
  res.status(404).json({ error: "not_found", message: "No such API route." });
}

// Mount last.
export function apiErrors(
  err: { status?: number; type?: string; message?: string; code?: string },
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) return next(err); // mid-stream: only Express can close the connection
  console.error(err);
  // 22021: Postgres refusing a NUL byte that came in with the request (in the URL or a JSON string)
  if (err.code === "22021") res.status(400).json({ error: "bad_request", message: "Bad request." });
  else if (err.status) res.status(err.status).json({ error: err.type ?? "bad_request", message: err.message ?? "Bad request." });
  else res.status(500).json({ error: "internal", message: "Something went wrong." });
}
