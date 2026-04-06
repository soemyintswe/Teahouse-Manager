import { Switch, Route, Router as WouterRouter, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { LayoutDashboard, Map as MapIcon, ClipboardList, ChefHat, Wallet, Menu as MenuIcon, Package, Users, LineChart, Settings } from "lucide-react";
import Dashboard from "@/pages/dashboard";
import FloorPlan from "@/pages/floor-plan";
import Kitchen from "@/pages/kitchen";
import MenuPage from "@/pages/menu";
import NewOrderPage from "@/pages/new-order";
import OrderDetailPage from "@/pages/order-detail";
import NotFound from "@/pages/not-found";
import logoPath from "@assets/viber_image_2026-04-06_15-22-24-661_1775465574018.jpg";

const queryClient = new QueryClient();

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
                <SidebarMenuItem><SidebarMenuButton asChild><Link href="/" className="text-sidebar-foreground hover:bg-sidebar-accent"><LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard</Link></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton asChild><Link href="/floor-plan" className="text-sidebar-foreground hover:bg-sidebar-accent"><MapIcon className="mr-2 h-4 w-4" /> Floor Plan</Link></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton asChild><Link href="/orders" className="text-sidebar-foreground hover:bg-sidebar-accent"><ClipboardList className="mr-2 h-4 w-4" /> Orders</Link></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton asChild><Link href="/kitchen" className="text-sidebar-foreground hover:bg-sidebar-accent"><ChefHat className="mr-2 h-4 w-4" /> KDS</Link></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton asChild><Link href="/cashier" className="text-sidebar-foreground hover:bg-sidebar-accent"><Wallet className="mr-2 h-4 w-4" /> Cashier</Link></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton asChild><Link href="/menu" className="text-sidebar-foreground hover:bg-sidebar-accent"><MenuIcon className="mr-2 h-4 w-4" /> Menu</Link></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton asChild><Link href="/inventory" className="text-sidebar-foreground hover:bg-sidebar-accent"><Package className="mr-2 h-4 w-4" /> Inventory</Link></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton asChild><Link href="/staff" className="text-sidebar-foreground hover:bg-sidebar-accent"><Users className="mr-2 h-4 w-4" /> Staff</Link></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton asChild><Link href="/finance" className="text-sidebar-foreground hover:bg-sidebar-accent"><LineChart className="mr-2 h-4 w-4" /> Finance</Link></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton asChild><Link href="/settings" className="text-sidebar-foreground hover:bg-sidebar-accent"><Settings className="mr-2 h-4 w-4" /> Settings</Link></SidebarMenuButton></SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 overflow-auto p-8">
          {children}
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
        <Route path="/orders" component={() => <StubPage title="Orders" />} />
        <Route path="/orders/new" component={() => <StubPage title="New Order" />} />
        <Route path="/orders/:id" component={() => <StubPage title="Order Detail" />} />
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
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
