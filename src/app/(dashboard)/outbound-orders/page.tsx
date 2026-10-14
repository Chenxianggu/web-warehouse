import { shanghaiToday } from "@/features/customer-orders/schema";
import { listOutboundOrders } from "./actions";
import { OutboundWorkbench } from "./outbound-workbench";

export default async function OutboundOrdersPage() {
  const today = shanghaiToday();
  const [pending, shipped] = await Promise.all([false, true].map((isShipped) => listOutboundOrders({ isShipped, date: today, customer: "", page: 1, pageSize: 10 })));
  return <OutboundWorkbench today={today} initialPending={pending} initialShipped={shipped} />;
}
