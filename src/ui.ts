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
  results.forEach((r) => {
    console.log(`  ${chalk.green("✓")} ${chalk.bold(r.email)}  ${chalk.green("available")}`);
  });

  const total = results.length;

  console.log();
  rule();
  console.log(`  ${chalk.green(total + " accounts available")}`);
  rule();
}
