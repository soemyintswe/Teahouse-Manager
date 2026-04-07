import { useEffect, useMemo, useState } from "react";
import {
  useListTables,
  useCreateTable,
  useUpdateTable,
  useDeleteTable,
  getListTablesQueryKey,
} from "@workspace/api-client-react";
import type { CreateTableBody, Table, UpdateTableBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Pencil, Trash2, Settings2 } from "lucide-react";
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
  Table as DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const ZONE_OPTIONS = [
  { value: "hall", label: "Hall Zone" },
  { value: "aircon", label: "Air-con Room" },
] as const;

const CATEGORY_OPTIONS = ["Standard", "VIP", "Buffer"] as const;
const SERVICE_STATUS_OPTIONS = ["Active", "Maintenance", "Archived"] as const;
const OCCUPANCY_OPTIONS = ["available", "occupied", "payment_pending", "dirty"] as const;

type FormState = {
  tableNumber: string;
  zone: "hall" | "aircon";
  capacity: string;
  category: "Standard" | "VIP" | "Buffer";
  status: "Active" | "Maintenance" | "Archived";
  isBooked: boolean;
  occupancyStatus: "available" | "occupied" | "payment_pending" | "dirty";
  posX: string;
  posY: string;
};

function getInitialForm(table?: Table): FormState {
  return {
    tableNumber: table?.tableNumber ?? "",
    zone: (table?.zone as "hall" | "aircon") ?? "hall",
    capacity: table ? String(table.capacity) : "4",
    category: table?.category ?? "Standard",
    status: table?.status ?? "Active",
    isBooked: table?.isBooked ?? false,
    occupancyStatus: table?.occupancyStatus ?? "available",
    posX: table ? String(table.posX) : "0",
    posY: table ? String(table.posY) : "0",
  };
}

function getStatusBadgeClass(status: Table["status"]): string {
  if (status === "Active") return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (status === "Maintenance") return "bg-slate-200 text-slate-700 border-slate-300";
  return "bg-zinc-200 text-zinc-700 border-zinc-300";
}

function getOccupancyBadgeClass(status: Table["occupancyStatus"]): string {
  if (status === "available") return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (status === "occupied") return "bg-amber-100 text-amber-700 border-amber-300";
  if (status === "payment_pending") return "bg-red-100 text-red-700 border-red-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function TableDialog({
  open,
  table,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  table?: Table;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateTableBody | UpdateTableBody) => void;
}) {
  const [form, setForm] = useState<FormState>(() => getInitialForm(table));

  useEffect(() => {
    if (!open) return;
    setForm(getInitialForm(table));
  }, [open, table]);

  const valid =
    form.tableNumber.trim().length > 0 &&
    Number(form.capacity) > 0 &&
    Number.isFinite(Number(form.posX)) &&
    Number.isFinite(Number(form.posY));

  const submit = () => {
    const payload = {
      tableNumber: form.tableNumber.trim(),
      zone: form.zone,
      capacity: Number(form.capacity),
      category: form.category,
      status: form.status,
      isBooked: form.isBooked,
      occupancyStatus: form.occupancyStatus,
      posX: Number(form.posX),
      posY: Number(form.posY),
    };
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{table ? `Edit Table ${table.tableNumber}` : "Add New Table"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Table Number</Label>
              <Input
                value={form.tableNumber}
                onChange={(event) => setForm((prev) => ({ ...prev, tableNumber: event.target.value }))}
                placeholder="e.g. H9"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Zone</Label>
              <Select value={form.zone} onValueChange={(value) => setForm((prev) => ({ ...prev, zone: value as FormState["zone"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select zone" />
                </SelectTrigger>
                <SelectContent>
                  {ZONE_OPTIONS.map((zone) => (
                    <SelectItem key={zone.value} value={zone.value}>
                      {zone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Capacity</Label>
              <Input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(value) => setForm((prev) => ({ ...prev, category: value as FormState["category"] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Service Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as FormState["status"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Occupancy</Label>
              <Select
                value={form.occupancyStatus}
                onValueChange={(value) => setForm((prev) => ({ ...prev, occupancyStatus: value as FormState["occupancyStatus"] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select occupancy" />
                </SelectTrigger>
                <SelectContent>
                  {OCCUPANCY_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Position X</Label>
              <Input
                type="number"
                value={form.posX}
                onChange={(event) => setForm((prev) => ({ ...prev, posX: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Position Y</Label>
              <Input
                type="number"
                value={form.posY}
                onChange={(event) => setForm((prev) => ({ ...prev, posY: event.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <div className="flex items-center gap-3 rounded-md border px-3 py-2 w-full">
                <Switch
                  checked={form.isBooked}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isBooked: Boolean(checked) }))}
                />
                <div>
                  <p className="text-sm font-medium">Reserved</p>
                  <p className="text-xs text-muted-foreground">Mark this table as booked</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {table ? "Save Changes" : "Add Table"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TableSettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tables = [], isLoading } = useListTables({
    query: { queryKey: getListTablesQueryKey() },
  });

  const createTable = useCreateTable();
  const updateTable = useUpdateTable();
  const deleteTable = useDeleteTable();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | undefined>(undefined);
  const [deletingTable, setDeletingTable] = useState<Table | undefined>(undefined);

  const sortedTables = useMemo(
    () => [...tables].sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true })),
    [tables],
  );

  const refreshTables = async () => {
    await queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
  };

  const handleCreate = async (payload: CreateTableBody | UpdateTableBody) => {
    try {
      await createTable.mutateAsync({ data: payload as CreateTableBody });
      await refreshTables();
      setDialogOpen(false);
      toast({ title: "Table created successfully." });
    } catch (error) {
      toast({
        title: "Failed to create table",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async (payload: CreateTableBody | UpdateTableBody) => {
    if (!editingTable) return;
    try {
      await updateTable.mutateAsync({ id: editingTable.id, data: payload as UpdateTableBody });
      await refreshTables();
      setDialogOpen(false);
      setEditingTable(undefined);
      toast({ title: `Table ${editingTable.tableNumber} updated.` });
    } catch (error) {
      toast({
        title: "Failed to update table",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingTable) return;
    try {
      await deleteTable.mutateAsync({ id: deletingTable.id });
      await refreshTables();
      toast({ title: `Table ${deletingTable.tableNumber} removed.` });
    } catch (error) {
      toast({
        title: "Failed to delete table",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingTable(undefined);
    }
  };

  const toggleServiceStatus = async (table: Table) => {
    const nextStatus =
      table.status === "Active"
        ? "Maintenance"
        : table.status === "Maintenance"
          ? "Active"
          : "Active";

    try {
      await updateTable.mutateAsync({
        id: table.id,
        data: {
          status: nextStatus,
          occupancyStatus: nextStatus === "Active" ? table.occupancyStatus : "dirty",
          currentOrderId: nextStatus === "Active" ? table.currentOrderId : null,
        },
      });
      await refreshTables();
      toast({ title: `Table ${table.tableNumber} set to ${nextStatus}.` });
    } catch (error) {
      toast({
        title: "Failed to update status",
        description: error instanceof Error ? error.message : "Unknown error",
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Table Settings</h1>
          <p className="text-sm text-muted-foreground">Manage table layout, service status, category, and reservation flags.</p>
        </div>

        <Button
          onClick={() => {
            setEditingTable(undefined);
            setDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add New Table
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <DataTable>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Reserved</TableHead>
              <TableHead>Occupancy</TableHead>
              <TableHead>Position</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTables.map((table) => (
              <TableRow key={table.id}>
                <TableCell className="font-semibold">#{table.id}</TableCell>
                <TableCell className="font-semibold">{table.tableNumber}</TableCell>
                <TableCell>{table.zone === "aircon" ? "Air-con" : "Hall"}</TableCell>
                <TableCell>{table.capacity}</TableCell>
                <TableCell>{table.category}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={getStatusBadgeClass(table.status)}>
                    {table.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {table.isBooked ? <Badge className="bg-blue-500 text-white">Reserved</Badge> : <span className="text-muted-foreground">No</span>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getOccupancyBadgeClass(table.occupancyStatus)}>
                    {table.occupancyStatus}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  x:{table.posX} y:{table.posY}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="ghost" size="icon" onClick={() => toggleServiceStatus(table)} title="Toggle service status">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingTable(table);
                        setDialogOpen(true);
                      }}
                      title="Edit table"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeletingTable(table)} title="Delete table">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {sortedTables.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  No tables found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </DataTable>
      </div>

      <TableDialog
        open={dialogOpen}
        table={editingTable}
        saving={createTable.isPending || updateTable.isPending}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingTable(undefined);
        }}
        onSubmit={(payload) => (editingTable ? handleUpdate(payload) : handleCreate(payload))}
      />

      <AlertDialog open={Boolean(deletingTable)} onOpenChange={(open) => !open && setDeletingTable(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this table?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete table {deletingTable?.tableNumber}. Ensure it has no ongoing order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteTable.isPending}
            >
              {deleteTable.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete Table
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
