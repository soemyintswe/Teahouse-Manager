import { useEffect, useMemo, useState, type FormEventHandler } from "react";
import { useLocation } from "wouter";
import { Loader2, LogIn, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";

type LoginMode = "staff" | "guest";

function parseModeFromSearch(search: string): LoginMode | null {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  if (mode === "staff" || mode === "guest") return mode;
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

export default function LoginPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { loginStaff, loginGuest } = useAuth();

  const modeFromSearch = useMemo(() => parseModeFromSearch(window.location.search), []);
  const [mode, setMode] = useState<LoginMode>(modeFromSearch ?? "staff");
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [tableCodeInput, setTableCodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const queryTableId = useMemo(() => parseTableIdFromSearch(window.location.search), []);
  const queryTableCode = useMemo(() => parseTableCodeFromSearch(window.location.search), []);

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

  const onStaffSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void handleStaffLogin();
  };

  const onGuestSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void handleGuestLogin();
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-6 shadow-md">
        <h1 className="text-2xl font-black">{t("auth.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant={mode === "staff" ? "default" : "outline"} onClick={() => setMode("staff")} disabled={loading}>
            <LogIn className="mr-1.5 h-4 w-4" />
            {t("auth.staffLogin")}
          </Button>
          <Button variant={mode === "guest" ? "default" : "outline"} onClick={() => setMode("guest")} disabled={loading}>
            <QrCode className="mr-1.5 h-4 w-4" />
            {t("auth.guestAccess")}
          </Button>
        </div>

        {mode === "staff" ? (
          <form className="mt-4 space-y-3" onSubmit={onStaffSubmit}>
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
            <Button type="submit" disabled={loading || !identifier.trim() || !pin.trim()} className="w-full">
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
        ) : (
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
            <Button type="submit" disabled={loading || !tableCodeInput.trim()} className="w-full">
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
        )}
      </div>
    </div>
  );
}
