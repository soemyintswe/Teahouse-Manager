import { useEffect, useMemo, useState } from "react";
import {
  useListInventory,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  getListInventoryQueryKey,
} from "@workspace/api-client-react";
import type { InventoryItem, CreateInventoryItemBody, UpdateInventoryItemBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

type FormState = {
  name: string;
  unit: string;
  currentStock: string;
  minimumStock: string;
  cost: string;
  supplierId: string;
  lastRestockedAt: string;
};

function getInitialForm(item?: InventoryItem): FormState {
  return {
    name: item?.name ?? "",
    unit: item?.unit ?? "",
    currentStock: item?.currentStock ?? "0",
    minimumStock: item?.minimumStock ?? "0",
    cost: item?.cost ?? "0",
    supplierId: item?.supplierId != null ? String(item.supplierId) : "",
    lastRestockedAt: item?.lastRestockedAt ? toLocalDateTimeInput(item.lastRestockedAt) : "",
  };
}

function toLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return adjusted.toISOString().slice(0, 16);
}

function InventoryDialog({
  open,
  item,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  item?: InventoryItem;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateInventoryItemBody | UpdateInventoryItemBody) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(() => getInitialForm(item));

  useEffect(() => {
    if (!open) return;
    setForm(getInitialForm(item));
  }, [item, open]);

  const isValid =
    form.name.trim().length > 0 &&
    form.unit.trim().length > 0 &&
    Number.isFinite(Number(form.currentStock)) &&
    Number.isFinite(Number(form.minimumStock)) &&
    Number.isFinite(Number(form.cost));

  const handleSubmit = () => {
    const payload = {
      name: form.name.trim(),
      unit: form.unit.trim(),
      currentStock: form.currentStock,
      minimumStock: form.minimumStock,
      cost: form.cost,
      supplierId: form.supplierId.trim() ? Number(form.supplierId) : undefined,
      lastRestockedAt: form.lastRestockedAt ? new Date(form.lastRestockedAt).toISOString() : undefined,
    };
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? t("inventory.editTitle") : t("inventory.addTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("inventory.name")}</Label>
            <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("inventory.unit")}</Label>
            <Input value={form.unit} onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))} placeholder="kg, liter, piece" />
          </div>
          <div className="space-y-1">
            <Label>{t("inventory.currentStock")}</Label>
            <Input type="number" value={form.currentStock} onChange={(e) => setForm((prev) => ({ ...prev, currentStock: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("inventory.minimumStock")}</Label>
            <Input type="number" value={form.minimumStock} onChange={(e) => setForm((prev) => ({ ...prev, minimumStock: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("inventory.cost")}</Label>
            <Input type="number" value={form.cost} onChange={(e) => setForm((prev) => ({ ...prev, cost: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>{t("inventory.supplierId")}</Label>
            <Input type="number" value={form.supplierId} onChange={(e) => setForm((prev) => ({ ...prev, supplierId: e.target.value }))} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>{t("inventory.lastRestockedAt")}</Label>
            <Input
              type="datetime-local"
              value={form.lastRestockedAt}
              onChange={(e) => setForm((prev) => ({ ...prev, lastRestockedAt: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={!isValid || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {item ? t("common.saveChanges") : t("inventory.addItem")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useListInventory({ query: { queryKey: getListInventoryQueryKey() } });
  const createItem = useCreateInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const deleteItem = useDeleteInventoryItem();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>(undefined);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | undefined>(undefined);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
  };

  const handleSave = async (payload: CreateInventoryItemBody | UpdateInventoryItemBody) => {
    try {
      if (editingItem) {
        await updateItem.mutateAsync({ id: editingItem.id, data: payload as UpdateInventoryItemBody });
        toast({ title: t("inventory.updated", { name: editingItem.name }) });
      } else {
        await createItem.mutateAsync({ data: payload as CreateInventoryItemBody });
        toast({ title: t("inventory.created") });
      }
      setDialogOpen(false);
      setEditingItem(undefined);
      await refresh();
    } catch (error) {
      toast({
        title: t("inventory.saveFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    try {
      await deleteItem.mutateAsync({ id: deletingItem.id });
      toast({ title: t("inventory.deleted", { name: deletingItem.name }) });
      setDeletingItem(undefined);
      await refresh();
    } catch (error) {
      toast({
        title: t("inventory.deleteFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{t("inventory.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("inventory.subtitle")}</p>
        </div>
        <Button
          className="gap-2"
          onClick={() => {
            setEditingItem(undefined);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          {t("inventory.addItem")}
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.id")}</TableHead>
              <TableHead>{t("inventory.name")}</TableHead>
              <TableHead>{t("inventory.unit")}</TableHead>
              <TableHead>{t("inventory.currentStock")}</TableHead>
              <TableHead>{t("inventory.minimumStock")}</TableHead>
              <TableHead>{t("inventory.cost")}</TableHead>
              <TableHead>{t("inventory.status")}</TableHead>
              <TableHead className="text-right">{t("tableSettings.columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  {t("inventory.empty")}
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((item) => {
                const current = Number(item.currentStock);
                const min = Number(item.minimumStock);
                const isLow = Number.isFinite(current) && Number.isFinite(min) && current <= min;
                return (
                  <TableRow key={item.id}>
                    <TableCell>#{item.id}</TableCell>
                    <TableCell className="font-semibold">{item.name}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{Number(item.currentStock).toLocaleString()}</TableCell>
                    <TableCell>{Number(item.minimumStock).toLocaleString()}</TableCell>
                    <TableCell>{Number(item.cost).toLocaleString()} ks</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={isLow ? "bg-rose-100 text-rose-700 border-rose-300" : "bg-emerald-100 text-emerald-700 border-emerald-300"}>
                        {isLow ? t("inventory.lowStock") : t("inventory.okStock")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingItem(item);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeletingItem(item)}>
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

      <InventoryDialog
        open={dialogOpen}
        item={editingItem}
        saving={createItem.isPending || updateItem.isPending}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingItem(undefined);
        }}
        onSubmit={handleSave}
      />

      <AlertDialog open={Boolean(deletingItem)} onOpenChange={(open) => !open && setDeletingItem(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("inventory.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("inventory.deleteDesc", { name: deletingItem?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              {t("menu.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
