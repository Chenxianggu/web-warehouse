import { listFullContainers, containerOptions } from "./actions";
import { emptyContainerFilter } from "@/features/full-containers/schema";
import { shanghaiToday } from "@/features/customer-orders/schema";
import { ContainerWorkbench } from "./container-workbench";
export default async function FullContainerSalesPage() {
  const [initial, options] = await Promise.all([listFullContainers(emptyContainerFilter), containerOptions()]);
  return <ContainerWorkbench initial={initial} options={options} today={shanghaiToday()} />;
}
