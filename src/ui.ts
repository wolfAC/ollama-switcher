import chalk from "chalk";
import { isUsable, type AccountResult } from "./api.js";

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
    switch (r.state) {
      case "available":
        icon  = chalk.green("✓");
        label = chalk.green("available");
        if (r.remaining != null) label += chalk.dim(`  (${r.remaining} left)`);
        break;
      case "rate_limited":
        icon  = chalk.cyan("↻");
        label = chalk.cyan("rate-limited") +
          chalk.dim(r.retryAfter != null ? `  (retry ${r.retryAfter}s — has quota)` : "  (has quota)");
        break;
      case "exhausted":
        icon  = chalk.yellow("◐");
        label = chalk.yellow("exhausted");
        break;
      case "unauthorized":
        icon  = chalk.red("✗");
        label = chalk.red("invalid key");
        break;
      default:
        icon  = chalk.red("✗");
        label = chalk.red(r.error ?? "error");
    }

    console.log(`  ${icon} ${chalk.bold(r.email)}  ${label}  ${tags.join(" ")}`);
  }

  const usable = results.filter(isUsable).length;

  console.log();
  rule();
  console.log(`  ${chalk.green(`${usable} of ${results.length} accounts usable`)}`);
  rule();
}
