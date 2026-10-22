// Limit response bodies before JSON parsing, including chunked responses.
export async function boundedJson(response, maxBytes = 262144) {
  if (!response.ok) {
    await response.body?.cancel();
    const error = new Error("UPSTREAM_HTTP_FAILURE");
    error.httpStatus = response.status;
    throw error;
  }
  const chunks = []; let bytes = 0;
  if (!response.body) throw new Error("EMPTY_UPSTREAM_RESPONSE");
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error("UPSTREAM_RESPONSE_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
