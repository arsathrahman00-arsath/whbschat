import { useState } from "react";
import { Loader2, ArrowLeft, Eye, EyeOff, Check, X } from "lucide-react";
import { FormField } from "@/components/FormField";
import { ResponseBanner } from "@/components/ResponseBanner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  verifyUser,
  updatePassword,
  checkPassword,
  isPasswordStrong,
} from "@/lib/passwordResetApi";

interface ForgotPasswordProps {
  onBack: () => void;
}

type Step = "verify" | "reset";

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={cn("flex items-center gap-1.5 text-xs", ok ? "text-green-600" : "text-gray-500")}>
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      <span>{label}</span>
    </li>
  );
}

export function ForgotPassword({ onBack }: ForgotPasswordProps) {
  const [step, setStep] = useState<Step>("verify");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Step 1
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | undefined>();
  const [verifiedUserId, setVerifiedUserId] = useState<string | number | null>(null);

  // Step 2
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const checks = checkPassword(newPassword);
  const strong = isPasswordStrong(newPassword);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmitReset = strong && matches && !loading;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setResponse(null);

    if (!username.trim()) {
      setUsernameError("Username is required");
      return;
    }

    setLoading(true);
    const result = await verifyUser(username.trim());
    setLoading(false);

    if (!result.ok || result.userId === undefined) {
      setResponse({ message: result.message || "User not found", type: "error" });
      return;
    }

    setVerifiedUserId(result.userId);
    setStep("reset");
    setResponse(null);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResponse(null);

    if (verifiedUserId === null) {
      setResponse({ message: "Session expired. Please verify again.", type: "error" });
      setStep("verify");
      return;
    }
    if (!strong) {
      setResponse({ message: "Password does not meet strength requirements", type: "error" });
      return;
    }
    if (!matches) {
      setResponse({ message: "Passwords do not match", type: "error" });
      return;
    }

    setLoading(true);
    const result = await updatePassword(verifiedUserId, newPassword);
    setLoading(false);

    if (!result.ok) {
      setResponse({ message: result.message || "Failed to update password", type: "error" });
      return;
    }

    toast({
      title: "Password updated",
      description: "You can now sign in with your new password.",
    });
    onBack();
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.08)] space-y-5">
      <button
        type="button"
        onClick={() => {
          if (step === "reset") {
            setStep("verify");
            setResponse(null);
          } else {
            onBack();
          }
        }}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {step === "reset" ? "Back" : "Back to login"}
      </button>

      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          {step === "verify" ? "Reset your password" : "Set a new password"}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {step === "verify"
            ? "Enter your username to begin."
            : "Choose a strong password for your account."}
        </p>
      </div>

      {response && <ResponseBanner message={response.message} type={response.type} />}

      {step === "verify" ? (
        <form onSubmit={handleVerify} className="space-y-5">
          <FormField
            label="Username"
            name="reset-username"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameError(undefined);
            }}
            error={usernameError}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl font-semibold text-white bg-gradient-to-r from-[#1E90FF] to-[#22C55E] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify user"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-sm font-medium text-foreground">
              New password<span className="text-destructive ml-0.5">*</span>
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? "text" : "password"}
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-surface pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-800"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
              <Rule ok={checks.length} label="At least 8 characters" />
              <Rule ok={checks.upper} label="One uppercase letter" />
              <Rule ok={checks.lower} label="One lowercase letter" />
              <Rule ok={checks.number} label="One number" />
              <Rule ok={checks.special} label="One special character" />
            </ul>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
              Confirm password<span className="text-destructive ml-0.5">*</span>
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={cn(
                  "bg-surface pr-10",
                  confirmPassword.length > 0 && !matches && "border-destructive focus-visible:ring-destructive",
                )}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-800"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && !matches && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmitReset}
            className="w-full h-11 rounded-xl font-semibold text-white bg-gradient-to-r from-[#1E90FF] to-[#22C55E] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}
