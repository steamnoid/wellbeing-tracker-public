import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const SESSION_SECRET_FILE = fileURLToPath(
  new URL("../../.session-secret", import.meta.url)
);

function readOrCreateSecretFile() {
  if (!existsSync(SESSION_SECRET_FILE)) {
    mkdirSync(dirname(SESSION_SECRET_FILE), { recursive: true });
    const secret = randomBytes(32).toString("hex");
    writeFileSync(SESSION_SECRET_FILE, `${secret}\n`, { mode: 0o600 });
    return secret;
  }

  const existing = readFileSync(SESSION_SECRET_FILE, "utf8").trim();
  if (existing) {
    return existing;
  }

  const secret = randomBytes(32).toString("hex");
  writeFileSync(SESSION_SECRET_FILE, `${secret}\n`, { mode: 0o600 });
  return secret;
}

export function getSessionSecret() {
  const secret = process.env.JWT_SECRET || readOrCreateSecretFile();
  return new TextEncoder().encode(secret);
}
