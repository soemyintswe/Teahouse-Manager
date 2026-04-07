import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "@/components/ui/sidebar";
import { LayoutDashboard, Map as MapIcon, ClipboardList, ChefHat, Wallet, Menu as MenuIcon, Package, Users, LineChart, Settings } from "lucide-react";
import Dashboard from "@/pages/dashboard";
import FloorPlan from "@/pages/floor-plan";
import Kitchen from "@/pages/kitchen";
import MenuPage from "@/pages/menu";
import OrdersPage from "@/pages/orders";
import NewOrderPage from "@/pages/new-order";
import OrderDetailPage from "@/pages/order-detail";
import NotFound from "@/pages/not-found";
import { setupAutoUpdate } from "@/lib/mobile-updater";
import logoPath from "@assets/viber_image_2026-04-06_15-22-24-661.jpg";

const queryClient = new QueryClient();
const baseUrl = import.meta.env.BASE_URL ?? "/";
const routerBase = baseUrl.startsWith("/") ? (baseUrl.replace(/\/$/, "") || "/") : "/";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/floor-plan", label: "Floor Plan", icon: MapIcon },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/kds?station=kitchen", label: "KDS", icon: ChefHat },
  { href: "/cashier", label: "Cashier", icon: Wallet },
  { href: "/menu", label: "Menu", icon: MenuIcon },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/finance", label: "Finance", icon: LineChart },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <Sidebar>
          <SidebarHeader className="p-4 flex items-center justify-center bg-sidebar">
            <img src={logoPath} alt="Logo" className="w-16 h-16 rounded-full object-cover border-2 border-primary-foreground" />
            <div className="mt-2 text-sidebar-foreground font-bold text-center leading-tight text-sm">
              Teahouse<br/>Management System
            </div>
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
                          <Icon className="mr-2 h-4 w-4" /> {item.label}
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
              <span className="text-sm font-semibold">Teahouse Manager</span>
              <SidebarTrigger className="h-9 w-9" />
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
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
      <div className="p-8 border rounded-lg bg-card text-card-foreground text-center">
        <p className="text-muted-foreground">{title} view under construction.</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/floor-plan" component={FloorPlan} />
        <Route path="/orders" component={OrdersPage} />
        <Route path="/orders/new" component={NewOrderPage} />
        <Route path="/orders/:id" component={OrderDetailPage} />
        <Route path="/kds" component={Kitchen} />
        <Route path="/kitchen" component={Kitchen} />
        <Route path="/cashier" component={() => <StubPage title="Cashier POS" />} />
        <Route path="/menu" component={MenuPage} />
        <Route path="/inventory" component={() => <StubPage title="Inventory" />} />
        <Route path="/staff" component={() => <StubPage title="Staff" />} />
        <Route path="/finance" component={() => <StubPage title="Finance" />} />
        <Route path="/settings" component={() => <StubPage title="Settings" />} />
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
