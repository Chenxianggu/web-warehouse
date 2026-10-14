import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { createClientId } from "../src/lib/create-client-id";
import { priceGroupsSchema } from "../src/features/price-table/schema";

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("creates valid UUIDs when randomUUID is available", () => {
  assert.match(createClientId(), uuidV4);
});

test("HTTP fallback creates distinct UUIDs accepted by price table validation", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) },
  });
  try {
    const ids = Array.from({ length: 1000 }, () => createClientId());
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, uuidV4);
    assert.equal(priceGroupsSchema.safeParse([
      { id: ids[0], title: "丙料", rows: [{ id: ids[1], code: "神华1100", price: 9380 }] },
    ]).success, true);
  } finally {
    Object.defineProperty(globalThis, "crypto", original);
  }
});
