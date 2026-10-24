import type { Warehouse } from "./warehouse";

type StockReceipt = {
  warehouse: Warehouse;
  packCount: number;
  inboundUnitPrice: number | null;
  taxIncluded: boolean;
};

export function summarizeStock(records: StockReceipt[], packsPerTon: number) {
  let totalPack = 0;
  let honghaiPack = 0;
  let pricedTons = 0;
  let exTaxValue = 0;
  for (const record of records) {
    if (record.warehouse === "HONGHAI") {
      honghaiPack += record.packCount;
      continue;
    }
    totalPack += record.packCount;
    if (record.inboundUnitPrice !== null) {
      const tons = record.packCount / packsPerTon;
      const price = record.inboundUnitPrice / (record.taxIncluded ? 1.13 : 1);
      pricedTons += tons;
      exTaxValue += tons * price;
    }
  }
  return { totalPack, honghaiPack, exTaxAvgPrice: pricedTons > 0 ? exTaxValue / pricedTons : null };
}
