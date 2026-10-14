import { requirePageAccess } from "@/server/menu-permissions";
import { readPurchaseItemCodes, readPurchasePriceHistory } from "@/server/price-trends";
import { priceTrendYears, type PricePoint } from "@/features/price-trends/schema";
import { PriceTrendsWorkbench } from "./price-trends-workbench";

export default async function PriceTrendsPage() {
  await requirePageAccess("/price-trends");
  const years = priceTrendYears();
  let codes: string[] = [], points: PricePoint[] = [], error = "";
  try {
    codes = await readPurchaseItemCodes();
    if (codes[0]) points = await readPurchasePriceHistory({ itemCode: codes[0], year: years[0] });
  } catch { error = "加载价格数据失败，请点击查询重试。"; }
  return <PriceTrendsWorkbench initialCodes={codes} initialPoints={points} initialError={error} years={years} />;
}
