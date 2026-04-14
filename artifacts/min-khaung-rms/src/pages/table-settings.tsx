import { useEffect, useMemo, useState } from "react";
import {
  useListTables,
  useCreateTable,
  useUpdateTable,
  useDeleteTable,
  getListTablesQueryKey,
} from "@workspace/api-client-react";
import type { CreateTableBody, Table, UpdateTableBody } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Pencil, Trash2, Settings2, Check, Copy, QrCode, Printer, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { buildQrImageUrl, buildTableScanLink, openQrPrintWindow } from "@/lib/qr-links";
import {
  createRoom,
  deleteRoom,
  listRooms,
  ROOMS_QUERY_KEY,
  updateRoom,
  type CreateRoomInput,
  type RoomRecord,
} from "@/lib/rooms-api";

const CATEGORY_OPTIONS = ["Standard", "VIP", "Buffer"] as const;
const SERVICE_STATUS_OPTIONS = ["Active", "Maintenance", "Archived"] as const;
const OCCUPANCY_OPTIONS = ["available", "occupied", "payment_pending", "paid", "dirty"] as const;

type FormState = {
  tableNumber: string;
  zone: string;
  capacity: string;
  category: "Standard" | "VIP" | "Buffer";
  status: "Active" | "Maintenance" | "Archived";
  isBooked: boolean;
  occupancyStatus: "available" | "occupied" | "payment_pending" | "paid" | "dirty";
  posX: string;
  posY: string;
};

type RoomFormState = {
  code: string;
  name: string;
  sortOrder: string;
};

const ROOM_CODE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function getNextTableNumber(baseTableNumber: string, existingTableNumbers: Set<string>): string {
  const base = baseTableNumber.trim();
  const tailNumberMatch = /^(.*?)(\d+)$/.exec(base);

  if (tailNumberMatch) {
    const [, prefix, numberText] = tailNumberMatch;
    let nextNumber = Number.parseInt(numberText, 10) + 1;
    while (existingTableNumbers.has(`${prefix}${nextNumber}`)) {
      nextNumber += 1;
    }
    return `${prefix}${nextNumber}`;
  }

  let candidate = `${base}-copy`;
  let count = 2;
  while (existingTableNumbers.has(candidate)) {
    candidate = `${base}-copy-${count}`;
    count += 1;
  }
  return candidate;
}

function getInitialForm(defaultZone: string, table?: Table): FormState {
  return {
    tableNumber: table?.tableNumber ?? "",
    zone: table?.zone ?? defaultZone,
    capacity: table ? String(table.capacity) : "4",
    category: table?.category ?? "Standard",
    status: table?.status ?? "Active",
    isBooked: table?.isBooked ?? false,
    occupancyStatus: table?.occupancyStatus ?? "available",
    posX: table ? String(table.posX) : "0",
    posY: table ? String(table.posY) : "0",
  };
}

function getInitialRoomForm(room?: RoomRecord): RoomFormState {
  return {
    code: room?.code ?? "",
    name: room?.name ?? "",
    sortOrder: room ? String(room.sortOrder) : "0",
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
  if (status === "paid") return "bg-blue-100 text-blue-700 border-blue-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function getZoneLabel(
  zone: string,
  t: (key: string) => string,
  roomNameByCode?: Map<string, string>,
  short = false,
): string {
  const normalized = zone.trim().toLowerCase();
  if (roomNameByCode?.has(zone)) return roomNameByCode.get(zone) ?? zone;
  if (normalized === "aircon") {
    return t(short ? "zones.airconShort" : "zones.aircon");
  }
  if (normalized === "outside" || normalized === "outdoor") {
    return t(short ? "zones.outsideShort" : "zones.outside");
  }
  if (normalized === "hall") return t(short ? "zones.hallShort" : "zones.hall");
  return zone;
}

function TableDialog({
  open,
  table,
  rooms,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  table?: Table;
  rooms: RoomRecord[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateTableBody | UpdateTableBody) => void;
}) {
  const { t } = useTranslation();
  const defaultZone = rooms[0]?.code ?? "hall";
  const [form, setForm] = useState<FormState>(() => getInitialForm(defaultZone, table));

  useEffect(() => {
    if (!open) return;
    setForm(getInitialForm(defaultZone, table));
  }, [open, table, defaultZone]);

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
          <DialogTitle>
            {table ? t("tableSettings.editTable", { tableNumber: table.tableNumber }) : t("tableSettings.addTable")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("tableSettings.tableNumber")}</Label>
              <Input
                value={form.tableNumber}
                onChange={(event) => setForm((prev) => ({ ...prev, tableNumber: event.target.value }))}
                placeholder={t("tableSettings.tableNumberPlaceholder")}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("tableSettings.room")}</Label>
              <Select value={form.zone} onValueChange={(value) => setForm((prev) => ({ ...prev, zone: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("tableSettings.selectRoom")} />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((room) => (
                    <SelectItem key={room.code} value={room.code}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>{t("tableSettings.capacity")}</Label>
              <Input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("tableSettings.category")}</Label>
              <Select
                value={form.category}
                onValueChange={(value) => setForm((prev) => ({ ...prev, category: value as FormState["category"] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("tableSettings.selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((category) => (
                    <SelectItem key={category} value={category}>
                      {t(`category.${category}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("tableSettings.serviceStatus")}</Label>
              <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as FormState["status"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("tableSettings.selectStatus")} />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`status.service.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("tableSettings.occupancy")}</Label>
              <Select
                value={form.occupancyStatus}
                onValueChange={(value) => setForm((prev) => ({ ...prev, occupancyStatus: value as FormState["occupancyStatus"] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("tableSettings.selectOccupancy")} />
                </SelectTrigger>
                <SelectContent>
                  {OCCUPANCY_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`status.occupancy.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("tableSettings.positionX")}</Label>
              <Input
                type="number"
                value={form.posX}
                onChange={(event) => setForm((prev) => ({ ...prev, posX: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("tableSettings.positionY")}</Label>
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
                  <p className="text-sm font-medium">{t("tableSettings.reserved")}</p>
                  <p className="text-xs text-muted-foreground">{t("tableSettings.reservedHint")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!valid || saving || rooms.length === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {table ? t("common.saveChanges") : t("tableSettings.addTable")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TableSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tables = [], isLoading: isTablesLoading } = useListTables({
    query: { queryKey: getListTablesQueryKey() },
  });
  const { data: rooms = [], isLoading: isRoomsLoading } = useQuery({
    queryKey: ROOMS_QUERY_KEY,
    queryFn: listRooms,
    staleTime: 15000,
  });

  const createTable = useCreateTable();
  const updateTable = useUpdateTable();
  const deleteTable = useDeleteTable();
  const createRoomMutation = useMutation({ mutationFn: createRoom });
  const updateRoomMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateRoomInput> }) => updateRoom(id, data),
  });
  const deleteRoomMutation = useMutation({ mutationFn: deleteRoom });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | undefined>(undefined);
  const [deletingTable, setDeletingTable] = useState<Table | undefined>(undefined);
  const [qrTable, setQrTable] = useState<Table | undefined>(undefined);
  const [roomForm, setRoomForm] = useState<RoomFormState>(() => getInitialRoomForm());
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<RoomRecord | undefined>(undefined);

  const sortedTables = useMemo(
    () => [...tables].sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true })),
    [tables],
  );
  const existingTableNumbers = useMemo(
    () => new Set(sortedTables.map((table) => table.tableNumber)),
    [sortedTables],
  );
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name)),
    [rooms],
  );
  const roomNameByCode = useMemo(
    () => new Map(sortedRooms.map((room) => [room.code, room.name])),
    [sortedRooms],
  );
  const roomFormValid = roomForm.code.trim().length > 0 && roomForm.name.trim().length > 0;
  const isRoomMutationPending =
    createRoomMutation.isPending || updateRoomMutation.isPending || deleteRoomMutation.isPending;

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY }),
    ]);
  };

  const resetRoomForm = () => {
    setEditingRoomId(null);
    setRoomForm(getInitialRoomForm());
  };

  const handleCreate = async (payload: CreateTableBody | UpdateTableBody) => {
    try {
      await createTable.mutateAsync({ data: payload as CreateTableBody });
      await refreshAll();
      setDialogOpen(false);
      toast({ title: t("tableSettings.tableCreated") });
    } catch (error) {
      toast({
        title: t("tableSettings.failedCreate"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async (payload: CreateTableBody | UpdateTableBody) => {
    if (!editingTable) return;
    try {
      await updateTable.mutateAsync({ id: editingTable.id, data: payload as UpdateTableBody });
      await refreshAll();
      setDialogOpen(false);
      setEditingTable(undefined);
      toast({ title: t("tableSettings.tableUpdated", { tableNumber: editingTable.tableNumber }) });
    } catch (error) {
      toast({
        title: t("tableSettings.failedUpdate"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingTable) return;
    try {
      await deleteTable.mutateAsync({ id: deletingTable.id });
      await refreshAll();
      toast({ title: t("tableSettings.tableRemoved", { tableNumber: deletingTable.tableNumber }) });
    } catch (error) {
      toast({
        title: t("tableSettings.failedDelete"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
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
      await refreshAll();
      toast({
        title: t("tableSettings.setStatus", {
          tableNumber: table.tableNumber,
          status: t(`status.service.${nextStatus}`),
        }),
      });
    } catch (error) {
      toast({
        title: t("tableSettings.failedUpdateStatus"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleDuplicateTable = async (table: Table) => {
    const nextTableNumber = getNextTableNumber(table.tableNumber, existingTableNumbers);
    try {
      await createTable.mutateAsync({
        data: {
          tableNumber: nextTableNumber,
          zone: table.zone,
          capacity: table.capacity,
          category: table.category,
          status: "Active",
          isBooked: false,
          occupancyStatus: "available",
          posX: table.posX + 24,
          posY: table.posY + 24,
        },
      });
      await refreshAll();
      toast({
        title: t("tableSettings.tableDuplicated", {
          source: table.tableNumber,
          target: nextTableNumber,
        }),
      });
    } catch (error) {
      toast({
        title: t("tableSettings.failedDuplicate"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleRoomSubmit = async () => {
    if (!roomFormValid) return;

    const normalizedCode = roomForm.code.trim().toLowerCase();
    if (!ROOM_CODE_REGEX.test(normalizedCode)) {
      toast({
        title: t("tableSettings.rooms.invalidCodeTitle"),
        description: t("tableSettings.rooms.invalidCodeDescription"),
        variant: "destructive",
      });
      return;
    }

    const payload = {
      code: normalizedCode,
      name: roomForm.name.trim(),
      sortOrder: Number.isFinite(Number(roomForm.sortOrder)) ? Number(roomForm.sortOrder) : 0,
    };

    try {
      if (editingRoomId == null) {
        await createRoomMutation.mutateAsync({ ...payload, isActive: true });
        toast({ title: t("tableSettings.rooms.created") });
      } else {
        await updateRoomMutation.mutateAsync({ id: editingRoomId, data: payload });
        toast({
          title: t("tableSettings.rooms.updated", {
            room: payload.name,
            status: t("common.saveChanges"),
          }),
        });
      }
      await refreshAll();
      resetRoomForm();
    } catch (error) {
      toast({
        title: editingRoomId == null ? t("tableSettings.rooms.failedCreate") : t("tableSettings.rooms.failedUpdate"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const toggleRoomActive = async (room: RoomRecord) => {
    try {
      await updateRoomMutation.mutateAsync({ id: room.id, data: { isActive: !room.isActive } });
      await refreshAll();
      toast({
        title: t("tableSettings.rooms.updated", {
          room: room.name,
          status: !room.isActive ? t("tableSettings.rooms.active") : t("tableSettings.rooms.closed"),
        }),
      });
    } catch (error) {
      toast({
        title: t("tableSettings.rooms.failedUpdate"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleDeleteRoom = async () => {
    if (!deletingRoom) return;
    try {
      await deleteRoomMutation.mutateAsync(deletingRoom.id);
      await refreshAll();
      toast({ title: t("tableSettings.rooms.deleted", { room: deletingRoom.name }) });
    } catch (error) {
      toast({
        title: t("tableSettings.rooms.failedDelete"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setDeletingRoom(undefined);
    }
  };

  const qrTargetLink = qrTable ? buildTableScanLink(qrTable.id) : "";
  const qrTargetImage = qrTargetLink ? buildQrImageUrl(qrTargetLink, 320) : "";

  if (isTablesLoading || isRoomsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{t("tableSettings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("tableSettings.subtitle")}</p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3">
          <h2 className="text-lg font-bold">{t("tableSettings.rooms.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("tableSettings.rooms.subtitle")}</p>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <Input
            value={roomForm.code}
            onChange={(event) => setRoomForm((prev) => ({ ...prev, code: event.target.value }))}
            placeholder={t("tableSettings.rooms.codePlaceholder")}
          />
          <Input
            value={roomForm.name}
            onChange={(event) => setRoomForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={t("tableSettings.rooms.namePlaceholder")}
          />
          <Input
            type="number"
            value={roomForm.sortOrder}
            onChange={(event) => setRoomForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
            placeholder={t("tableSettings.rooms.sortOrder")}
          />
          <div className="flex gap-2">
            <Button className="flex-1 gap-2" onClick={handleRoomSubmit} disabled={!roomFormValid || isRoomMutationPending}>
              {isRoomMutationPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editingRoomId == null ? t("tableSettings.rooms.addRoom") : t("common.saveChanges")}
            </Button>
            {editingRoomId != null ? (
              <Button variant="outline" onClick={resetRoomForm}>
                {t("common.cancel")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sortedRooms.map((room) => (
            <div key={room.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{room.name}</p>
                  <p className="text-xs text-muted-foreground">{room.code}</p>
                </div>
                <Badge variant="outline" className={room.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}>
                  {room.isActive ? t("tableSettings.rooms.active") : t("tableSettings.rooms.closed")}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("tableSettings.rooms.sortLabel", { value: room.sortOrder })}</p>
              <div className="mt-3 flex items-center justify-end gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  title={t("tableSettings.rooms.toggleRoom")}
                  onClick={() => toggleRoomActive(room)}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={t("tableSettings.rooms.editRoom")}
                  onClick={() => {
                    setEditingRoomId(room.id);
                    setRoomForm(getInitialRoomForm(room));
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" title={t("tableSettings.rooms.deleteRoom")} onClick={() => setDeletingRoom(room)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
          {sortedRooms.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              {t("tableSettings.rooms.empty")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{t("tableSettings.tablesTitle")}</h2>
          {sortedRooms.length === 0 ? (
            <p className="text-sm text-red-600">{t("tableSettings.rooms.requiredHint")}</p>
          ) : null}
        </div>

        <Button
          onClick={() => {
            setEditingTable(undefined);
            setDialogOpen(true);
          }}
          className="gap-2"
          disabled={sortedRooms.length === 0}
        >
          <Plus className="h-4 w-4" />
          {t("tableSettings.addNewTable")}
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <DataTable>
          <TableHeader>
            <TableRow>
              <TableHead>{t("tableSettings.columns.id")}</TableHead>
              <TableHead>{t("tableSettings.columns.table")}</TableHead>
              <TableHead>{t("tableSettings.columns.zone")}</TableHead>
              <TableHead>{t("tableSettings.columns.capacity")}</TableHead>
              <TableHead>{t("tableSettings.columns.category")}</TableHead>
              <TableHead>{t("tableSettings.columns.service")}</TableHead>
              <TableHead>{t("tableSettings.columns.reserved")}</TableHead>
              <TableHead>{t("tableSettings.columns.occupancy")}</TableHead>
              <TableHead>{t("tableSettings.columns.position")}</TableHead>
              <TableHead className="text-right">{t("tableSettings.columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTables.map((table) => (
              <TableRow key={table.id}>
                <TableCell className="font-semibold">#{table.id}</TableCell>
                <TableCell className="font-semibold">{table.tableNumber}</TableCell>
                <TableCell>{getZoneLabel(table.zone, t, roomNameByCode, true)}</TableCell>
                <TableCell>{table.capacity}</TableCell>
                <TableCell>{t(`category.${table.category}`)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={getStatusBadgeClass(table.status)}>
                    {t(`status.service.${table.status}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {table.isBooked ? <Badge className="bg-blue-500 text-white">{t("tableSettings.reserved")}</Badge> : <span className="text-muted-foreground">{t("common.no")}</span>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getOccupancyBadgeClass(table.occupancyStatus)}>
                    {t(`status.occupancy.${table.occupancyStatus}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t("tableSettings.columns.positionValue", { x: table.posX, y: table.posY })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setQrTable(table)}
                      title={t("tableSettings.qr.openQr")}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDuplicateTable(table)}
                      title={t("tableSettings.duplicateTableAction")}
                      disabled={createTable.isPending}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleServiceStatus(table)} title={t("tableSettings.toggleServiceStatus")}>
                      <Settings2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingTable(table);
                        setDialogOpen(true);
                      }}
                      title={t("tableSettings.editTableAction")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeletingTable(table)} title={t("tableSettings.deleteTableAction")}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {sortedTables.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  {t("tableSettings.noTablesFound")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </DataTable>
      </div>

      <TableDialog
        open={dialogOpen}
        table={editingTable}
        rooms={sortedRooms}
        saving={createTable.isPending || updateTable.isPending}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingTable(undefined);
        }}
        onSubmit={(payload) => (editingTable ? handleUpdate(payload) : handleCreate(payload))}
      />

      <Dialog open={Boolean(qrTable)} onOpenChange={(open) => !open && setQrTable(undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("tableSettings.qr.title", { tableNumber: qrTable?.tableNumber ?? "" })}
            </DialogTitle>
          </DialogHeader>

          {qrTable ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("tableSettings.qr.subtitle")}</p>
              <div className="flex items-center justify-center rounded-lg border bg-white p-3">
                <img src={qrTargetImage} alt={`QR for table ${qrTable.tableNumber}`} className="h-64 w-64 rounded-md" />
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs break-all">{qrTargetLink}</div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      void window.navigator.clipboard.writeText(qrTargetLink);
                    }
                    toast({ title: t("tableSettings.qr.copied") });
                  }}
                >
                  {t("tableSettings.qr.copyLink")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.open(qrTargetLink, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  {t("tableSettings.qr.openLink")}
                </Button>
                <Button
                  onClick={() =>
                    openQrPrintWindow({
                      title: `${t("floorPlan.table", { tableNumber: qrTable.tableNumber })}`,
                      subtitle: t("tableSettings.qr.subtitle"),
                      qrImageUrl: qrTargetImage,
                      qrValue: qrTargetLink,
                    })
                  }
                >
                  <Printer className="mr-1.5 h-4 w-4" />
                  {t("tableSettings.qr.print")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletingTable)} onOpenChange={(open) => !open && setDeletingTable(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tableSettings.removeDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tableSettings.removeDialogDescription", { tableNumber: deletingTable?.tableNumber ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteTable.isPending}
            >
              {deleteTable.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("tableSettings.deleteTable")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deletingRoom)} onOpenChange={(open) => !open && setDeletingRoom(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tableSettings.rooms.removeDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tableSettings.rooms.removeDialogDescription", { room: deletingRoom?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRoom}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteRoomMutation.isPending}
            >
              {deleteRoomMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("tableSettings.rooms.deleteRoom")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
