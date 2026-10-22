import { boundedJson } from "./http.mjs";
import { buildDailyFacts, validateDailySelection } from "./daily-facts.mjs";

export async function summarizeDaily(snapshot, previous, salt, config, budget, { fetcher = fetch } = {}) {
  const catalog = buildDailyFacts(snapshot, previous, salt);
  const input = [{ role: "user", content: JSON.stringify({ facts: catalog.facts, allowedActionIds: catalog.allowedActions }) }];
  const signal = AbortSignal.timeout(60000);
  for (let round = 0; round < 2; round++) {
    signal.throwIfAborted();
    const body = JSON.stringify({ model: config.model, stream: false, reasoning: { effort: "none" },
      instructions: "你是客户订单日报编辑。只从给出的事实编号中选择最值得关注的内容（优先订单、数量金额、未出库、变化），并选择适用的固定建议编号。不要自行计算、生成数字、推测原因或调用工具。仅输出JSON：{\"focusFactIds\":[\"已有事实编号\"],\"actionIds\":[\"允许的建议编号\"]}。focusFactIds最多8项且不能重复，actionIds最多5项。", input,
      max_output_tokens: 700, tools: [], tool_choice: "none",
      text: { format: { type: "json_schema", name: "daily_order_selection", schema: {
        type: "object", properties: { focusFactIds: { type: "array", items: { type: "string", enum: catalog.facts.map((fact) => fact.id) } },
          actionIds: { type: "array", items: { type: "string", enum: catalog.allowedActions } } },
        required: ["focusFactIds", "actionIds"], additionalProperties: false,
      } } } });
    if (Buffer.byteLength(body) > 32768) throw new Error("DAILY_INPUT_LIMIT");
    await budget.reserveCall(config.dailyCallLimit);
    const result = await boundedJson(await fetcher("https://api.deepseek.com/responses", {
      method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body, signal, redirect: "error",
    }));
    if (result.status !== "completed" || !Array.isArray(result.output) || result.output.some((item) => item.type === "function_call")) throw new Error("DAILY_MODEL_INCOMPLETE");
    const text = result.output.filter((item) => item.type === "message").flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text").map((item) => item.text).join("");
    try { return { selection: validateDailySelection(JSON.parse(text), catalog), model: config.model, provider: "deepseek", modelCalls: round + 1 }; }
    catch {
      if (round === 1) throw new Error("INVALID_DAILY_SUMMARY");
      input.push({ role: "user", content: "输出未通过校验。只能选择已提供的事实编号与允许的建议编号，严格输出两个数组字段的JSON对象。" });
    }
  }
}
