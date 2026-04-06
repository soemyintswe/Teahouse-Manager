import { useEffect, useMemo, useState } from "react";
import {
  useListMenuCategories,
  useListMenuItems,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  getListMenuCategoriesQueryKey,
  getListMenuItemsQueryKey,
} from "@workspace/api-client-react";
import type {
  MenuCategory,
  MenuItem,
  CreateMenuItemBody,
  UpdateMenuItemBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const STATION_OPTIONS = [
  { value: "salad", label: "Salad" },
  { value: "tea-coffee", label: "Tea & Coffee" },
  { value: "juice", label: "Juice" },
  { value: "kitchen", label: "Kitchen" },
] as const;

type StationCode = (typeof STATION_OPTIONS)[number]["value"];
type StationFilter = "all" | StationCode;

type ItemFormState = {
  name: string;
  nameMyanmar: string;
  categoryId: string;
  station: StationCode;
  price: string;
  description: string;
  available: boolean;
};

function getStationLabel(station: StationCode): string {
  return STATION_OPTIONS.find((option) => option.value === station)?.label ?? station;
}

function buildInitialItemForm(item: MenuItem | undefined, categories: MenuCategory[]): ItemFormState {
  return {
    name: item?.name ?? "",
    nameMyanmar: item?.nameMyanmar ?? "",
    categoryId: String(item?.categoryId ?? categories[0]?.id ?? ""),
    station: item?.station ?? "kitchen",
    price: item?.price ?? "",
    description: item?.description ?? "",
    available: item ? item.available !== "false" && item.available !== "0" : true,
  };
}

function ItemDialog({
  open,
  item,
  categories,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  item?: MenuItem;
  categories: MenuCategory[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateMenuItemBody | UpdateMenuItemBody) => void;
}) {
  const [form, setForm] = useState<ItemFormState>(() => buildInitialItemForm(item, categories));

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialItemForm(item, categories));
  }, [open, item, categories]);

  const valid =
    form.name.trim().length > 0 &&
    form.price.trim().length > 0 &&
    form.categoryId.trim().length > 0 &&
    form.station.trim().length > 0;

  const handleSubmit = () => {
    const payload = {
      name: form.name.trim(),
      nameMyanmar: form.nameMyanmar.trim() || form.name.trim(),
      categoryId: Number(form.categoryId),
      station: form.station,
      price: form.price.trim(),
      description: form.description.trim() || undefined,
      available: form.available ? "true" : "false",
    };
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Menu Item" : "Add New Menu Item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Item Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Myanmar Milk Tea"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Item Name (Myanmar)</Label>
              <Input
                value={form.nameMyanmar}
                onChange={(e) => setForm((prev) => ({ ...prev, nameMyanmar: e.target.value }))}
                placeholder="e.g. လက်ဖက်ရည်"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Price (MMK)</Label>
              <Input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                placeholder="e.g. 2500"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Station</Label>
              <Select
                value={form.station}
                onValueChange={(value) => setForm((prev) => ({ ...prev, station: value as StationCode }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select station" />
                </SelectTrigger>
                <SelectContent>
                  {STATION_OPTIONS.map((station) => (
                    <SelectItem key={station.value} value={station.value}>
                      {station.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.categoryId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, categoryId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Short description"
            />
          </div>

          <div className="flex items-center gap-3 rounded-md border px-3 py-2">
            <Switch
              id="item-available"
              checked={form.available}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, available: checked }))}
            />
            <Label htmlFor="item-available">{form.available ? "Available" : "Unavailable"}</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {item ? "Save Changes" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MenuPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: categories = [], isLoading: categoriesLoading } = useListMenuCategories({
    query: { queryKey: getListMenuCategoriesQueryKey() },
  });

  const { data: menuItems = [], isLoading: itemsLoading } = useListMenuItems(undefined, {
    query: { queryKey: getListMenuItemsQueryKey() },
  });

  const createItem = useCreateMenuItem();
  const updateItem = useUpdateMenuItem();
  const deleteItem = useDeleteMenuItem();

  const [stationFilter, setStationFilter] = useState<StationFilter>("all");
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item?: MenuItem }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);

  const categoryNameById = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category.name]));
  }, [categories]);

  const filteredItems = useMemo(() => {
    if (stationFilter === "all") return menuItems;
    return menuItems.filter((item) => item.station === stationFilter);
  }, [menuItems, stationFilter]);

  const invalidateItems = () => {
    queryClient.invalidateQueries({ queryKey: getListMenuItemsQueryKey() });
  };

  const handleSaveItem = async (payload: CreateMenuItemBody | UpdateMenuItemBody) => {
    try {
      if (itemDialog.item) {
        await updateItem.mutateAsync({
          id: itemDialog.item.id,
          data: payload as UpdateMenuItemBody,
        });
        toast({ title: "Menu item updated" });
      } else {
        await createItem.mutateAsync({ data: payload as CreateMenuItemBody });
        toast({ title: "Menu item added" });
      }
      setItemDialog({ open: false });
      invalidateItems();
    } catch {
      toast({ title: "Failed to save menu item", variant: "destructive" });
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteTarget) return;
    try {
      await deleteItem.mutateAsync({ id: deleteTarget.id });
      toast({ title: "Menu item deleted" });
      setDeleteTarget(null);
      invalidateItems();
    } catch {
      toast({ title: "Failed to delete menu item", variant: "destructive" });
    }
  };

  if (categoriesLoading || itemsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Menu Management</h1>
          <p className="text-sm text-muted-foreground">
            {menuItems.length} items in database
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={stationFilter} onValueChange={(value) => setStationFilter(value as StationFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filter station" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stations</SelectItem>
              {STATION_OPTIONS.map((station) => (
                <SelectItem key={station.value} value={station.value}>
                  {station.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => setItemDialog({ open: true })}
            disabled={categories.length === 0}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add New Item
          </Button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          <div className="text-center">
            <UtensilsCrossed className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p>No menu category found. Create category first.</p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Item Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Station</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No menu items for selected filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const available = item.available !== "false" && item.available !== "0";
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">#{item.id}</TableCell>
                      <TableCell>
                        <div className="font-semibold">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.nameMyanmar}</div>
                      </TableCell>
                      <TableCell>{categoryNameById.get(item.categoryId) ?? `Category #${item.categoryId}`}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{getStationLabel(item.station)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {Number(item.price).toLocaleString()} ks
                      </TableCell>
                      <TableCell>
                        <Badge variant={available ? "secondary" : "outline"}>
                          {available ? "Available" : "Unavailable"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setItemDialog({ open: true, item })}
                            title="Edit item"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(item)}
                            title="Delete item"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ItemDialog
        open={itemDialog.open}
        item={itemDialog.item}
        categories={categories}
        saving={createItem.isPending || updateItem.isPending}
        onOpenChange={(open) => setItemDialog((prev) => ({ ...prev, open, item: open ? prev.item : undefined }))}
        onSubmit={handleSaveItem}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete menu item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" ကို ဖျက်မည်။ ဒီလုပ်ဆောင်ချက်ကို ပြန်လည်မပြောင်းနိုင်ပါ။
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteItem}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
