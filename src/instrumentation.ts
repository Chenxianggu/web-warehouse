import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { writeLog } = await import("@/server/logger");
  await writeLog({
    level: "ERROR", status: "FAILURE", module: "系统运行", action: "REQUEST_ERROR", message: "服务器请求处理失败",
    metadata: { error, path: request.path.split("?")[0], method: request.method, route: context.routePath, type: context.routeType },
  });
};
