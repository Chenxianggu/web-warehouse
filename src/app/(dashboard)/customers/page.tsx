import { CustomerDirectory } from "./customer-directory";
import { listCustomers } from "./actions";

export default async function CustomersPage() {
  const initialData = await listCustomers("", 1, 10);
  return <CustomerDirectory initialData={initialData} />;
}
