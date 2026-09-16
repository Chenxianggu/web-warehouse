import type { LucideIcon } from "lucide-react";
import {
  ArchiveRestore,
  BadgeDollarSign,
  Boxes,
  Calculator,
  ChartSpline,
  ClipboardList,
  ContactRound,
  Container,
  Home,
  ListTree,
  Package,
  PackageOpen,
  PackagePlus,
  Search,
  ShoppingCart,
  UserCog,
} from "lucide-react";

const navigationIcons: Record<string, LucideIcon> = {
  "/": Home,
  "/stock": Boxes,
  "/inbound-orders": PackagePlus,
  "/customers": ContactRound,
  "/customer-orders": ClipboardList,
  "/outbound-orders": PackageOpen,
  "/receivables": BadgeDollarSign,
  "/order-search": Search,
  "/menu-management": ListTree,
  "/users": UserCog,
  "/purchase-orders": ShoppingCart,
  "/price-trends": ChartSpline,
  "/consignments": ArchiveRestore,
  "/full-container-sales": Container,
  "/tax-calculator": Calculator,
};

export function getNavigationIcon(href: string) {
  return navigationIcons[href] ?? Package;
}
