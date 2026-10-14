import { pinyin } from "pinyin-pro";

export function searchIndex(...values: string[]) {
  return values.flatMap((value) => [value, pinyin(value, { toneType: "none" }), pinyin(value, { pattern: "first", toneType: "none" })])
    .map((value) => value.toLowerCase().replace(/\s+/g, ""));
}

export function matchesSearch(index: string[], keyword: string) {
  const query = keyword.trim().toLowerCase().replace(/\s+/g, "");
  return !query || index.some((value) => value.includes(query));
}
