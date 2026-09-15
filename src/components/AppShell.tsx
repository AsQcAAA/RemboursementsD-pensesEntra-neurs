"use client";

import { usePathname } from "next/navigation";
import Nav from "./Nav";

const NO_SIDEBAR_ROUTES = ["/login", "/definir-mot-de-passe"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hasSidebar = !NO_SIDEBAR_ROUTES.includes(pathname);

  return (
    <>
      <Nav />
      <main className={hasSidebar ? "md:pl-56 min-h-screen" : "min-h-screen"}>
        <div className={hasSidebar ? "max-w-6xl mx-auto px-4 py-6 pb-24" : ""}>{children}</div>
      </main>
    </>
  );
}
