import {
  LayoutDashboard,
  Users,
  Package,
  Truck,
  FileText,
  Receipt,
  FileSignature,
  Boxes,
  CheckSquare,
  type LucideIcon,
} from "lucide-react";
import type { TKey } from "@/lib/i18n";

export type Role =
  | "admin"
  | "sales_manager"
  | "design_manager"
  | "production_manager"
  | "analyzing_manager"
  | "factory_worker"
  | "installation";

export const OFFICE: Role[] = [
  "admin",
  "sales_manager",
  "design_manager",
  "production_manager",
  "analyzing_manager",
];

export type NavItem = {
  href: string;
  key: TKey;
  icon: LucideIcon;
  roles: Role[];
};

// roles = who can see the item. Empty-ish handled by filtering on role.
export const NAV: NavItem[] = [
  { href: "/dashboard",  key: "dashboard",  icon: LayoutDashboard, roles: ["admin","sales_manager","design_manager","production_manager","analyzing_manager","factory_worker","installation"] },
  { href: "/clients",    key: "clients",    icon: Users,           roles: OFFICE },
  { href: "/products",   key: "products",   icon: Package,         roles: ["admin","sales_manager","design_manager","production_manager","analyzing_manager","factory_worker","installation"] },
  { href: "/quotations", key: "quotations", icon: FileText,        roles: OFFICE },
  { href: "/contracts",  key: "contracts",  icon: FileSignature,   roles: OFFICE },
  { href: "/invoices",   key: "invoices",   icon: Receipt,         roles: OFFICE },
  { href: "/suppliers",  key: "suppliers",  icon: Truck,           roles: OFFICE },
  { href: "/inventory",  key: "inventory",  icon: Boxes,           roles: ["admin","production_manager","analyzing_manager","factory_worker"] },
  { href: "/tasks",      key: "tasks",      icon: CheckSquare,     roles: ["admin","sales_manager","design_manager","production_manager","analyzing_manager","factory_worker","installation"] },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}
