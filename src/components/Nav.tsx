"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Crest from "./Crest";
import { createClient } from "@/lib/supabase/client";
import { useStaff } from "@/lib/useStaff";

const TABS = [
  { href: "/", label: "Calendrier" },
  { href: "/rapports", label: "Rapports" },
];
const RECAP_TAB = { href: "/recapitulatif", label: "Récapitulatif" };
const DIRECTION_TAB = { href: "/direction", label: "Direction" };

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { me, isDirection, estSuperviseur } = useStaff();

  if (pathname === "/login") return null;

  const tabs = [...TABS];
  if (isDirection || estSuperviseur) tabs.push(RECAP_TAB);
  if (isDirection) tabs.push(DIRECTION_TAB);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-black text-white border-b border-gold-900/40 flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Crest className="h-8 w-8" />
          <span className="font-bold tracking-tight leading-tight text-sm">
            As de Québec
            <span className="block text-[10px] font-normal text-gold-400">Remboursements</span>
          </span>
        </Link>
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="px-3 py-1.5 rounded-md text-gold-400 hover:bg-ink-700 transition-colors"
          aria-label="Menu"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>
      <div className="md:hidden h-14" />

      {mobileOpen && <div className="md:hidden fixed inset-0 z-20 bg-black/60" onClick={() => setMobileOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-20 w-56 shrink-0 bg-black text-white border-r border-gold-900/40 flex flex-col overflow-y-auto transition-transform md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link href="/" className="flex items-center gap-2 px-4 py-4 shrink-0 border-b border-white/10">
          <Crest className="h-9 w-9" />
          <span className="font-bold tracking-tight leading-tight">
            As de Québec
            <span className="block text-xs font-normal text-gold-400">Remboursements</span>
          </span>
        </Link>

        <nav className="flex-1 py-2">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`block px-4 py-2.5 text-sm transition-colors ${
                pathname === tab.href ? "bg-gold-500 text-ink-900 font-semibold" : "text-slate-300 hover:bg-ink-700"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-white/10 text-xs">
          <div className="font-semibold truncate">{me?.full_name ?? "—"}</div>
          <div className="text-slate-400 uppercase tracking-wide text-[10px] mt-0.5">
            {isDirection ? "Direction" : estSuperviseur ? "Superviseur" : "Entraîneur-chef"}
          </div>
          <button onClick={signOut} className="mt-2 w-full btn-secondary text-xs py-1.5">
            Sortir
          </button>
        </div>
      </aside>
      <div className="md:hidden h-14" />
    </>
  );
}
