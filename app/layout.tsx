import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hora a Hora",
  description: "Aplicação completa para registros mensais e anuais.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
