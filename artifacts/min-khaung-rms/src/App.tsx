import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Map as MapIcon,
  ClipboardList,
  ChefHat,
  Wallet,
  Menu as MenuIcon,
  Package,
  Users,
  LineChart,
  Settings,
  Armchair,
  Truck,
  Languages,
  LogOut,
  Loader2,
} from "lucide-react";
import Dashboard from "@/pages/dashboard";
import FloorPlan from "@/pages/floor-plan";
import Kitchen from "@/pages/kitchen";
import MenuPage from "@/pages/menu";
import OrdersPage from "@/pages/orders";
import TableSettingsPage from "@/pages/table-settings";
import NewOrderPage from "@/pages/new-order";
import OrderDetailPage from "@/pages/order-detail";
import CashierPage from "@/pages/cashier";
import StaffPage from "@/pages/staff";
import InventoryPage from "@/pages/inventory";
import FinancePage from "@/pages/finance";
import LoginPage from "@/pages/login";
import PublicHomePage from "@/pages/public-home";
import DeliveryOrdersPage from "@/pages/delivery-orders";
import NotFound from "@/pages/not-found";
import { setupAutoUpdate } from "@/lib/mobile-updater";
import { AuthProvider, useAuth } from "@/lib/auth";
import logoPath from "@assets/viber_image_2026-04-06_15-22-24-661.jpg";

const queryClient = new QueryClient();
const baseUrl = import.meta.env.BASE_URL ?? "/";
const routerBase = baseUrl.startsWith("/") ? (baseUrl.replace(/\/$/, "") || "/") : "/";

type AppPermission =
  | "publicMenu"
  | "dashboard"
  | "floorPlan"
  | "tableSettings"
  | "orders"
  | "kds"
  | "cashier"
  | "menu"
  | "inventory"
  | "staff"
  | "finance"
  | "settings"
  | "deliveryOrders";

const NAV_ITEMS: Array<{ href: string; labelKey: string; icon: React.ComponentType<{ className?: string }>; permission: AppPermission }> = [
  { href: "/", labelKey: "nav.publicMenu", icon: MenuIcon, permission: "publicMenu" },
  { href: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, permission: "dashboard" },
  { href: "/floor-plan", labelKey: "nav.floorPlan", icon: MapIcon, permission: "floorPlan" },
  { href: "/table-settings", labelKey: "nav.tableSettings", icon: Armchair, permission: "tableSettings" },
  { href: "/orders", labelKey: "nav.orders", icon: ClipboardList, permission: "orders" },
  { href: "/kds?station=kitchen", labelKey: "nav.kds", icon: ChefHat, permission: "kds" },
  { href: "/cashier", labelKey: "nav.cashier", icon: Wallet, permission: "cashier" },
  { href: "/menu", labelKey: "nav.menu", icon: MenuIcon, permission: "menu" },
  { href: "/inventory", labelKey: "nav.inventory", icon: Package, permission: "inventory" },
  { href: "/staff", labelKey: "nav.staff", icon: Users, permission: "staff" },
  { href: "/delivery-orders", labelKey: "nav.deliveryOrders", icon: Truck, permission: "deliveryOrders" },
  { href: "/finance", labelKey: "nav.finance", icon: LineChart, permission: "finance" },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, permission: "settings" },
];

function AccessDenied() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md rounded-lg border bg-card p-6 text-center">
        <h2 className="text-xl font-bold">{t("auth.noAccessTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.noAccessDesc")}</p>
      </div>
    </div>
  );
}

function StubPage({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1 className="page-title text-foreground">{title}</h1>
      <div className="p-8 border rounded-lg bg-card text-card-foreground text-center">
        <p className="text-muted-foreground">{t("stub.underConstruction", { title })}</p>
      </div>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user, logout, hasPermission } = useAuth();
  const [, setLocation] = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const isMyanmar = i18n.resolvedLanguage === "mm";
  const isGuest = user?.role === "guest";

  const toggleLanguage = () => {
    void i18n.changeLanguage(isMyanmar ? "en" : "mm");
  };

  const nextLanguageLabel = isMyanmar ? t("language.english") : t("language.myanmar");

  const handleLogoClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setLocation("/");
    requestAnimationFrame(() => {
      mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  if (!user) {
    return <>{children}</>;
  }

  if (isGuest) {
    return (
      <div className="flex h-screen w-full flex-col bg-background">
        <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{t("app.shortName")}</p>
              <p className="text-xs text-muted-foreground">
                {t("auth.guestSession", { table: user.tableNumber ?? "-" })}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={toggleLanguage}
                title={t("language.switchTo", { language: nextLanguageLabel })}
              >
                <Languages className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={handleLogout}
                title={t("auth.logout")}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <main ref={mainRef} className="flex-1 overflow-auto">
          <div className="p-4 md:p-8" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
            {children}
          </div>
        </main>
      </div>
    );
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => hasPermission(item.permission));

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar>
          <SidebarHeader className="p-4 flex flex-col items-center justify-center bg-sidebar">
            <Link href="/" onClick={handleLogoClick} className="flex flex-col items-center">
              <img
                src={logoPath}
                alt={t("app.name")}
                className="w-16 h-16 rounded-full object-cover border-2 border-primary-foreground"
              />
              <div className="mt-2 text-sidebar-foreground font-bold text-center leading-tight text-sm">
                {t("app.name")}
              </div>
            </Link>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3 h-8 w-full justify-center gap-1.5"
              onClick={toggleLanguage}
              title={t("language.switchTo", { language: nextLanguageLabel })}
            >
              <Languages className="h-3.5 w-3.5" />
              {isMyanmar ? "MM" : "EN"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2 h-8 w-full justify-center gap-1.5"
              onClick={handleLogout}
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("auth.logout")}
            </Button>
          </SidebarHeader>
          <SidebarContent className="bg-sidebar">
            <SidebarGroup>
              <SidebarMenu>
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild>
                        <Link href={item.href} className="text-sidebar-foreground hover:bg-sidebar-accent">
                          <Icon className="mr-2 h-4 w-4" /> {t(item.labelKey)}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main ref={mainRef} className="flex-1 overflow-auto">
          <div className="md:hidden sticky top-0 z-30 border-b bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 [padding-top:calc(env(safe-area-inset-top)+0.5rem)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{t("app.shortName")}</span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={toggleLanguage}
                  title={t("language.switchTo", { language: nextLanguageLabel })}
                >
                  <Languages className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={handleLogout}
                  title={t("auth.logout")}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
                <SidebarTrigger className="h-9 w-9" />
              </div>
            </div>
          </div>
          <div className="p-4 md:p-8" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function RouterContent() {
  const { t } = useTranslation();
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/" component={PublicHomePage} />
        <Route path="/public" component={PublicHomePage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/orders" component={LoginPage} />
        <Route component={LoginPage} />
      </Switch>
    );
  }

  const guard = (permission: AppPermission, Component: React.ComponentType) => () =>
    hasPermission(permission) ? <Component /> : <AccessDenied />;

  return (
    <Layout>
      <Switch>
        <Route
          path="/"
          component={() => (user?.role === "customer" ? <PublicHomePage /> : guard("dashboard", Dashboard)())}
        />
        <Route path="/floor-plan" component={guard("floorPlan", FloorPlan)} />
        <Route path="/table-settings" component={guard("tableSettings", TableSettingsPage)} />
        <Route path="/orders" component={guard("orders", OrdersPage)} />
        <Route path="/orders/new" component={guard("orders", NewOrderPage)} />
        <Route path="/orders/:id" component={guard("orders", OrderDetailPage)} />
        <Route path="/kds" component={guard("kds", Kitchen)} />
        <Route path="/kitchen" component={guard("kds", Kitchen)} />
        <Route path="/cashier" component={guard("cashier", CashierPage)} />
        <Route path="/menu" component={guard("menu", MenuPage)} />
        <Route path="/inventory" component={guard("inventory", InventoryPage)} />
        <Route path="/staff" component={guard("staff", StaffPage)} />
        <Route path="/delivery-orders" component={guard("deliveryOrders", DeliveryOrdersPage)} />
        <Route path="/finance" component={guard("finance", FinancePage)} />
        <Route path="/settings" component={guard("settings", () => <StubPage title={t("nav.settings")} />)} />
        <Route path="/login" component={() => <AccessDenied />} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  useEffect(() => {
    const cleanup = setupAutoUpdate();
    return () => cleanup();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={routerBase}>
            <RouterContent />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
