import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Account } from "./api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, "..", ".ollama-active.json");
const ENV_FILE = path.join(__dirname, "..", ".ollama-active.env");

export interface ActiveState extends Account {
  switchedAt: string;
}

export function saveActive(acc: Account): void {
  const state: ActiveState = { ...acc, switchedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  fs.writeFileSync(
    ENV_FILE,
    `OLLAMA_API_KEY=${acc.key}\n# Account: ${acc.email}\n`,
  );
}

export function loadActive(): ActiveState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function timeSince(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}
