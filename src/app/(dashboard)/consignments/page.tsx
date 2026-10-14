import { listConsignments, consignmentOptions } from "./actions";
import { emptyFilter } from "@/features/consignments/schema";
import { shanghaiToday } from "@/features/customer-orders/schema";
import { ConsignmentsWorkbench } from "./consignments-workbench";

export default async function ConsignmentsPage() {
  const [initial, options] = await Promise.all([listConsignments(emptyFilter), consignmentOptions()]);
  return <ConsignmentsWorkbench initial={initial} options={options} today={shanghaiToday()} />;
}
