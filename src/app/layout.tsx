import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "As de Québec — Remboursements",
  description: "Portail de remboursement de dépenses — As de Québec et Chevaliers de la Seigneurie.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
