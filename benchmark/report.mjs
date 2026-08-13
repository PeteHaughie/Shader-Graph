import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RESULTS_FILE = new URL("results.jsonl", import.meta.url);
const TASKS = JSON.parse(readFileSync(new URL("tasks.json", import.meta.url), "utf-8"));

function loadResults() {
  if (!existsSync(RESULTS_FILE)) return [];
  return readFileSync(RESULTS_FILE, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function generateReport(results) {
  const taskNames = new Map(TASKS.map((t) => [t.id, t.name]));

  let report = "# Benchmark Results\n\n";
  report += `Run on: ${new Date().toISOString()}\n`;
  report += `Total runs: ${results.length}\n\n`;

  report += "## Summary\n\n";
  report += "| Task | Mode | Compiles? | Primitives | Nodes | Params OK | Score |\n";
  report += "|------|------|-----------|------------|-------|-----------|-------|\n";

  for (const r of results) {
    const taskName = taskNames.get(r.taskId) ?? r.taskId;
    const compiles = r.score.compiles ? "Yes" : "No";
    const primitives = r.score.missingPrimitives.length === 0
      ? `All ${r.score.primitivesFound.length}`
      : `Missing: ${r.score.missingPrimitives.join(", ")}`;
    const params = r.score.allParamsInRange ? "Yes" : r.score.paramViolations.join("; ");
    report += `| ${taskName} | ${r.mode} | ${compiles} | ${primitives} | ${r.score.nodeCount} | ${params} | ${r.score.totalScore}/100 |\n`;
  }

  report += "\n## Scoring\n\n";
  report += "| Metric | Weight |\n";
  report += "|--------|--------|\n";
  report += "| Compiles | 40 pts |\n";
  report += "| Required primitives present | 20 pts (-5 per missing) |\n";
  report += "| Node count >= minimum | 20 pts (pro-rata) |\n";
  report += "| All parameters in range | 20 pts |\n";

  report += "\n## Mode Comparison\n\n";
  const graphRuns = results.filter((r) => r.mode === "graph");
  const textRuns = results.filter((r) => r.mode === "text");

  if (graphRuns.length > 0 && textRuns.length > 0) {
    const avgGraph = graphRuns.reduce((s, r) => s + r.score.totalScore, 0) / graphRuns.length;
    const avgText = textRuns.reduce((s, r) => s + r.score.totalScore, 0) / textRuns.length;
    const graphCompile = graphRuns.filter((r) => r.score.compiles).length / graphRuns.length;
    const textCompile = textRuns.filter((r) => r.score.compiles).length / textRuns.length;

    report += "| Metric | Graph (Mode A) | Text (Mode B) |\n";
    report += "|--------|---------------|---------------|\n";
    report += `| Average score | ${avgGraph.toFixed(1)} | ${avgText.toFixed(1)} |\n`;
    report += `| Compile rate | ${(graphCompile * 100).toFixed(0)}% | ${(textCompile * 100).toFixed(0)}% |\n`;
  }

  report += "\n## Detailed Results\n\n";
  for (const task of TASKS) {
    const taskResults = results.filter((r) => r.taskId === task.id);
    if (taskResults.length === 0) continue;

    report += `### ${task.name}\n\n`;
    report += `${task.scoring.description}\n\n`;
    report += `Required: ${task.scoring.requiredPrimitives.join(", ")} (min ${task.scoring.minNodes} nodes)\n\n`;

    for (const r of taskResults) {
      report += `#### ${r.mode === "graph" ? "Graph (Mode A)" : "Text (Mode B)"}\n\n`;
      report += `- **Score:** ${r.score.totalScore}/100\n`;
      report += `- **Compiles:** ${r.score.compiles ? "Yes" : `No — ${r.score.compileError}`}\n`;
      report += `- **Primitives:** ${r.score.primitivesFound.join(", ") || "none"}\n`;
      report += `- **Nodes:** ${r.score.nodeCount}\n`;
      report += `- **Params in range:** ${r.score.allParamsInRange ? "Yes" : `No — ${r.score.paramViolations.join("; ")}`}\n`;
      if (r.iterations) report += `- **Iterations:** ${r.iterations}\n`;
      if (r.timeSeconds) report += `- **Time:** ${r.timeSeconds}s\n`;
      if (r.notes) report += `- **Notes:** ${r.notes}\n`;
      report += "\n";
    }
  }

  return report;
}

if (process.argv[1]?.endsWith("report.mjs")) {
  const results = loadResults();
  if (results.length === 0) {
    console.log("No results found. Run the benchmark first.");
    process.exit(1);
  }
  const report = generateReport(results);
  console.log(report);

  const reportPath = new URL("REPORT.md", import.meta.url).pathname;
  writeFileSync(reportPath, report);
  console.log(`Report saved to ${reportPath}`);
}
