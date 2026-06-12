import ora from "ora";
import { checkAccount, type AccountResult } from "./api.js";
import {
  getCurrentUser,
  isLoggedIn,
  readState,
  seedLogin,
  switchTo,
} from "./switch.js";
import { header, printActiveBanner, printDashboard } from "./ui.js";

// ─── Load accounts ────────────────────────────────────────────────────────────
const ACCOUNTS: { email: string; key: string; password?: string }[] = (
  await import("../key.js")
).default;

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function probeAll(): Promise<AccountResult[]> {
  const spinner = ora({
    text: "Checking account quotas...",
    prefixText: "\n ",
  }).start();
  const results = await Promise.all(ACCOUNTS.map(checkAccount));
  spinner.succeed("Done");
  return results;
}

function pickBest(results: AccountResult[]): AccountResult | null {
  const available = results.filter(r => r.ok && !r.exhausted);
  available.sort(
    (a, b) => (b.probe?.remaining ?? -1) - (a.probe?.remaining ?? -1),
  );
  return available[0] ?? null;
}

function activeEmail(currentUser: string | null): string | null {
  const state = readState();
  if (currentUser && state && state.user === currentUser) return state.email;
  return null;
}

// ─── Modes ────────────────────────────────────────────────────────────────────
async function status(): Promise<void> {
  header("ACCOUNT STATUS");

  const currentUser = getCurrentUser();
  printActiveBanner(currentUser);

  const results = await probeAll();
  printDashboard(results, pickBest(results)?.email ?? null, activeEmail(currentUser));
}

async function auto(): Promise<boolean> {
  header("AUTO SWITCH");

  const currentUser = getCurrentUser();
  printActiveBanner(currentUser);

  const results = await probeAll();
  const best    = pickBest(results);
  const current = activeEmail(currentUser);

  printDashboard(results, best?.email ?? null, current);

  const currentResult = results.find(r => r.email === current);
  if (currentUser && currentResult?.ok && !currentResult.exhausted) {
    console.log(`\n  Current account ${current} still has quota — no switch needed.\n`);
    return true;
  }

  if (!best) {
    console.log("\n  All accounts are exhausted or failing — nothing to switch to.\n");
    return false;
  }

  console.log(`\n  Switching to ${best.email}...`);
  const user = await switchTo(best);
  console.log(`\n  ✓ Signed in as '${user}' (${best.email})\n`);
  return true;
}

async function watch(): Promise<void> {
  const minutes  = Number(process.env.WATCH_INTERVAL_MIN ?? 5);
  const interval = Math.max(1, minutes) * 60_000;

  for (;;) {
    try {
      await auto();
    } catch (err: any) {
      console.error(`\n  Watch cycle failed: ${err.message}\n`);
    }
    console.log(`  Next check in ${Math.max(1, minutes)} min — Ctrl-C to stop.`);
    await new Promise(r => setTimeout(r, interval));
  }
}

function login(): void {
  header("BROWSER LOGIN");
  console.log(
    "\n  Pre-seeding Firefox profiles. A window opens for each account that\n" +
    "  isn't logged in yet — sign in once. Afterwards switching is one click.\n",
  );

  let opened = 0;
  for (const acc of ACCOUNTS) {
    if (isLoggedIn(acc)) {
      console.log(`  ✓ ${acc.email} — already logged in`);
      continue;
    }
    console.log(`  → ${acc.email} — opening Firefox...`);
    seedLogin(acc);
    opened++;
  }

  if (opened) {
    console.log(`\n  Finish signing in to the ${opened} window(s) that opened, then re-run.`);
  }
  console.log();
}

async function switchManual(email: string): Promise<void> {
  header("MANUAL SWITCH");
  const acc = ACCOUNTS.find(a => a.email === email);
  if (!acc) {
    console.error(`\n  No account '${email}' in key.ts. Known: ${ACCOUNTS.map(a => a.email).join(", ")}\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n  Switching to ${acc.email}...`);
  const user = await switchTo(acc);
  console.log(`\n  ✓ Signed in as '${user}' (${acc.email})\n`);
}

// ─── Entry ────────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const switchIdx   = args.indexOf("--switch");

if (args.includes("--watch"))      await watch();
else if (args.includes("--auto"))  await auto();
else if (args.includes("--login")) login();
else if (switchIdx !== -1)         await switchManual(args[switchIdx + 1] ?? "");
else                               await status();
