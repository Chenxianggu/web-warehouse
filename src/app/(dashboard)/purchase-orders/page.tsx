import { emptyPurchaseFilter } from "@/features/purchase-orders/schema";
import { shanghaiToday } from "@/features/customer-orders/schema";
import { listPurchaseOrders, purchaseOptions } from "./actions";
import { PurchaseWorkbench } from "./purchase-workbench";
export default async function PurchaseOrdersPage() {
  const [initial, options] = await Promise.all([listPurchaseOrders(emptyPurchaseFilter), purchaseOptions()]);
  return <PurchaseWorkbench initial={initial} options={options} today={shanghaiToday()} />;
}
