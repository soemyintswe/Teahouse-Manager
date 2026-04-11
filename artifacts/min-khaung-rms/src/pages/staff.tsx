import { useEffect, useMemo, useState } from "react";
import {
  useListStaff,
  useCreateStaffMember,
  useUpdateStaffMember,
  useDeleteStaffMember,
  getListStaffQueryKey,
} from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import type { StaffMember, CreateStaffMemberBody, UpdateStaffMemberBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Shield, Trash2, UserCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const STAFF_ROLE_OPTIONS = [
  "waiter",
  "kitchen",
  "cashier",
  "cleaner",
  "room_supervisor",
  "supervisor",
  "manager",
  "owner",
] as const;

type StaffRole = (typeof STAFF_ROLE_OPTIONS)[number];

type CustomerStatus = "pending" | "approved" | "denied" | "terminated";

type CustomerAccount = {
  id: number;
  fullName: string;
  email?: string | null;
  status: CustomerStatus;
  mustChangePassword: boolean;
  createdAt: string;
  phones: string[];
  address: {
    unitNo: string | null;
    street: string | null;
    ward: string | null;
    township: string | null;
    region: string | null;
    mapLink: string | null;
  } | null;
  totalDeliveryOrders: number;
  latestDeliveryStatus: string | null;
};

type CustomerStatusAction = "approve" | "deny" | "terminate";

type CredentialNotification = {
  emailSent: boolean;
  smsSentCount: number;
  warnings: string[];
};

type CustomerStatusResponse = {
  id: number;
  status: CustomerStatus;
  fullName: string;
  temporaryPassword?: string;
  notifications?: CredentialNotification;
};

type CustomerResetPasswordResponse = {
  temporaryPassword: string;
  fullName: string;
  notifications?: CredentialNotification;
};

type StaffFormState = {
  name: string;
  role: StaffRole;
  phone: string;
  email: string;
  pin: string;
  active: boolean;
};

function getInitialForm(member?: StaffMember): StaffFormState {
  const normalizedRole = member?.role?.trim().toLowerCase();
  const role: StaffRole =
    normalizedRole && STAFF_ROLE_OPTIONS.includes(normalizedRole as StaffRole)
      ? (normalizedRole as StaffRole)
      : "waiter";
  return {
    name: member?.name ?? "",
    role,
    phone: member?.phone ?? "",
    email: member?.email ?? "",
    pin: member?.pin ?? "",
    active: member ? member.active !== "false" && member.active !== "0" : true,
  };
}

function getRoleBadgeClass(role: string): string {
  if (role === "owner") return "bg-purple-100 text-purple-700 border-purple-300";
  if (role === "manager") return "bg-blue-100 text-blue-700 border-blue-300";
  if (role === "room_supervisor") return "bg-cyan-100 text-cyan-700 border-cyan-300";
  if (role === "supervisor") return "bg-indigo-100 text-indigo-700 border-indigo-300";
  if (role === "cashier") return "bg-amber-100 text-amber-700 border-amber-300";
  if (role === "cleaner") return "bg-sky-100 text-sky-700 border-sky-300";
  if (role === "kitchen") return "bg-emerald-100 text-emerald-700 border-emerald-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function getCustomerStatusBadgeClass(status: CustomerStatus): string {
  if (status === "approved") return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (status === "pending") return "bg-amber-100 text-amber-700 border-amber-300";
  if (status === "denied") return "bg-rose-100 text-rose-700 border-rose-300";
  return "bg-slate-200 text-slate-700 border-slate-400";
}

function formatAddress(address: CustomerAccount["address"]): string {
  if (!address) return "-";
  const values = [address.unitNo, address.street, address.ward, address.township, address.region].filter(Boolean);
  return values.length > 0 ? values.join(", ") : "-";
}

function StaffDialog({
  open,
  member,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  member?: StaffMember;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateStaffMemberBody | UpdateStaffMemberBody) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<StaffFormState>(() => getInitialForm(member));

  useEffect(() => {
    if (!open) return;
    setForm(getInitialForm(member));
  }, [member, open]);

  const valid = form.name.trim().length > 0 && form.pin.trim().length > 0;

  const submit = () => {
    const payload = {
      name: form.name.trim(),
      role: form.role,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      pin: form.pin.trim(),
      active: form.active ? "true" : "false",
    };
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{member ? t("staff.editUser", { name: member.name }) : t("staff.addUser")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("staff.name")}</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t("staff.namePlaceholder")}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("staff.role")}</Label>
              <Select value={form.role} onValueChange={(value) => setForm((prev) => ({ ...prev, role: value as StaffRole }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {t(`staff.roles.${role}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("staff.pin")}</Label>
              <Input
                value={form.pin}
                onChange={(event) => setForm((prev) => ({ ...prev, pin: event.target.value }))}
                placeholder="1234"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("staff.phone")}</Label>
              <Input
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="09xxxxxxxxx"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("staff.email")}</Label>
              <Input
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="user@shop.com"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md border px-3 py-2">
            <Switch
              checked={form.active}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, active: checked }))}
            />
            <div>
              <p className="text-sm font-medium">{t("staff.active")}</p>
              <p className="text-xs text-muted-foreground">{t("staff.activeHint")}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!valid || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {member ? t("common.saveChanges") : t("staff.addUser")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StaffPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: staff = [], isLoading } = useListStaff({ query: { queryKey: getListStaffQueryKey() } });
  const createStaff = useCreateStaffMember();
  const updateStaff = useUpdateStaffMember();
  const deleteStaff = useDeleteStaffMember();

  const [dialog, setDialog] = useState<{ open: boolean; member?: StaffMember }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [customers, setCustomers] = useState<CustomerAccount[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerActionLoadingId, setCustomerActionLoadingId] = useState<number | null>(null);
  const [customerStatusFilter, setCustomerStatusFilter] = useState<"all" | CustomerStatus>("all");
  const [regionFilter, setRegionFilter] = useState("");
  const [townshipFilter, setTownshipFilter] = useState("");
  const [streetFilter, setStreetFilter] = useState("");

  const formatNotificationSummary = (notifications?: CredentialNotification): string => {
    if (!notifications) return "";
    const parts = [
      notifications.emailSent ? t("staff.customers.notify.emailSent") : t("staff.customers.notify.emailNotSent"),
      t("staff.customers.notify.smsCount", { count: notifications.smsSentCount }),
    ];
    if (notifications.warnings.length > 0) {
      parts.push(`${t("staff.customers.notify.warnings")}: ${notifications.warnings.join(" | ")}`);
    }
    return parts.join(" · ");
  };

  const sortedStaff = useMemo(
    () => [...staff].sort((a, b) => a.name.localeCompare(b.name)),
    [staff],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
  };

  const loadCustomers = async () => {
    setCustomersLoading(true);
    try {
      const params = new URLSearchParams();
      if (customerStatusFilter !== "all") params.set("status", customerStatusFilter);
      if (regionFilter.trim()) params.set("region", regionFilter.trim());
      if (townshipFilter.trim()) params.set("township", townshipFilter.trim());
      if (streetFilter.trim()) params.set("street", streetFilter.trim());
      const query = params.toString();
      const response = await customFetch<CustomerAccount[]>(`/api/customers${query ? `?${query}` : ""}`, {
        method: "GET",
        responseType: "json",
      });
      setCustomers(response);
    } catch (error) {
      toast({
        title: t("staff.customers.loadFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setCustomersLoading(false);
    }
  };

  const handleSave = async (payload: CreateStaffMemberBody | UpdateStaffMemberBody) => {
    try {
      if (dialog.member) {
        await updateStaff.mutateAsync({ id: dialog.member.id, data: payload as UpdateStaffMemberBody });
        toast({ title: t("staff.updated", { name: dialog.member.name }) });
      } else {
        await createStaff.mutateAsync({ data: payload as CreateStaffMemberBody });
        toast({ title: t("staff.created") });
      }
      setDialog({ open: false });
      refresh();
    } catch (error) {
      toast({
        title: t("staff.saveFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteStaff.mutateAsync({ id: deleteTarget.id });
      toast({ title: t("staff.deleted", { name: deleteTarget.name }) });
      setDeleteTarget(null);
      refresh();
    } catch (error) {
      toast({
        title: t("staff.deleteFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    }
  };

  const updateCustomerStatus = async (id: number, action: CustomerStatusAction) => {
    setCustomerActionLoadingId(id);
    try {
      const response = await customFetch<CustomerStatusResponse>(`/api/customers/${id}/status`, {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify({ action }),
      });
      const details: string[] = [];
      if (response.temporaryPassword) {
        details.push(t("staff.customers.tempPassword", { password: response.temporaryPassword }));
      }
      const notifySummary = formatNotificationSummary(response.notifications);
      if (notifySummary) {
        details.push(notifySummary);
      }
      toast({
        title: t("staff.customers.statusUpdated"),
        description: details.length > 0 ? details.join("\n") : undefined,
      });
      await loadCustomers();
    } catch (error) {
      toast({
        title: t("staff.customers.actionFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setCustomerActionLoadingId(null);
    }
  };

  const resetCustomerPassword = async (id: number) => {
    setCustomerActionLoadingId(id);
    try {
      const response = await customFetch<CustomerResetPasswordResponse>(`/api/customers/${id}/reset-password`, {
        method: "POST",
        responseType: "json",
      });
      const notifySummary = formatNotificationSummary(response.notifications);
      toast({
        title: t("staff.customers.resetDone", { name: response.fullName }),
        description: [t("staff.customers.tempPassword", { password: response.temporaryPassword }), notifySummary]
          .filter(Boolean)
          .join("\n"),
      });
      await loadCustomers();
    } catch (error) {
      toast({
        title: t("staff.customers.resetFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setCustomerActionLoadingId(null);
    }
  };

  useEffect(() => {
    void loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerStatusFilter, regionFilter, townshipFilter, streetFilter]);

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
          <h1 className="page-title">{t("staff.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("staff.subtitle")}</p>
        </div>
        <Button onClick={() => setDialog({ open: true })} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("staff.addUser")}
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.id")}</TableHead>
              <TableHead>{t("staff.name")}</TableHead>
              <TableHead>{t("staff.role")}</TableHead>
              <TableHead>{t("staff.contact")}</TableHead>
              <TableHead>{t("staff.status")}</TableHead>
              <TableHead className="text-right">{t("tableSettings.columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStaff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t("staff.empty")}
                </TableCell>
              </TableRow>
            ) : (
              sortedStaff.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>#{member.id}</TableCell>
                  <TableCell>
                    <div className="font-semibold">{member.name}</div>
                    <div className="text-xs text-muted-foreground">PIN: {member.pin ?? "-"}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getRoleBadgeClass(member.role)}>
                      <Shield className="mr-1 h-3.5 w-3.5" />
                      {t(`staff.roles.${member.role}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div>{member.phone || "-"}</div>
                    <div>{member.email || "-"}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.active !== "false" && member.active !== "0" ? "secondary" : "outline"}>
                      {member.active !== "false" && member.active !== "0" ? t("staff.active") : t("staff.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setDialog({ open: true, member })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(member)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <UserCog className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">{t("staff.rolesTitle")}</h2>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-3">
          {STAFF_ROLE_OPTIONS.map((role) => (
            <div key={role} className="rounded-md border bg-muted/20 px-3 py-2">
              <p className="font-semibold text-foreground">{t(`staff.roles.${role}`)}</p>
              <p>{t(`staff.roleDesc.${role}`)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">{t("staff.customers.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("staff.customers.subtitle")}</p>
          </div>
          <Button variant="outline" onClick={() => void loadCustomers()}>
            {t("common.retry")}
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <Select value={customerStatusFilter} onValueChange={(value) => setCustomerStatusFilter(value as "all" | CustomerStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("staff.customers.filters.allStatus")}</SelectItem>
              <SelectItem value="pending">{t("staff.customers.status.pending")}</SelectItem>
              <SelectItem value="approved">{t("staff.customers.status.approved")}</SelectItem>
              <SelectItem value="denied">{t("staff.customers.status.denied")}</SelectItem>
              <SelectItem value="terminated">{t("staff.customers.status.terminated")}</SelectItem>
            </SelectContent>
          </Select>
          <Input value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} placeholder={t("staff.customers.filters.region")} />
          <Input value={townshipFilter} onChange={(event) => setTownshipFilter(event.target.value)} placeholder={t("staff.customers.filters.township")} />
          <Input value={streetFilter} onChange={(event) => setStreetFilter(event.target.value)} placeholder={t("staff.customers.filters.street")} />
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.id")}</TableHead>
                <TableHead>{t("staff.customers.name")}</TableHead>
                <TableHead>{t("staff.customers.phones")}</TableHead>
                <TableHead>{t("staff.customers.address")}</TableHead>
                <TableHead>{t("staff.customers.orders")}</TableHead>
                <TableHead>{t("staff.customers.statusLabel")}</TableHead>
                <TableHead className="text-right">{t("tableSettings.columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customersLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24">
                    <div className="flex items-center justify-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {t("staff.customers.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>#{customer.id}</TableCell>
                    <TableCell>
                      <div className="font-semibold">{customer.fullName}</div>
                      {customer.email ? (
                        <a href={`mailto:${customer.email}`} className="text-xs text-primary hover:underline">
                          {customer.email}
                        </a>
                      ) : null}
                      <div className="text-xs text-muted-foreground">
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {customer.phones.length > 0 ? customer.phones.map((phone) => (
                          <a
                            key={`${customer.id}-${phone}`}
                            href={`tel:${phone}`}
                            className="rounded border px-2 py-0.5 hover:bg-muted/40"
                          >
                            {phone}
                          </a>
                        )) : "-"}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                      {formatAddress(customer.address)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{t("staff.customers.totalOrders", { count: customer.totalDeliveryOrders })}</div>
                      <div className="text-muted-foreground">
                        {t("staff.customers.latestStatus", { status: customer.latestDeliveryStatus ?? "-" })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getCustomerStatusBadgeClass(customer.status)}>
                        {t(`staff.customers.status.${customer.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={customerActionLoadingId === customer.id}
                          onClick={() => void updateCustomerStatus(customer.id, "approve")}
                        >
                          {t("staff.customers.actions.approve")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={customerActionLoadingId === customer.id}
                          onClick={() => void updateCustomerStatus(customer.id, "deny")}
                        >
                          {t("staff.customers.actions.deny")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={customerActionLoadingId === customer.id}
                          onClick={() => void updateCustomerStatus(customer.id, "terminate")}
                        >
                          {t("staff.customers.actions.terminate")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={customerActionLoadingId === customer.id}
                          onClick={() => void resetCustomerPassword(customer.id)}
                        >
                          {t("staff.customers.actions.resetPassword")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <StaffDialog
        open={dialog.open}
        member={dialog.member}
        saving={createStaff.isPending || updateStaff.isPending}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open, member: open ? prev.member : undefined }))}
        onSubmit={handleSave}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("staff.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("staff.deleteDesc", { name: deleteTarget?.name ?? "" })}
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
