import chalk from "chalk";
import type { AccountResult } from "./api.js";

const W = 68;

export const header = (title: string) => {
  console.log("\n" + chalk.cyan("═".repeat(W)));
  console.log(chalk.cyan.bold(`  🦙  ${title}`));
  console.log(chalk.cyan("═".repeat(W)));
};

export const rule = () => console.log(chalk.cyan("─".repeat(W)));

export function printActiveBanner(user: string | null): void {
  if (!user) {
    console.log(chalk.dim("\n  No user currently signed in to Ollama."));
    return;
  }
  console.log(`\n  ${chalk.bold("Current session")}`);
  console.log(`  ${chalk.green("●")} ${chalk.bold.magenta(user)}`);
}

export function printDashboard(results: AccountResult[]): void {
  results.forEach((r, i) => {
    const isExhausted = r.exhausted;
    const bullet = isExhausted ? chalk.red("✗") : chalk.green("✓");
    const status = isExhausted
      ? chalk.yellow("quota exhausted")
      : chalk.green("available");

    console.log(`  ${bullet} ${chalk.bold(r.email)}  ${status}`);
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
