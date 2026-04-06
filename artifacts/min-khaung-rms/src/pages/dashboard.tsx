import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, useGetSalesChart, getGetSalesChartQueryKey, useGetTopItems, getGetTopItemsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { Loader2, DollarSign, ShoppingBag, Map as MapIcon, AlertTriangle } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: chartData, isLoading: isLoadingChart } = useGetSalesChart({ query: { queryKey: getGetSalesChartQueryKey() } });
  const { data: topItems, isLoading: isLoadingTop } = useGetTopItems({ query: { queryKey: getGetTopItemsQueryKey() } });

  if (isLoadingSummary || isLoadingChart || isLoadingTop) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.todaySales ?? 'Ks 0'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.activeOrders ?? 0}</div>
            <p className="text-xs text-muted-foreground">Total today: {summary?.todayOrders ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Tables</CardTitle>
            <MapIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.availableTables ?? 0}</div>
            <p className="text-xs text-muted-foreground">{summary?.occupiedTables ?? 0} occupied, {summary?.pendingPaymentTables ?? 0} pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary?.lowStockItems ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Sales Overview (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ChartContainer config={{ sales: { label: "Sales", color: "hsl(var(--chart-1))" } }} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData ?? []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), 'MMM dd')} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Top Selling Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {topItems?.map((item) => (
                <div key={item.menuItemId} className="flex items-center">
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{item.totalSold} sold</p>
                  </div>
                  <div className="ml-auto font-medium">{item.totalRevenue}</div>
                </div>
              ))}
              {(!topItems || topItems.length === 0) && (
                <div className="text-sm text-muted-foreground text-center">No data available</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
