import { AgentStore } from "./store.mjs";

try {
  const store = await AgentStore.open(process.env.AGENT_STATE_FILE ?? "/var/lib/warehouse-agent/state.json");
  const [command = "list", key] = process.argv.slice(2);
  if (command === "list") console.info(JSON.stringify({ pending: store.state.pending.length, reports: [...store.state.reports].reverse().map((item) => ({
    id: item.task.key, createdAt: new Date(item.createdAt).toISOString(), status: item.status, summary: item.summary,
  })) }, null, 2));
  else if (command === "show" && /^[a-f0-9]{64}$/.test(key ?? "")) {
    const report = store.state.reports.find((item) => item.task.key === key);
    if (!report) throw new Error("REPORT_NOT_FOUND");
    console.info(JSON.stringify(report, null, 2));
  } else throw new Error("USAGE: reports.mjs list | show <report-id>");
} catch { console.error("Cannot read report. Usage: reports.mjs list | show <report-id>; check state volume and report ID."); process.exitCode = 1; }
