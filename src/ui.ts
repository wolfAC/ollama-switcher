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

export function printDashboard(
  results: AccountResult[],
  bestEmail: string | null,
  activeEmail: string | null,
): void {
  console.log();
  for (const r of results) {
    const tags: string[] = [];
    if (r.email === activeEmail) tags.push(chalk.magenta("active"));
    if (r.email === bestEmail)   tags.push(chalk.cyan("★ best"));

    let icon: string, label: string;
    if (r.ok && !r.exhausted) {
      icon  = chalk.green("✓");
      label = chalk.green("available");
      if (r.probe?.remaining != null) label += chalk.dim(`  (${r.probe.remaining} left)`);
    } else if (r.exhausted) {
      icon  = chalk.yellow("◐");
      label = chalk.yellow("exhausted");
    } else {
      icon  = chalk.red("✗");
      label = chalk.red(r.error ?? "error");
    }

    console.log(`  ${icon} ${chalk.bold(r.email)}  ${label}  ${tags.join(" ")}`);
  }

  const available = results.filter(r => r.ok && !r.exhausted).length;

  console.log();
  rule();
  console.log(`  ${chalk.green(`${available} of ${results.length} accounts available`)}`);
  rule();
}
