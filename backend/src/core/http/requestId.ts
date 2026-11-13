import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

/** Inbound IDs are accepted only if they look like an ID, so they cannot inject log content. */
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.header("x-request-id");
  const id = inbound !== undefined && SAFE_ID.test(inbound) ? inbound : randomUUID();
  res.locals["requestId"] = id;
  res.setHeader("X-Request-Id", id);
  next();
};
