import { shanghaiToday } from "@/features/customer-orders/schema";
import { listCustomerOrders, listOrderOptions } from "./actions";
import { OrdersWorkbench } from "./orders-workbench";

export default async function CustomerOrdersPage() {
  const today = shanghaiToday();
  const [orders, options] = await Promise.all([listCustomerOrders(today), listOrderOptions()]);
  return <OrdersWorkbench initialOrders={orders} options={options} today={today} />;
}
