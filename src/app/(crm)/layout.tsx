import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={{ name: user.name, role: user.role }} />
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
