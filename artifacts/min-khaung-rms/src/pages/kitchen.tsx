import { useListKitchenOrders, getListKitchenOrdersQueryKey, useUpdateKitchenItemStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, Clock, ChefHat } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function Kitchen() {
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useListKitchenOrders({ query: { queryKey: getListKitchenOrdersQueryKey(), refetchInterval: 10000 } });
  const updateStatus = useUpdateKitchenItemStatus();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const handleStatusChange = (orderId: number, itemId: number, currentStatus: string) => {
    let nextStatus = 'new';
    if (currentStatus === 'new') nextStatus = 'cooking';
    else if (currentStatus === 'cooking') nextStatus = 'ready';
    else return; // already ready/served

    updateStatus.mutate({ 
      id: itemId, 
      data: { kitchenStatus: nextStatus } 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListKitchenOrdersQueryKey() });
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'new': return 'bg-blue-100 border-blue-300 text-blue-900';
      case 'cooking': return 'bg-orange-100 border-orange-300 text-orange-900';
      case 'ready': return 'bg-green-100 border-green-300 text-green-900';
      default: return 'bg-gray-100 border-gray-300 text-gray-900';
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between bg-primary text-primary-foreground p-4 rounded-lg">
        <div className="flex items-center gap-3">
          <ChefHat className="h-8 w-8" />
          <h1 className="text-3xl font-bold tracking-tight">Kitchen Display System</h1>
        </div>
        <div className="flex gap-4 font-medium bg-background/20 p-2 rounded">
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-blue-400 rounded"></div> New</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-orange-400 rounded"></div> Cooking</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-500 rounded"></div> Ready</div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-auto pb-4">
        {orders?.map(order => (
          <Card key={order.orderId} className="flex flex-col border-2 shadow-md">
            <CardHeader className="bg-muted pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl font-black">Table {order.tableNumber}</CardTitle>
                  <span className="text-sm font-semibold uppercase text-muted-foreground">{order.zone}</span>
                </div>
                <div className="flex items-center text-red-600 font-bold bg-red-100 px-2 py-1 rounded">
                  <Clock className="w-4 h-4 mr-1" />
                  {formatDistanceToNow(new Date(order.orderTime))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-2 space-y-2 overflow-y-auto">
              {order.items.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => handleStatusChange(order.orderId, item.id, item.kitchenStatus)}
                  className={`p-3 rounded border-2 cursor-pointer transition-colors ${getStatusColor(item.kitchenStatus)}`}
                >
                  <div className="flex justify-between items-start font-bold text-lg">
                    <div className="flex items-start gap-2">
                      <span className="bg-background/50 px-2 py-0.5 rounded">{item.quantity}x</span>
                      <span>{item.menuItemName}</span>
                    </div>
                    {item.kitchenStatus === 'ready' && <CheckCircle className="text-green-600" />}
                  </div>
                  {(item.customizations || item.notes) && (
                    <div className="mt-2 text-sm opacity-90 pl-10 border-l-2 border-current ml-2">
                      {item.customizations && <p className="italic">{item.customizations}</p>}
                      {item.notes && <p className="font-semibold text-red-700">Note: {item.notes}</p>}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        {(!orders || orders.length === 0) && (
          <div className="col-span-full flex flex-col items-center justify-center text-muted-foreground h-[400px]">
            <CheckCircle className="h-16 w-16 mb-4 text-green-500 opacity-50" />
            <h2 className="text-2xl font-bold">All clear!</h2>
            <p>No active orders in the kitchen right now.</p>
          </div>
        )}
      </div>
    </div>
  );
}
