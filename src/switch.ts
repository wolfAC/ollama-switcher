import os from "os";
import path from "path";
import { execSync, spawnSync, spawn } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import type { Account } from "./api.js";

const ROOT       = fileURLToPath(new URL("..", import.meta.url));
const STATE_FILE = path.join(ROOT, ".ollama-active.json");

// System Firefox keeps its profiles here on this machine (XDG layout).
const FF_PROFILES = path.join(os.homedir(), ".config", "mozilla", "firefox");

export interface ActiveState {
  email:      string;
  user:       string;
  switchedAt: string;
}

// ─── Local state (maps the signed-in ollama username back to an account) ──────
export function readState(): ActiveState | null {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

export function writeState(state: ActiveState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

// ─── Ollama CLI interaction ───────────────────────────────────────────────────
export function getCurrentUser(): string | null {
  try {
    const output = execSync("ollama signin", {
      encoding: "utf8",
      env: noBrowserEnv(),
      timeout: 15_000,
    });
    const match = output.match(/signed in as user '([^']+)'/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function signout(): void {
  try {
    execSync("ollama signout", { encoding: "utf8", timeout: 15_000 });
  } catch {
    // already signed out
  }
}

// `ollama signin` auto-opens the *default* browser profile (wrong account).
// Shadow xdg-open so it can't — we open the right profile ourselves.
function noBrowserEnv(): NodeJS.ProcessEnv {
  const dir  = path.join(os.tmpdir(), "ollama-switcher-stub");
  const stub = path.join(dir, "xdg-open");
  if (!existsSync(stub)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(stub, "#!/bin/sh\nexit 0\n");
    chmodSync(stub, 0o755);
  }
  return { ...process.env, PATH: `${dir}:${process.env.PATH}` };
}

export function getConnectUrl(): string {
  const res = spawnSync("ollama", ["signin"], {
    encoding: "utf8",
    env: noBrowserEnv(),
    timeout: 15_000,
  });
  const out   = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  const match = out.match(/https:\/\/ollama\.com\/connect\?\S+/);
  if (!match) throw new Error(`Could not find connect URL in signin output:\n${out.trim()}`);
  return match[0];
}

export async function waitForSignin(timeoutMs = 180_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const user = getCurrentUser();
    if (user) return user;
    await new Promise(r => setTimeout(r, 3_000));
  }
  return null;
}

// ─── Per-account Firefox profile ──────────────────────────────────────────────
// Each account gets its own real-Firefox profile so it stays logged in. Real
// Firefox passes Cloudflare; once logged in, switching is just "click Continue".
function profileDir(account: Account): string {
  const slug = account.email.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(FF_PROFILES, `ollama-sw.${slug}`);
}

export function isLoggedIn(account: Account): boolean {
  return existsSync(path.join(profileDir(account), "cookies.sqlite"));
}

function openInProfile(account: Account, url: string): void {
  const dir = profileDir(account);
  mkdirSync(dir, { recursive: true });
  spawn(
    "firefox",
    ["--new-instance", "--profile", dir, "--name", `ollama-${account.email}`, url],
    { detached: true, stdio: "ignore" },
  ).unref();
}

function copyToClipboard(text: string): boolean {
  try {
    spawnSync("wl-copy", [text], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

// ─── Orchestration ────────────────────────────────────────────────────────────
export async function switchTo(account: Account): Promise<string> {
  signout();
  const connectUrl  = getConnectUrl();
  const returning   = isLoggedIn(account);

  if (returning) {
    console.log(`\n  Opening Firefox for ${account.email} — click "Continue" to approve.`);
  } else {
    console.log(`\n  First time for ${account.email} — a Firefox window will open.`);
    console.log(`  Sign in (Cloudflare check is fine in real Firefox), then click "Continue".`);
    if (account.password && copyToClipboard(account.password)) {
      console.log(`  ↳ Password copied to clipboard — paste it (Ctrl+V). Email: ${account.email}`);
    }
  }

  openInProfile(account, connectUrl);
  console.log(`  Waiting for sign-in to complete (up to 3 min)...`);

  const user = await waitForSignin();
  if (!user) {
    throw new Error(
      "Sign-in did not complete in time. If no window opened, run:\n" +
      `    firefox --new-instance --profile '${profileDir(account)}' '${connectUrl}'`,
    );
  }

  writeState({ email: account.email, user, switchedAt: new Date().toISOString() });
  return user;
}

/** Pre-seed an account's profile by opening ollama.com so you can log in once. */
export function seedLogin(account: Account): void {
  if (account.password && copyToClipboard(account.password)) {
    console.log(`  ↳ Password for ${account.email} copied to clipboard (paste with Ctrl+V).`);
  }
  openInProfile(account, "https://ollama.com/signin");
}
