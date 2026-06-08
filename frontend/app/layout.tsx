import "./globals.css";
import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "AI Content Studio",
  description: "Local AI content creation — script to video, fully offline.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex">
          <Sidebar />
          <main className="flex-1 p-6 md:p-10 max-w-[1400px] mx-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
