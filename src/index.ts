import ora from "ora";
import { createInterface } from "readline";

import chalk from "chalk";
import { checkAccount, getModels, probeGenerate } from "./api.js";
import { writeLaunchScript } from "./launch.js";
import { loadActive, saveActive } from "./state.js";
import {
  header,
  printActiveBanner,
  printDashboard,
  printMenu,
  printSwitchInstructions,
} from "./ui.js";

// ─── Load accounts ────────────────────────────────────────────────────────────
const ACCOUNTS: { email: string; key: string }[] = (await import("../key.js"))
  .default;

const MODEL = "gemma4:31b-cloud";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function applyAndWrite(acc: { email: string; key: string }): void {
  saveActive(acc);
  const wrapper = writeLaunchScript(acc.key, MODEL);
  printSwitchInstructions(acc.email, acc.key, MODEL, wrapper);
}

// ─── Modes ────────────────────────────────────────────────────────────────────

async function statusMode() {
  header("ACTIVE ACCOUNT");
  printActiveBanner(loadActive(), ACCOUNTS);
  console.log();
}

async function listMode() {
  header("ALL MODELS");
  const spinner = ora("Fetching models...").start();
  const results = await Promise.all(ACCOUNTS.map(checkAccount));
  spinner.stop();
  results.forEach((r) => {
    if (!r.ok) {
      console.log(
        `  ${chalk.red("✗")} ${r.email}  ${chalk.dim(r.error ?? "")}`,
      );
      return;
    }
    console.log(`\n  ${chalk.green("✓")} ${chalk.bold(r.email)}`);
    r.models.forEach((m) => console.log(`    ${chalk.dim("•")} ${m}`));
  });
  console.log();
}

async function testMode() {
  header("KEY TEST");
  const spinner = ora("Pinging all keys...").start();
  const results = await Promise.all(ACCOUNTS.map(checkAccount));
  spinner.stop();
  results.forEach((r) => {
    const icon = r.ok ? chalk.green("✓") : chalk.red("✗");
    const info = r.ok ? chalk.green("valid") : chalk.red(r.error ?? "");
    console.log(
      `  ${icon} ${chalk.bold(r.email)}  ${chalk.dim(r.pingMs + "ms")}  ${info}`,
    );
  });
  console.log(
    `\n  ${results.filter((r) => r.ok).length}/${results.length} keys valid\n`,
  );
}

async function autoMode() {
  const spinner = ora("Finding best account...").start();
  const results = await Promise.all(ACCOUNTS.map(checkAccount));
  spinner.stop();
  const next = results.find((r) => r.ok && !r.exhausted);
  if (!next) {
    console.log(chalk.red("  ✗ All accounts exhausted.\n"));
    process.exit(1);
  }
  applyAndWrite(next);
}

async function watchMode() {
  header("WATCH MODE");
  console.log(chalk.dim(`\n  Monitoring active account every 60s...\n`));
  async function tick() {
    const active = loadActive();
    if (!active) {
      console.log(chalk.yellow("  No active account set."));
      return;
    }
    try {
      const models = await getModels(active.key);
      const probe = await probeGenerate(active.key, models[0] ?? MODEL);
      if (!probe?.exhausted) {
        process.stdout.write(
          `\r  ${chalk.green("✓")} ${active.email}  ${chalk.dim(new Date().toLocaleTimeString())}   `,
        );
        return;
      }
    } catch {
      // ignore
    }
    console.log(
      `\n\n  ${chalk.yellow("⊘")} ${chalk.bold(active.email)} exhausted — switching...`,
    );
    const all = await Promise.all(ACCOUNTS.map(checkAccount));
    const next = all.find(
      (a) => a.email !== active.email && a.ok && !a.exhausted,
    );
    if (!next) {
      console.log(chalk.red("  ✗ All exhausted.\n"));
      process.exit(1);
    }
    applyAndWrite(next);
    console.log(chalk.dim(`\n  Run: source ./ollama-switch.sh\n`));
  }
  await tick();
  setInterval(tick, 60_000);
}

async function interactiveMode() {
  header("MULTI-ACCOUNT DASHBOARD");
  printActiveBanner(loadActive(), ACCOUNTS);

  const spinner = ora({
    text: "Checking all accounts...",
    prefixText: "\n ",
  }).start();
  const results = await Promise.all(ACCOUNTS.map(checkAccount));
  spinner.succeed("Done");

  printDashboard(results, loadActive());
  printMenu();

  const input = await readLine("  > ");
  const num = parseInt(input, 10);

  if (!isNaN(num) && results[num]) {
    let chosen = results[num];
    if (!chosen.ok || chosen.exhausted) {
      console.log(
        chalk.yellow(
          "\n  That account has no quota — picking next available.\n",
        ),
      );
      const next = results.find((r) => r.ok && !r.exhausted);
      if (!next) {
        console.log(chalk.red("  ✗ All exhausted.\n"));
        return;
      }
      chosen = next;
    }
    applyAndWrite(chosen);
    return;
  }

  if (input === "l") return listMode();
  if (input === "t") return testMode();
  if (input === "q") return;
  console.log(chalk.dim("\n  No valid input.\n"));
}

// ─── Entry ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--status")) await statusMode();
else if (args.includes("--list")) await listMode();
else if (args.includes("--test")) await testMode();
else if (args.includes("--auto")) await autoMode();
else if (args.includes("--watch")) await watchMode();
else await interactiveMode();
