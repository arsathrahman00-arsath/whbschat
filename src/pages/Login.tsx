import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FormField } from "@/components/FormField";
import { ResponseBanner } from "@/components/ResponseBanner";
import { ForgotPassword } from "@/components/ForgotPassword";
import { Loader2 } from "lucide-react";
import logo from "@/assets/logo.jpg";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showForgot, setShowForgot] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResponse(null);

    const v: typeof errors = {};
    if (!username.trim()) v.username = "Username is required";
    if (!password) v.password = "Password is required";
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }

    setLoading(true);
    try {
      const loginRes = await fetch("https://ngrchatbot.whindia.in/chat/user_login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password_hash: password }),
      });

      const loginData = await loginRes.json();

      if (!loginRes.ok) {
        setResponse({
          message: loginData.message || loginData.detail || JSON.stringify(loginData),
          type: "error",
        });
        return;
      }

      const session = {
        userId: loginData.id,
        username: loginData.username || username,
      };
      sessionStorage.setItem("whchat_session", JSON.stringify(session));

      // Request notification permission after successful login
      if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
      }

      navigate("/chat");
    } catch (err: any) {
      setResponse({ message: err.message || "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src={logo} alt="WH-Chat Box" className="mx-auto mb-3 h-16 w-16 rounded-2xl object-contain shadow-md" />
          <h1 className="text-2xl font-semibold text-gray-900">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your WH-Chat Box account</p>
        </div>

        {showForgot ? (
          <ForgotPassword onBack={() => setShowForgot(false)} />
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.08)] space-y-5">
            {response && <ResponseBanner message={response.message} type={response.type} />}

            <FormField
              label="Username"
              name="username"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setErrors((p) => ({ ...p, username: undefined })); }}
              error={errors.username}
              required
            />
            <FormField
              label="Password"
              name="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
              error={errors.password}
              required
            />

            <div className="flex justify-end -mt-2">
              <button
                type="button"
                onClick={() => { setShowForgot(true); setResponse(null); }}
                className="text-sm font-medium text-[#1E90FF] hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl font-semibold text-white bg-gradient-to-r from-[#1E90FF] to-[#22C55E] hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
            </button>

            <p className="text-center text-sm text-gray-500">
              Don't have an account?{" "}
              <Link to="/register" className="font-medium text-[#1E90FF] hover:underline">
                Create one
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
