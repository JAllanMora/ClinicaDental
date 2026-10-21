import { AppNav } from "@/components/app-nav";
import { ROLE_LABELS, requireProfile } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();

  return (
    <div className="min-h-screen lg:flex">
      <AppNav role={profile.role} name={profile.full_name || profile.email || ""} roleLabel={ROLE_LABELS[profile.role]} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
