import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import Sidebar from "@/components/Sidebar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "QuantShield AI — Institutional Risk Engine",
  description: "Monte Carlo portfolio risk simulation with AI analysis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} style={{ height: "100%" }}>
      <body style={{ height: "100%", margin: 0 }}>
        <AuthProvider>
          <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
            <Sidebar />
            <div style={{ flex: 1, minWidth: 0, overflowY: "auto", overflowX: "hidden" }}>
              {children}
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
