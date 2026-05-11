import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/FormField";
import { PasswordField } from "@/components/PasswordField";
import { AvatarUpload } from "@/components/AvatarUpload";
import { ResponseBanner } from "@/components/ResponseBanner";
import { getDeviceToken } from "@/lib/firebase";
import { getDeviceMetadata } from "@/lib/device";
import { Loader2 } from "lucide-react";
import logo from "@/assets/logo.jpg";

interface FormData {
  email: string;
  password: string;
  username: string;
  display_name: string;
  bio: string;
  company: string;
  department: string;
  designation: string;
  phone: string;
}

const initial: FormData = {
  email: "",
  password: "",
  username: "",
  display_name: "",
  bio: "",
  company: "",
  department: "",
  designation: "",
  phone: "",
};

type Errors = Partial<Record<keyof FormData | "profile_photo", string>>;

function validate(data: FormData): Errors {
  const e: Errors = {};
  if (!data.email.trim()) e.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = "Invalid email";
  if (!data.password) e.password = "Password is required";
  else if (data.password.length < 6) e.password = "Min 6 characters";
  if (!data.username.trim()) e.username = "Username is required";
  if (!data.display_name.trim()) e.display_name = "Display name is required";
  if (data.phone && !/^\+?[\d\s-]{7,15}$/.test(data.phone)) e.phone = "Invalid phone number";
  if (data.email.length > 255) e.email = "Email too long";
  if (data.username.length > 100) e.username = "Username too long";
  return e;
}

export default function Register() {
  const [form, setForm] = useState<FormData>(initial);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setErrors((p) => ({ ...p, [e.target.name]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResponse(null);

    const v = validate(form);
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }

    setLoading(true);
    try {
      const device_token = await getDeviceToken();
      const device = getDeviceMetadata();

      const formData = new FormData();
      Object.entries(form).forEach(([k, val]) => formData.append(k, val));
      if (profilePhoto) formData.append("profile_photo", profilePhoto);
      formData.append("device_token", device_token);
      formData.append("device_type", device.device_type);
      formData.append("os_version", device.os_version);
      formData.append("app_version", device.app_version);

      const res = await fetch("https://ngrchatbot.whindia.in/chat/create_cb_user/", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setResponse({
        message: data.message || data.detail || JSON.stringify(data),
        type: res.ok ? "success" : "error",
      });
    } catch (err: any) {
      setResponse({ message: err.message || "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <img src={logo} alt="WH-Chat Box" className="mx-auto mb-3 h-16 w-16 rounded-lg object-contain" />
          <h1 className="text-2xl font-semibold text-foreground">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Join Chats and start collaborating</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6 shadow-sm space-y-6">
          {response && <ResponseBanner message={response.message} type={response.type} />}

          <AvatarUpload onFileSelect={setProfilePhoto} error={errors.profile_photo} />

          {/* Account Info */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-foreground mb-2">Account Information</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Email" name="email" type="email" placeholder="you@company.com" value={form.email} onChange={onChange} error={errors.email} required />
              <FormField label="Username" name="username" placeholder="johndoe" value={form.username} onChange={onChange} error={errors.username} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <PasswordField label="Password" name="password" placeholder="Min 6 characters" value={form.password} onChange={onChange} error={errors.password} required autoComplete="new-password" />
              <FormField label="Display Name" name="display_name" placeholder="John Doe" value={form.display_name} onChange={onChange} error={errors.display_name} required />
            </div>
          </fieldset>

          {/* Professional Details */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-foreground mb-2">Professional Details</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Company" name="company" placeholder="Acme Inc." value={form.company} onChange={onChange} />
              <FormField label="Department" name="department" placeholder="Engineering" value={form.department} onChange={onChange} />
              <FormField label="Designation" name="designation" placeholder="Software Engineer" value={form.designation} onChange={onChange} />
            </div>
            <FormField label="Phone" name="phone" type="tel" placeholder="+1 234 567 8900" value={form.phone} onChange={onChange} error={errors.phone} />
          </fieldset>

          {/* Profile */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-foreground mb-2">Profile</legend>
            <FormField label="Bio" name="bio" placeholder="Tell us about yourself..." value={form.bio} onChange={onChange} multiline />
          </fieldset>

          <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
