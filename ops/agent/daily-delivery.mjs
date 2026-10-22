import { DAILY_ENVIRONMENTS, dailyNotice, dailyNoticeStatus, submitDailyNotice } from "../alerting/daily-notification.mjs";
import { ACTIONS, buildDailyFacts, validateDailySelection } from "./daily-facts.mjs";

export function renderDailyNotice(report, salt, environment) {
  const snapshot = report.snapshot;
  const catalog = buildDailyFacts(snapshot, report.comparisonBase, salt);
  const selection = report.selection ? validateDailySelection(report.selection, catalog) : { focusFactIds: [], actionIds: catalog.allowedActions };
  const clean = (value) => String(value).replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 60);
  const local = (text) => {
    for (const [alias, customer] of catalog.aliases) text = text.replaceAll(alias, `${clean(customer.name)}（${clean(customer.code)}）`);
    return text;
  };
  const basics = ["orders", "volume", "shipping", "backlog"];
  const highlights = selection.focusFactIds.filter((id) => !basics.includes(id) && id !== "activity");
  const payload = { version: 1, environment, date: report.date, text: [
    "任仲塑料后台 · 客户订单日报", `日期：${report.date}（上海时间）`, `环境：${DAILY_ENVIRONMENTS[environment]}`,
    `采集：${new Date(snapshot.capturedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}`, "",
    ...basics.map((id) => catalog.facts.find((fact) => fact.id === id).text), "",
    catalog.facts.find((fact) => fact.id === "activity").text,
    ...highlights.map((id) => local(catalog.facts.find((fact) => fact.id === id).text)), "",
    `摘要：${report.aiStatus === "completed" ? "DeepSeek 已完成重点选择；数字由程序统计。" : "AI 摘要暂不可用，以下为程序统计与固定建议。"}`,
    "待关注：", ...selection.actionIds.map((id) => `• ${ACTIONS[id]}`), "",
    "口径：按订单日期及采集时有效状态统计，金额不等于已实现收入；未出库余额含日报日期及以前订单。完整明细保存在服务器日报中。",
  ].join("\n") };
  dailyNotice(payload); return payload;
}

export function dailyDeliveryTransport(token, options) {
  return {
    submit: (payload) => submitDailyNotice(payload, token, options),
    status: (environment, date) => dailyNoticeStatus(environment, date, token, options),
    render: (report, environment) => renderDailyNotice(report, token, environment),
  };
}
