import { z } from "zod";

export const warehouseSchema = z.enum(["MAIN", "HONGHAI"], { error: "请选择本仓库或宏海仓" });
export type Warehouse = z.infer<typeof warehouseSchema>;
export const warehouseOptions = [
  { value: "MAIN", label: "本仓库" },
  { value: "HONGHAI", label: "宏海仓" },
] as const;

export function warehouseLabel(warehouse: Warehouse) {
  return warehouse === "HONGHAI" ? "宏海仓" : "本仓库";
}
