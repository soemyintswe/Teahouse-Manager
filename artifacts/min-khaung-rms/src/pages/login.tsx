import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, LogIn, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";

type LoginMode = "staff" | "guest";

function parseTableIdFromSearch(search: string): number | null {
  const params = new URLSearchParams(search);
  const value = params.get("tableId");
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function LoginPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { loginStaff, loginGuest } = useAuth();

  const [mode, setMode] = useState<LoginMode>("staff");
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [tableIdInput, setTableIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const queryTableId = useMemo(() => parseTableIdFromSearch(window.location.search), []);

  useEffect(() => {
    if (!queryTableId) return;
    if (loading) return;
    setLoading(true);
    void loginGuest({ tableId: queryTableId })
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
          description: error instanceof Error ? error.message : t("common.unknownError"),
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [loading, loginGuest, queryTableId, setLocation, t, toast]);

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
    const parsedTableId = Number.parseInt(tableIdInput, 10);
    if (!Number.isFinite(parsedTableId) || parsedTableId <= 0) {
      toast({
        title: t("auth.invalidTable"),
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const user = await loginGuest({ tableId: parsedTableId });
      setLocation(`/orders?tableId=${user.tableId ?? parsedTableId}&scan=1`);
      toast({ title: t("auth.guestConnected") });
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
          <div className="mt-4 space-y-3">
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
            <Button onClick={() => void handleStaffLogin()} disabled={loading || !identifier.trim() || !pin.trim()} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("auth.loginButton")}
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t("auth.guestHint")}</p>
            <div className="space-y-1">
              <Label>{t("auth.tableId")}</Label>
              <Input
                type="number"
                min={1}
                value={tableIdInput}
                onChange={(event) => setTableIdInput(event.target.value)}
                placeholder="1"
              />
            </div>
            <Button onClick={() => void handleGuestLogin()} disabled={loading || !tableIdInput.trim()} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("auth.guestConnectButton")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
