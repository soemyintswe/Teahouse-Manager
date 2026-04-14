import { useEffect, useMemo, useState, type FormEventHandler } from "react";
import { useLocation } from "wouter";
import { Languages, Loader2, LogIn, QrCode, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";

type LoginMode = "staff" | "guest" | "customer";

function parseModeFromSearch(search: string): LoginMode | null {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  if (mode === "staff" || mode === "guest" || mode === "customer") return mode;
  return null;
}

function parseTableIdFromSearch(search: string): number | null {
  const params = new URLSearchParams(search);
  const value = params.get("tableId");
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseTableCodeFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const value = params.get("tableNumber") ?? params.get("tableCode") ?? params.get("table");
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTableCode(input: string): string {
  return input.trim().toUpperCase();
}

function isValidTableCode(input: string): boolean {
  return /^[A-Z0-9-]{2,20}$/.test(input);
}

function getGuestLoginErrorMessage(error: unknown, t: (key: string) => string): string {
  if (!(error instanceof Error)) return t("common.unknownError");
  const message = error.message.toLowerCase();
  if (message.includes("reserved")) return t("auth.tableUnavailableReserved");
  if (message.includes("occupied")) return t("auth.tableUnavailableOccupied");
  if (message.includes("waiting for payment")) return t("auth.tableUnavailablePaymentPending");
  if (message.includes("after payment")) return t("auth.tableUnavailablePaid");
  if (message.includes("waiting for cleaning")) return t("auth.tableUnavailableDirty");
  if (message.includes("maintenance")) return t("auth.tableUnavailableMaintenance");
  if (message.includes("not found")) return t("auth.tableNotFound");
  if (message.includes("unavailable")) return t("auth.tableUnavailableGeneric");
  return error.message;
}

function modeButtonClass(selected: boolean): string {
  return selected
    ? "h-auto min-h-11 whitespace-normal rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 shadow-sm"
    : "h-auto min-h-11 whitespace-normal rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100";
}

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, loginStaff, loginGuest, loginCustomer, changeCustomerPassword, logout, getDefaultPath } = useAuth();

  const modeFromSearch = useMemo(() => parseModeFromSearch(window.location.search), []);
  const [mode, setMode] = useState<LoginMode>(modeFromSearch ?? "staff");
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [tableCodeInput, setTableCodeInput] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPassword, setCustomerPassword] = useState("");
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [pendingOldPassword, setPendingOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryTableId = useMemo(() => parseTableIdFromSearch(window.location.search), []);
  const queryTableCode = useMemo(() => parseTableCodeFromSearch(window.location.search), []);

  const isMyanmar = i18n.resolvedLanguage === "mm";
  const nextLanguageLabel = isMyanmar ? t("language.english") : t("language.myanmar");

  useEffect(() => {
    if (!queryTableId && !queryTableCode) return;
    if (loading) return;
    setLoading(true);
    const payload = queryTableId ? { tableId: queryTableId } : { tableNumber: queryTableCode ?? undefined };
    void loginGuest(payload)
      .then((user) => {
        if (user.tableId) {
          setLocation(`/orders?tableId=${user.tableId}&scan=1`);
        } else {
          setLocation("/orders");
        }
      })
      .catch((error) => {
        toast({
          title: t("auth.loginFailed"),
          description: getGuestLoginErrorMessage(error, t),
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [loading, loginGuest, queryTableCode, queryTableId, setLocation, t, toast]);

  useEffect(() => {
    if (!modeFromSearch) return;
    setMode(modeFromSearch);
  }, [modeFromSearch]);

  useEffect(() => {
    if (!user) return;
    setLocation(getDefaultPath());
  }, [getDefaultPath, setLocation, user]);

  const handleStaffLogin = async () => {
    if (!identifier.trim() || !pin.trim()) return;
    setLoading(true);
    try {
      const user = await loginStaff({ identifier: identifier.trim(), pin: pin.trim() });
      if (user.role === "kitchen") {
        setLocation("/kds?station=kitchen");
      } else if (user.role === "cashier") {
        setLocation("/cashier");
      } else {
        setLocation("/");
      }
      toast({ title: t("auth.loginSuccess") });
    } catch (error) {
      toast({
        title: t("auth.loginFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    const normalizedTableCode = normalizeTableCode(tableCodeInput);
    if (!isValidTableCode(normalizedTableCode)) {
      toast({
        title: t("auth.invalidTableCode"),
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const user = await loginGuest({ tableNumber: normalizedTableCode });
      if (user.tableId) {
        setLocation(`/orders?tableId=${user.tableId}&scan=1`);
      } else {
        setLocation("/orders");
      }
      toast({ title: t("auth.guestConnected") });
    } catch (error) {
      toast({
        title: t("auth.loginFailed"),
        description: getGuestLoginErrorMessage(error, t),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerLogin = async () => {
    const phone = customerPhone.trim();
    const password = customerPassword.trim();
    if (!phone || !password) return;

    setLoading(true);
    try {
      await loginCustomer({ phone, password });
      toast({ title: t("auth.loginSuccess") });
      setLocation("/");
    } catch (error) {
      toast({
        title: t("auth.loginFailed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerPasswordChange = async () => {
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();
    if (!trimmedNew || trimmedNew.length < 6) {
      toast({
        title: t("auth.passwordChange.invalidTitle"),
        description: t("auth.passwordChange.invalidDesc"),
        variant: "destructive",
      });
      return;
    }
    if (trimmedNew !== trimmedConfirm) {
      toast({
        title: t("auth.passwordChange.mismatchTitle"),
        description: t("auth.passwordChange.mismatchDesc"),
        variant: "destructive",
      });
      return;
    }

    setChangingPassword(true);
    try {
      await changeCustomerPassword({
        oldPassword: pendingOldPassword,
        newPassword: trimmedNew,
      });
      setPasswordChangeOpen(false);
      setPendingOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: t("auth.passwordChange.success") });
      setLocation("/");
    } catch (error) {
      toast({
        title: t("auth.passwordChange.failed"),
        description: error instanceof Error ? error.message : t("common.unknownError"),
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const onStaffSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void handleStaffLogin();
  };

  const onGuestSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void handleGuestLogin();
  };

  const onCustomerSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void handleCustomerLogin();
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ecfdf5_0%,#f8fafc_42%,#ffffff_100%)]">
      <section className="border-b border-emerald-100 bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white">
        <div className="mx-auto max-w-5xl px-4 py-7 md:px-8 md:py-10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black md:text-4xl">{t("auth.title")}</h1>
              <p className="mt-1 max-w-2xl text-sm text-emerald-50 md:text-base">{t("auth.subtitle")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10"
              onClick={() => void i18n.changeLanguage(isMyanmar ? "en" : "mm")}
              title={t("language.switchTo", { language: nextLanguageLabel })}
            >
              <Languages className="mr-1.5 h-4 w-4" />
              {isMyanmar ? "MM" : "EN"}
            </Button>
          </div>
        </div>
      </section>

      <div className="px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm md:p-6">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className={modeButtonClass(mode === "staff")} onClick={() => setMode("staff")} disabled={loading}>
              <span className="inline-flex items-center justify-center gap-1.5">
                <LogIn className="h-4 w-4 shrink-0" />
                {t("auth.staffLogin")}
              </span>
            </button>
            <button type="button" className={modeButtonClass(mode === "guest")} onClick={() => setMode("guest")} disabled={loading}>
              <span className="inline-flex items-center justify-center gap-1.5">
                <QrCode className="h-4 w-4 shrink-0" />
                {t("public.guestButton")}
              </span>
            </button>
            <button type="button" className={modeButtonClass(mode === "customer")} onClick={() => setMode("customer")} disabled={loading}>
              <span className="inline-flex items-center justify-center gap-1.5">
                <UserRound className="h-4 w-4 shrink-0" />
                {t("public.customerLogin")}
              </span>
            </button>
          </div>

          {mode === "staff" ? (
            <form className="mt-4 space-y-3" onSubmit={onStaffSubmit}>
              <p className="text-sm text-muted-foreground">{t("auth.staffHint")}</p>
              <div className="space-y-1">
                <Label>{t("auth.identifier")}</Label>
                <Input
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={t("auth.identifierPlaceholder")}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("auth.pin")}</Label>
                <Input
                  type="password"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  placeholder="••••"
                />
              </div>
              <Button type="submit" disabled={loading || !identifier.trim() || !pin.trim()} className="w-full bg-emerald-700 text-white hover:bg-emerald-800">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("auth.loginButton")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setLocation("/")}>
                  {t("auth.cancelToHome")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setLocation("/?register=1")}>
                  {t("public.register.button")}
                </Button>
              </div>
            </form>
          ) : mode === "guest" ? (
            <form className="mt-4 space-y-3" onSubmit={onGuestSubmit}>
              <p className="text-sm text-muted-foreground">{t("auth.guestHint")}</p>
              <div className="space-y-1">
                <Label>{t("auth.tableCode")}</Label>
                <Input
                  type="text"
                  value={tableCodeInput}
                  onChange={(event) => setTableCodeInput(normalizeTableCode(event.target.value))}
                  placeholder="H1 / A2"
                  autoCapitalize="characters"
                />
              </div>
              <Button type="submit" disabled={loading || !tableCodeInput.trim()} className="w-full bg-emerald-700 text-white hover:bg-emerald-800">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("auth.guestConnectButton")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setLocation("/")}>
                  {t("auth.cancelToHome")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setLocation("/?register=1")}>
                  {t("public.register.button")}
                </Button>
              </div>
            </form>
          ) : (
            <form className="mt-4 space-y-3" onSubmit={onCustomerSubmit}>
              <p className="text-sm text-muted-foreground">{t("auth.customerHint")}</p>
              <div className="space-y-1">
                <Label>{t("auth.customerPhone")}</Label>
                <Input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="09xxxxxxxxx"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("auth.customerPassword")}</Label>
                <Input
                  type="password"
                  value={customerPassword}
                  onChange={(event) => setCustomerPassword(event.target.value)}
                  placeholder="••••••"
                />
              </div>
              <Button type="submit" disabled={loading || !customerPhone.trim() || !customerPassword.trim()} className="w-full bg-emerald-700 text-white hover:bg-emerald-800">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("auth.loginButton")}
              </Button>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button type="button" variant="outline" onClick={() => setLocation("/")}>
                  {t("auth.cancelToHome")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setLocation("/?register=1")}>
                  {t("public.register.button")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setMode("staff")}>
                  {t("auth.staffLogin")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      <Dialog
        open={passwordChangeOpen}
        onOpenChange={(open) => {
          if (!open) {
            logout();
            setPasswordChangeOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("auth.passwordChange.title")}</DialogTitle>
            <DialogDescription>{t("auth.passwordChange.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("auth.passwordChange.newPassword")}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="******"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("auth.passwordChange.confirmPassword")}</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="******"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                logout();
                setPasswordChangeOpen(false);
              }}
              disabled={changingPassword}
            >
              {t("auth.logout")}
            </Button>
            <Button onClick={() => void handleCustomerPasswordChange()} disabled={changingPassword}>
              {changingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("auth.passwordChange.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
