import { readFile } from "node:fs/promises";
import { DailyStore } from "./daily-store.mjs";
import { previousDate, validDate } from "./daily-source.mjs";
import { renderDailyReport } from "./daily-facts.mjs";

try {
  const [command = "list", date] = process.argv.slice(2);
  const token = (await readFile(process.env.AGENT_TOKEN_FILE ?? "/run/secrets/agent_webhook_token", "utf8")).trim();
  if (["request", "retry", "notify"].includes(command) && validDate(date)) {
    const response = await fetch(`http://127.0.0.1:8080/daily-orders${command === "notify" ? "/notify" : ""}`, { method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ date, retry: command === "retry" }), signal: AbortSignal.timeout(10000) });
    if (response.status !== 202) throw new Error("DAILY_REQUEST_FAILED");
    console.info(JSON.stringify(await response.json()));
  } else {
    const store = await DailyStore.open(process.env.ORDER_DAILY_STATE_FILE ?? "/var/lib/warehouse-agent/orders-daily.json");
    const reports = store.state.reports;
    if (command === "list") console.info(JSON.stringify(Object.values(reports).sort((a, b) => b.date.localeCompare(a.date)).map((report) => ({
      date: report.date, snapshotReady: Boolean(report.snapshot), aiStatus: report.aiStatus, capturedAt: report.snapshot?.capturedAt ?? null,
      notificationStatus: report.delivery?.status ?? "not-requested", deliveredAt: report.delivery?.deliveredAt ?? null,
    })), null, 2));
    else if (["show", "json"].includes(command) && validDate(date) && reports[date]) {
      console.info(command === "json" ? JSON.stringify(reports[date], null, 2) : renderDailyReport(reports[date], reports[previousDate(date)], token));
    } else throw new Error("INVALID_DAILY_COMMAND");
  }
} catch { console.error("Daily orders: list | request YYYY-MM-DD | retry YYYY-MM-DD | notify YYYY-MM-DD | show YYYY-MM-DD | json YYYY-MM-DD. Check service, date and report state."); process.exitCode = 1; }
