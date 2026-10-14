import { emptyOrderSearch } from "@/features/order-search/schema";
import { queryOrders } from "./actions";
import { OrderSearchWorkbench } from "./order-search-workbench";

export default async function OrderSearchPage() {
  const initial = await queryOrders({ ...emptyOrderSearch, page: 1, pageSize: 20 });
  return <OrderSearchWorkbench initial={initial} />;
}
