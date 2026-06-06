import chalk from "chalk";
import type { AccountResult } from "./api.js";
import type { ActiveState } from "./state.js";

const W = 68;

export const header = (title: string) => {
  console.log("\n" + chalk.cyan("═".repeat(W)));
  console.log(chalk.cyan.bold(`  🦙  ${title}`));
  console.log(chalk.cyan("═".repeat(W)));
};

export const rule = () => console.log(chalk.cyan("─".repeat(W)));

export function maskKey(k: string): string {
  if (!k || k.startsWith("sk-your")) return chalk.red("not configured");
  return k.slice(0, 10) + "…" + k.slice(-4);
}

export function printActiveBanner(
  active: ActiveState | null,
  accounts: { key: string }[],
): void {
  if (!active) {
    console.log(chalk.dim("\n  No active account — run script to pick one."));
    return;
  }
  const stillInKeyJs = accounts.some((a) => a.key === active.key);
  console.log(`\n  ${chalk.bold("Currently active")}`);
  console.log(`  ${chalk.green("●")} ${chalk.bold.magenta(active.email)}`);
  console.log(`    ${chalk.dim("key:")}      ${maskKey(active.key)}`);
  console.log(`    ${chalk.dim("switched:")} ${active.switchedAt}`);
  if (!stillInKeyJs)
    console.log(`    ${chalk.yellow("⚠  This key is no longer in key.js")}`);
}

export function printDashboard(
  results: AccountResult[],
  active: ActiveState | null,
): void {
  results.forEach((r, i) => {
    const isActive = active?.key === r.key;
    const bullet = isActive ? chalk.green("●") : chalk.dim("○");
    const email = isActive
      ? chalk.bold.magenta(r.email) + "  " + chalk.green("← active")
      : chalk.bold(r.email);

    console.log(`\n  [${i}] ${bullet} ${email}`);
    console.log(`      ${chalk.dim("key")}      ${maskKey(r.key)}`);
    console.log(`      ${chalk.dim("ping")}     ${r.pingMs}ms`);

    if (r.key.startsWith("sk-your")) {
      console.log(`      ${chalk.yellow("⚠  not configured")}`);
      return;
    }
    if (!r.ok) {
      console.log(`      ${chalk.red("✗")} ${r.error}`);
      return;
    }
    if (r.exhausted) {
      console.log(`      ${chalk.yellow("⊘  quota exhausted")}`);
      return;
    }

    console.log(
      `      ${chalk.dim("status")}   ${chalk.green("✓ authenticated")}`,
    );

    if (r.models.length) {
      const shown = r.models.slice(0, 5).join("  ");
      const extra =
        r.models.length > 5 ? chalk.dim(` +${r.models.length - 5} more`) : "";
      console.log(`      ${chalk.dim("models")}   ${shown}${extra}`);
    }

    if (r.probe) {
      const p = r.probe;
      console.log(
        `      ${chalk.dim("probe")}    ` +
          `in:${chalk.cyan(p.promptTokens + "tok")}  ` +
          `out:${chalk.cyan(p.outputTokens + "tok")}` +
          (p.loadMs ? `  ${chalk.dim(p.loadMs + "ms")}` : ""),
      );
      if (p.remaining !== null) {
        console.log(
          `      ${chalk.dim("remaining")} ${chalk.yellow(String(p.remaining))}`,
        );
      }
    }
  });

  const ok = results.filter((r) => r.ok && !r.exhausted).length;
  const exhausted = results.filter((r) => r.exhausted).length;
  const invalid = results.filter((r) => !r.ok && !r.exhausted).length;
  const total = results.filter((r) => !r.key.startsWith("sk-your")).length;

  console.log();
  rule();
  console.log(
    `  ${chalk.green(ok + " available")}  ` +
      (exhausted ? chalk.yellow(exhausted + " exhausted  ") : "") +
      (invalid ? chalk.red(invalid + " invalid  ") : "") +
      chalk.dim(`of ${total} accounts`),
  );
  rule();
}

export function printMenu(): void {
  console.log(`
  ${chalk.bold("What do you want to do?")}
  ${chalk.dim("[0-9]")}  Switch to account
  ${chalk.dim("[l]")}    List all models across accounts
  ${chalk.dim("[t]")}    Test all keys (ping)
  ${chalk.dim("[q]")}    Quit
`);
}

export function printSwitchInstructions(
  email: string,
  key: string,
  model: string,
  wrapperPath: string,
): void {
  console.log(`
  ${chalk.green("✓")} Switched to ${chalk.bold.magenta(email)}

  ${chalk.bold("The script has written:")} ${chalk.cyan("ollama-switch.sh")}

  ${chalk.bold("Run this ONE command — it sets env vars AND launches:")}

  ${chalk.cyan("source ./ollama-switch.sh")}

  ${chalk.dim("Why source and not bash/node? Because only `source` runs")}
  ${chalk.dim("in the current shell, so the exported vars survive after launch.")}

  ${chalk.bold("Or set manually then launch:")}
  ${chalk.cyan("export OLLAMA_API_KEY=" + key)}
  ${chalk.cyan("export ANTHROPIC_API_KEY=" + key)}
  ${chalk.cyan("export ANTHROPIC_BASE_URL=https://ollama.com")}
  ${chalk.cyan("ollama launch claude --model " + model)}
`);
}
