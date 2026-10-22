import { createHmac } from "node:crypto";
import { previousDate } from "./daily-source.mjs";

const scaled = (value, places) => {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error("INVALID_REPORT_NUMBER");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  return (BigInt(whole) * 10n ** BigInt(places) + BigInt((fraction + "0".repeat(places)).slice(0, places) || "0")) * (negative ? -1n : 1n);
};
const display = (value, places) => {
  const sign = value < 0n ? "-" : ""; const digits = (value < 0n ? -value : value).toString().padStart(places + 1, "0");
  return places ? `${sign}${digits.slice(0, -places)}.${digits.slice(-places)}` : `${sign}${digits}`;
};
export function difference(current, previous, places = 0) { return display(scaled(current, places) - scaled(previous, places), places); }

export const ACTIONS = {
  review_backlog: "检查未出库订单的备货与交付安排。",
  review_zero_prices: "核对零单价明细是否属于暂未定价，避免把订单金额当作完整销售收入。",
  review_conversion: "核对使用默认每吨包数的物料，以及归一化编号重复的资料。",
  review_changes: "按审计记录复核订单修改、删除和取消出库。",
  keep_monitoring: "按同一口径持续保存每日快照，积累可比较的数据。",
};

// AI selects verified facts and fixed actions; all quantities, money and
// customer names in the final prose are inserted by code, never generated.
export function buildDailyFacts(snapshot, previous, salt) {
  const facts = [];
  const add = (id, text) => facts.push({ id, text });
  const total = snapshot.totals; const activity = snapshot.activity;
  add("orders", `订单日期为 ${snapshot.reportDate} 的当前有效订单共 ${total.orders} 笔，涉及 ${total.customers} 个客户。`);
  add("volume", `这些订单合计 ${total.packs} 包、${total.tons} 吨，订单金额 ${total.amount} 元。`);
  add("shipping", `其中当前已出库 ${total.shippedOrders} 笔、未出库 ${total.unshippedOrders} 笔。`);
  add("backlog", `截至快照采集时，订单日期不晚于日报日期的未出库订单共 ${snapshot.backlog.orders} 笔、${snapshot.backlog.tons} 吨、${snapshot.backlog.amount} 元。`);
  add("activity", `按当天操作时间统计，新增 ${activity.createdOrders} 笔、修改 ${activity.modifiedOrders} 笔、删除 ${activity.deletedOrders} 笔订单；出库操作 ${activity.shipOperations} 次，取消出库 ${activity.unshipOperations} 次。`);
  add("quality", `明细中零单价 ${total.zeroPriceLines} 行、使用默认换算 ${total.defaultConversionLines} 行、物料编号存在多种归一化匹配 ${total.ambiguousMaterialLines} 行。`);
  if (activity.unattributedItemEvents !== "0") add("unattributed", `另有 ${activity.unattributedItemEvents} 条无关联编号的明细变更事件，不能精确归入新增或修改订单。`);
  const comparable = previous?.snapshot?.reportDate === previousDate(snapshot.reportDate);
  if (comparable) {
    add("comparison", `相较前一天已保存的日报，订单笔数变化 ${difference(total.orders, previous.snapshot.totals.orders)} 笔，吨数变化 ${difference(total.tons, previous.snapshot.totals.tons, 6)} 吨，金额变化 ${difference(total.amount, previous.snapshot.totals.amount, 2)} 元。两份数据均按各自实际采集时点计量。`);
  } else add("comparison", "尚无相邻前一天的已保存快照，本次不计算日间变化。");
  const ranked = [...snapshot.customers].sort((a, b) => {
    const delta = scaled(b.metrics.amount, 2) - scaled(a.metrics.amount, 2);
    return delta < 0n ? -1 : delta > 0n ? 1 : a.code.localeCompare(b.code);
  });
  const aliases = new Map();
  for (const [index, customer] of ranked.slice(0, 10).entries()) {
    const alias = `客户-${createHmac("sha256", salt).update(customer.code).digest("hex").slice(0, 12)}`;
    aliases.set(alias, customer);
    add(`customer-${index + 1}`, `${alias}：${customer.metrics.orders} 笔、${customer.metrics.tons} 吨、金额 ${customer.metrics.amount} 元。`);
  }
  const allowedActions = ["keep_monitoring"];
  if (snapshot.backlog.orders !== "0") allowedActions.push("review_backlog");
  if (total.zeroPriceLines !== "0") allowedActions.push("review_zero_prices");
  if (total.defaultConversionLines !== "0" || total.ambiguousMaterialLines !== "0") allowedActions.push("review_conversion");
  if ([activity.modifiedOrders, activity.deletedOrders, activity.unshipOperations].some((value) => value !== "0")) allowedActions.push("review_changes");
  return { facts, aliases, allowedActions };
}

export function validateDailySelection(selection, catalog) {
  if (!selection || Object.keys(selection).sort().join(",") !== "actionIds,focusFactIds"
    || !Array.isArray(selection.focusFactIds) || !selection.focusFactIds.length || selection.focusFactIds.length > 8
    || new Set(selection.focusFactIds).size !== selection.focusFactIds.length
    || selection.focusFactIds.some((id) => !catalog.facts.some((fact) => fact.id === id))
    || !Array.isArray(selection.actionIds) || selection.actionIds.length > 5
    || new Set(selection.actionIds).size !== selection.actionIds.length
    || selection.actionIds.some((id) => !catalog.allowedActions.includes(id))) throw new Error("INVALID_DAILY_SUMMARY");
  return selection;
}

const escape = (value) => String(value).replace(/[\r\n\t]/g, " ").replace(/[|<>`*\[\]\\]/g, "");
export function renderDailyReport(report, previous, salt) {
  const snapshot = report.snapshot;
  if (!snapshot) return `# 客户订单日报 ${report.date}\n\n数据尚未采集成功。\n`;
  const catalog = buildDailyFacts(snapshot, Object.hasOwn(report, "comparisonBase") ? report.comparisonBase : previous, salt);
  const selected = report.selection ?? { focusFactIds: [], actionIds: catalog.allowedActions };
  const localText = (value) => { for (const [alias, customer] of catalog.aliases) value = value.replaceAll(alias, `${escape(customer.name)}（${escape(customer.code)}）`); return value; };
  return [`# 客户订单日报 ${snapshot.reportDate}`, "",
    `快照采集时间：${new Date(snapshot.capturedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（上海时间）`,
    `AI摘要状态：${report.aiStatus}；数字由只读汇总查询计算。`, "",
    "## 业务汇总", "", ...["orders", "volume", "shipping", "backlog"].map((id) => `- ${catalog.facts.find((fact) => fact.id === id).text}`), "",
    "## AI重点摘要", "", ...(selected.focusFactIds.length ? selected.focusFactIds.map((id) => `- ${localText(catalog.facts.find((fact) => fact.id === id).text)}`) : ["模型摘要尚未生成；本报告的业务数字已经由程序完成统计。"]), "",
    "## 当天操作与数据核对", "", ...catalog.facts.filter((fact) => ["activity", "quality", "unattributed", "comparison"].includes(fact.id)).map((fact) => `- ${fact.text}`), "",
    "## 客户明细", "", "| 客户编号 | 客户名称 | 订单数 | 包数 | 吨数 | 金额（元） | 已出库 | 未出库 |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...snapshot.customers.map((row) => `| ${escape(row.code)} | ${escape(row.name)} | ${row.metrics.orders} | ${row.metrics.packs} | ${row.metrics.tons} | ${row.metrics.amount} | ${row.metrics.shippedOrders} | ${row.metrics.unshippedOrders} |`), "",
    "## 待关注事项", "", ...selected.actionIds.map((id) => `- ${ACTIONS[id]}`), "",
    "## 统计口径", "",
    "- 订单金额是订单口径，包含已出库和未出库；不等于已实现收入、应收或利润，不含整柜、寄存和收款。",
    "- 业务指标按订单日期筛选，并使用采集时当前有效状态；这不是历史午夜状态还原。补录、删除及后续修改不会回写已保存快照。",
    "- 金额=单价÷当前物料每吨包数×包数，保留小数精度后汇总，金额显示到分、吨数显示六位。物料缺失或无效换算使用40；归一化编号重复时取最新ID并提示。客户金额分别显示到分后相加可能与整体舍入差一分。",
    "- 操作变化按上海时间当天零点至次日零点，修改订单按订单ID去重；新增后删除仍计入当天操作变化，出库和取消出库分别计次。",
    "- 审计仅涵盖实际采集且仍保留的事件；采集前或已清理的历史操作无法补回。",
    "- 模型只选择经过程序验证的事实与固定建议；客户名称、地址、备注及原始业务明细不发送给模型。", ""].join("\n");
}
