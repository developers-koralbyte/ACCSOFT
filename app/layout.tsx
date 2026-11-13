import type { Metadata } from "next";
import "./globals.css";
import Nav from "./nav";
import GuidedDemo from "./guided-demo";

export const metadata: Metadata = {
  title: "DocFlow",
  description: "Client documents to approved Xero bills, built for Malaysian bookkeeping firms",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
        <GuidedDemo />
      </body>
    </html>
  );
}
