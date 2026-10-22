import { analysisTask } from "../alerting/analysis.mjs";
import { createTools } from "./tools.mjs";

try {
  const task = analysisTask({ status: "firing", alerts: [{ status: "firing", startsAt: new Date().toISOString(),
    labels: { application: "warehouse", environment: "production", alertname: "后台请求异常增多" } }] });
  const tools = createTools(task);
  for (const service of ["app", "db"]) {
    const result = await tools.execute("query_logs", { service });
    console.info(JSON.stringify({ service, queryAccepted: true, projectedSampleCount: result.records.length, sampleOnly: true }));
  }
} catch { console.error("AGENT_LOKI_VERIFICATION_FAILED"); process.exitCode = 1; }
