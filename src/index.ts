import ora from "ora";
import { execSync } from "child_process";
import { checkAccount } from "./api.js";
import {
  header,
  printActiveBanner,
  printDashboard,
} from "./ui.js";

// ─── Load accounts ────────────────────────────────────────────────────────────
const ACCOUNTS: { email: string; key: string }[] = (await import("../key.js"))
  .default;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCurrentUser(): string | null {
  try {
    const output = execSync("ollama login", { encoding: "utf8" });
    const match = output.match(/signed in as user '([^']+)'/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  header("ACCOUNT STATUS");

  const currentUser = getCurrentUser();
  printActiveBanner(currentUser);

  const spinner = ora({
    text: "Checking account quotas...",
    prefixText: "\n ",
  }).start();

  const results = await Promise.all(ACCOUNTS.map(checkAccount));
  spinner.succeed("Done");

  const available = results.filter(r => r.ok && !r.exhausted);

  printDashboard(available);
}

// ─── Entry ────────────────────────────────────────────────────────────────────
await main();
