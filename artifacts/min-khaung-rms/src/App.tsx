import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "@/components/ui/sidebar";
import { LayoutDashboard, Map as MapIcon, ClipboardList, ChefHat, Wallet, Menu as MenuIcon, Package, Users, LineChart, Settings, Armchair, Languages } from "lucide-react";
import Dashboard from "@/pages/dashboard";
import FloorPlan from "@/pages/floor-plan";
import Kitchen from "@/pages/kitchen";
import MenuPage from "@/pages/menu";
import OrdersPage from "@/pages/orders";
import TableSettingsPage from "@/pages/table-settings";
import NewOrderPage from "@/pages/new-order";
import OrderDetailPage from "@/pages/order-detail";
import NotFound from "@/pages/not-found";
import { setupAutoUpdate } from "@/lib/mobile-updater";
import logoPath from "@assets/viber_image_2026-04-06_15-22-24-661.jpg";

const queryClient = new QueryClient();
const baseUrl = import.meta.env.BASE_URL ?? "/";
const routerBase = baseUrl.startsWith("/") ? (baseUrl.replace(/\/$/, "") || "/") : "/";

const NAV_ITEMS = [
  { href: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/floor-plan", labelKey: "nav.floorPlan", icon: MapIcon },
  { href: "/table-settings", labelKey: "nav.tableSettings", icon: Armchair },
  { href: "/orders", labelKey: "nav.orders", icon: ClipboardList },
  { href: "/kds?station=kitchen", labelKey: "nav.kds", icon: ChefHat },
  { href: "/cashier", labelKey: "nav.cashier", icon: Wallet },
  { href: "/menu", labelKey: "nav.menu", icon: MenuIcon },
  { href: "/inventory", labelKey: "nav.inventory", icon: Package },
  { href: "/staff", labelKey: "nav.staff", icon: Users },
  { href: "/finance", labelKey: "nav.finance", icon: LineChart },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
] as const;

function Layout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const isMyanmar = i18n.resolvedLanguage === "mm";

  const toggleLanguage = () => {
    void i18n.changeLanguage(isMyanmar ? "en" : "mm");
  };

  const nextLanguageLabel = isMyanmar ? t("language.english") : t("language.myanmar");

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar>
          <SidebarHeader className="p-4 flex flex-col items-center justify-center bg-sidebar">
            <img src={logoPath} alt={t("app.name")} className="w-16 h-16 rounded-full object-cover border-2 border-primary-foreground" />
            <div className="mt-2 text-sidebar-foreground font-bold text-center leading-tight text-sm">
              {t("app.name")}
            </div>
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
          </SidebarHeader>
          <SidebarContent className="bg-sidebar">
            <SidebarGroup>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => {
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
        <main className="flex-1 overflow-auto">
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

function StubPage({ title }: { title: string }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
      <div className="p-8 border rounded-lg bg-card text-card-foreground text-center">
        <p className="text-muted-foreground">{t("stub.underConstruction", { title })}</p>
      </div>
    </div>
  );
}

function Router() {
  const { t } = useTranslation();

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/floor-plan" component={FloorPlan} />
        <Route path="/table-settings" component={TableSettingsPage} />
        <Route path="/orders" component={OrdersPage} />
        <Route path="/orders/new" component={NewOrderPage} />
        <Route path="/orders/:id" component={OrderDetailPage} />
        <Route path="/kds" component={Kitchen} />
        <Route path="/kitchen" component={Kitchen} />
        <Route path="/cashier" component={() => <StubPage title={t("stub.cashierPos")} />} />
        <Route path="/menu" component={MenuPage} />
        <Route path="/inventory" component={() => <StubPage title={t("nav.inventory")} />} />
        <Route path="/staff" component={() => <StubPage title={t("nav.staff")} />} />
        <Route path="/finance" component={() => <StubPage title={t("nav.finance")} />} />
        <Route path="/settings" component={() => <StubPage title={t("nav.settings")} />} />
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
        <WouterRouter base={routerBase}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
