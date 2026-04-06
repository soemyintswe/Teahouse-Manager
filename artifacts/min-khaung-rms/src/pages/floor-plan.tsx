import { useListTables, getListTablesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";

export default function FloorPlan() {
  const { data: tables, isLoading } = useListTables({ query: { queryKey: getListTablesQueryKey() } });
  const [, setLocation] = useLocation();

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-500 border-green-700 text-white';
      case 'occupied': return 'bg-yellow-400 border-yellow-600 text-yellow-950';
      case 'payment_pending': return 'bg-red-500 border-red-700 text-white';
      case 'dirty': return 'bg-gray-400 border-gray-600 text-white';
      default: return 'bg-gray-200 border-gray-400 text-black';
    }
  };

  const hallTables = tables?.filter(t => t.zone === 'hall') ?? [];
  const airconTables = tables?.filter(t => t.zone === 'aircon') ?? [];

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Floor Plan</h1>
        <div className="flex gap-4 text-sm font-medium">
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-500 rounded"></div> Available</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-yellow-400 rounded"></div> Occupied</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-red-500 rounded"></div> Payment Pending</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-gray-400 rounded"></div> Dirty</div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-8 min-h-[600px]">
        {/* Hall Zone */}
        <Card className="relative overflow-hidden bg-card border-2">
          <div className="absolute top-0 left-0 right-0 bg-muted p-2 text-center font-bold border-b">
            Hall Zone
          </div>
          <CardContent className="p-0 h-full w-full relative mt-10">
            {hallTables.map(table => (
              <button
                key={table.id}
                className={`absolute w-24 h-24 rounded-lg border-2 shadow-sm flex flex-col items-center justify-center transition-transform hover:scale-105 ${getStatusColor(table.status)}`}
                style={{ left: `${table.posX}px`, top: `${table.posY}px` }}
                onClick={() => table.currentOrderId ? setLocation(`/orders/${table.currentOrderId}`) : setLocation(`/orders/new?tableId=${table.id}`)}
              >
                <span className="font-bold text-xl">{table.tableNumber}</span>
                <span className="text-xs opacity-90">{table.capacity} pax</span>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Aircon Zone */}
        <Card className="relative overflow-hidden bg-card border-2 border-blue-200">
          <div className="absolute top-0 left-0 right-0 bg-blue-50 p-2 text-center font-bold border-b border-blue-200 text-blue-900">
            Air-con Room
          </div>
          <CardContent className="p-0 h-full w-full relative mt-10">
            {airconTables.map(table => (
              <button
                key={table.id}
                className={`absolute w-24 h-24 rounded-lg border-2 shadow-sm flex flex-col items-center justify-center transition-transform hover:scale-105 ${getStatusColor(table.status)}`}
                style={{ left: `${table.posX}px`, top: `${table.posY}px` }}
                onClick={() => table.currentOrderId ? setLocation(`/orders/${table.currentOrderId}`) : setLocation(`/orders/new?tableId=${table.id}`)}
              >
                <span className="font-bold text-xl">{table.tableNumber}</span>
                <span className="text-xs opacity-90">{table.capacity} pax</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
