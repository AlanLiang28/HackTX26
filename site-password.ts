// Password for the whole site: pages and API. The browser shows its own sign-in box (HTTP Basic Auth);
// any username works, only the password is checked. Off when SITE_PASSWORD is unset, e.g. in local dev.
// Basic Auth sends the password with every request, so serve the site over HTTPS (Caddy does by default).
import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

// Hash both sides so timingSafeEqual gets equal lengths and doesn't leak the password's length.
const digest = (s: string) => createHash("sha256").update(s).digest();

export function sitePassword(password: string | undefined) {
  if (!password) return (_req: Request, _res: Response, next: NextFunction) => next();
  const expected = digest(password);
  return (req: Request, res: Response, next: NextFunction) => {
    const [scheme, encoded] = (req.headers.authorization ?? "").split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (timingSafeEqual(digest(given), expected)) return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="StudyRaid", charset="UTF-8"');
    res.status(401).send("Password required.");
  };
}
