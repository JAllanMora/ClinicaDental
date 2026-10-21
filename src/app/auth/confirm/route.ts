import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Destino de los enlaces de correo (invitación, recuperación de contraseña).
// En Supabase → Auth → Email Templates usa:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite      (Invite user)
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery    (Reset password)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const dest = type === "invite" || type === "recovery" ? "/actualizar-contrasena" : "/";
      return NextResponse.redirect(new URL(dest, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=enlace", origin));
}
