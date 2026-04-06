import { useState, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useGetTable,
  useListMenuCategories,
  useListMenuItems,
  useCreateOrder,
  getListTablesQueryKey,
  getListMenuCategoriesQueryKey,
  getListMenuItemsQueryKey,
} from "@workspace/api-client-react";
import type { MenuItem, MenuCategory } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2, ArrowLeft, Plus, Minus, Trash2,
  ShoppingCart, Send, UtensilsCrossed, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type CartItem = {
  menuItemId: number;
  name: string;
  nameMyanmar: string;
  price: number;
  quantity: number;
  notes?: string;
};

function ItemCard({
  item,
  cartQty,
  onAdd,
  onRemove,
}: {
  item: MenuItem;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const price = Number(item.price);
  return (
    <div className="bg-card border rounded-xl p-3 flex flex-col gap-2 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-snug truncate">{item.name}</p>
          <p className="text-xs text-muted-foreground truncate">{item.nameMyanmar}</p>
        </div>
        <span className="font-black text-primary text-sm whitespace-nowrap">
          {price.toLocaleString()} ks
        </span>
      </div>
      {item.description && (
        <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
      )}
      <div className="flex items-center justify-end gap-2 mt-auto pt-1">
        {cartQty > 0 ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onRemove}
              className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-6 text-center font-bold text-sm">{cartQty}</span>
            <button
              onClick={onAdd}
              className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 border border-primary/30 hover:border-primary rounded-lg px-2.5 py-1.5 transition-all hover:bg-primary/5"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>
    </div>
  );
}

export default function NewOrderPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const tableId = useMemo(() => {
    const p = new URLSearchParams(search);
    const id = p.get("tableId");
    return id ? parseInt(id) : null;
  }, [search]);

  const { data: table, isLoading: tableLoading } = useGetTable(
    tableId ?? 0,
    { query: { enabled: tableId != null } }
  );

  const { data: categories = [], isLoading: catsLoading } = useListMenuCategories({
    query: { queryKey: getListMenuCategoriesQueryKey() }
  });

  const [activeCatId, setActiveCatId] = useState<number | null>(null);
  const [search2, setSearch2] = useState("");
  const resolvedCatId = activeCatId ?? categories[0]?.id ?? null;

  const { data: items = [], isLoading: itemsLoading } = useListMenuItems(
    resolvedCatId != null ? { categoryId: resolvedCatId } : undefined,
    {
      query: {
        enabled: resolvedCatId != null,
        queryKey: getListMenuItemsQueryKey(resolvedCatId != null ? { categoryId: resolvedCatId } : undefined),
      }
    }
  );

  const filteredItems = useMemo(() => {
    const q = search2.trim().toLowerCase();
    if (!q) return items.filter(i => i.available !== "false" && i.available !== "0");
    return items.filter(i =>
      (i.available !== "false" && i.available !== "0") &&
      (i.name.toLowerCase().includes(q) || i.nameMyanmar.includes(q))
    );
  }, [items, search2]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes] = useState("");
  const createOrder = useCreateOrder();

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id);
      if (existing) return prev.map(c => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menuItemId: item.id, name: item.name, nameMyanmar: item.nameMyanmar, price: Number(item.price), quantity: 1 }];
    });
  };

  const removeFromCart = (menuItemId: number) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === menuItemId);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter(c => c.menuItemId !== menuItemId);
      return prev.map(c => c.menuItemId === menuItemId ? { ...c, quantity: c.quantity - 1 } : c);
    });
  };

  const deleteFromCart = (menuItemId: number) => {
    setCart(prev => prev.filter(c => c.menuItemId !== menuItemId));
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const handleSubmit = async () => {
    if (!tableId || cart.length === 0) return;
    try {
      const order = await createOrder.mutateAsync({
        data: {
          tableId,
          notes: orderNotes.trim() || undefined,
          items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
        }
      });
      qc.invalidateQueries({ queryKey: getListTablesQueryKey() });
      toast({ title: `Order #${order.id} created for Table ${table?.tableNumber}` });
      setLocation(`/orders/${order.id}`);
    } catch {
      toast({ title: "Failed to create order", variant: "destructive" });
    }
  };

  if (tableLoading || catsLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (tableId && !table) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Table not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => setLocation("/floor-plan")}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Order</h1>
          {table && (
            <p className="text-sm text-muted-foreground">
              Table <span className="font-bold text-foreground">{table.tableNumber}</span>
              {" · "}
              <span className="capitalize">{table.zone === "aircon" ? "Air-con Room" : "Hall Zone"}</span>
              {" · "}
              {table.capacity} seats
            </p>
          )}
        </div>
        {table && (
          <Badge className="ml-auto" variant="outline">
            Table {table.tableNumber}
          </Badge>
        )}
      </div>

      <div className="flex-1 flex gap-5 min-h-0">
        {/* ── Left: Menu Browser ── */}
        <div className="flex-1 flex flex-col min-w-0 gap-3">
          {/* Category tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 flex-shrink-0 scrollbar-hide">
            {(categories as MenuCategory[]).map(cat => (
              <button
                key={cat.id}
                onClick={() => { setActiveCatId(cat.id); setSearch2(""); }}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  resolvedCatId === cat.id
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={search2}
              onChange={e => setSearch2(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Items grid */}
          {itemsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <UtensilsCrossed className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No items found</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    cartQty={cart.find(c => c.menuItemId === item.id)?.quantity ?? 0}
                    onAdd={() => addToCart(item)}
                    onRemove={() => removeFromCart(item.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Order Summary ── */}
        <div className="w-80 flex-shrink-0 flex flex-col bg-card border rounded-xl overflow-hidden">
          {/* Cart header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30 flex-shrink-0">
            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
            <span className="font-bold text-sm">Order Summary</span>
            {cartCount > 0 && (
              <Badge className="ml-auto" variant="secondary">{cartCount} items</Badge>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8">
                <ShoppingCart className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm text-center">Tap items on the left<br/>to add to order</p>
              </div>
            ) : (
              cart.map(c => (
                <div key={c.menuItemId} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-snug truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{(c.price * c.quantity).toLocaleString()} ks</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => removeFromCart(c.menuItemId)}
                      className="w-6 h-6 rounded-full border flex items-center justify-center hover:bg-background transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold">{c.quantity}</span>
                    <button
                      onClick={() => addToCart({ id: c.menuItemId, name: c.name, nameMyanmar: c.nameMyanmar, price: String(c.price) } as MenuItem)}
                      className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteFromCart(c.menuItemId)}
                      className="w-6 h-6 rounded-full hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors text-muted-foreground ml-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Notes + Total + Submit */}
          <div className="flex-shrink-0 border-t p-4 space-y-3">
            <Input
              placeholder="Order notes (optional)..."
              value={orderNotes}
              onChange={e => setOrderNotes(e.target.value)}
              className="text-sm"
            />

            {cart.length > 0 && (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{cartTotal.toLocaleString()} ks</span>
                </div>
                {table?.zone === "aircon" && (
                  <div className="flex justify-between text-blue-600">
                    <span>Aircon fee</span>
                    <span>+ 500 ks</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-base pt-1 border-t">
                  <span>Est. Total</span>
                  <span className="text-primary">
                    {(cartTotal + (table?.zone === "aircon" ? 500 : 0)).toLocaleString()} ks
                  </span>
                </div>
              </div>
            )}

            <Button
              className="w-full gap-2"
              disabled={cart.length === 0 || createOrder.isPending}
              onClick={handleSubmit}
            >
              {createOrder.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />
              }
              {createOrder.isPending ? "Creating..." : `Create Order (${cartCount} items)`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
