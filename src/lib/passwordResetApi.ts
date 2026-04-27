// API helpers for the Forgot Password flow.
// Backend base: https://ngrchatbot.whindia.in

const API_BASE = "https://ngrchatbot.whindia.in";

export interface VerifyUserResponse {
  ok: boolean;
  userId?: string | number;
  message?: string;
  raw?: any;
}

export interface UpdatePasswordResponse {
  ok: boolean;
  message?: string;
  raw?: any;
}

/**
 * Step 1: verify a user exists by username.
 * Backend expects form-urlencoded field `user_name`.
 * On success, returns the user's id (commonly returned as `id` or `user_code`).
 */
export async function verifyUser(userName: string): Promise<VerifyUserResponse> {
  const body = new URLSearchParams();
  body.append("user_name", userName);

  try {
    const res = await fetch(`${API_BASE}/chat/verify_user/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // non-json response
    }

    if (!res.ok) {
      return {
        ok: false,
        message:
          data?.message ||
          data?.detail ||
          (typeof data === "string" ? data : null) ||
          "User not found",
        raw: data,
      };
    }

    const userId =
      data?.user_code ??
      data?.id ??
      data?.user_id ??
      data?.data?.id ??
      data?.data?.user_code;

    if (userId === undefined || userId === null || userId === "") {
      return {
        ok: false,
        message: data?.message || "User not found",
        raw: data,
      };
    }

    return { ok: true, userId, message: data?.message, raw: data };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Network error" };
  }
}

/**
 * Step 2: update the user's password.
 * Backend expects fields: `id`, `new_password`.
 */
export async function updatePassword(
  id: string | number,
  newPassword: string,
): Promise<UpdatePasswordResponse> {
  const body = new URLSearchParams();
  body.append("id", String(id));
  body.append("new_password", newPassword);

  try {
    const res = await fetch(`${API_BASE}/chat/update_password/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok) {
      return {
        ok: false,
        message:
          data?.message ||
          data?.detail ||
          (typeof data === "string" ? data : null) ||
          "Failed to update password",
        raw: data,
      };
    }

    return { ok: true, message: data?.message, raw: data };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Network error" };
  }
}

// Strong password validation rules.
export interface PasswordChecks {
  length: boolean;
  upper: boolean;
  lower: boolean;
  number: boolean;
  special: boolean;
}

export function checkPassword(pw: string): PasswordChecks {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}

export function isPasswordStrong(pw: string): boolean {
  const c = checkPassword(pw);
  return c.length && c.upper && c.lower && c.number && c.special;
}
