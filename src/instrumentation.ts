import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportRuntimeError, isExpectedDatabaseError } = await import("@/server/runtime-errors");
  if (isExpectedDatabaseError(error)) return;
  await reportRuntimeError(error, {
    module: "系统运行", action: "REQUEST_ERROR",
    metadata: { path: request.path.split("?")[0], method: request.method, route: context.routePath, type: context.routeType },
  });
};
