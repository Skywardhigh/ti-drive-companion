import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TI Drive Companion",
  description:
    "Explore and compare Terra Invicta ship drives by thrust, exhaust velocity, family, and power plant.",
  openGraph: {
    title: "TI Drive Companion",
    description: "Compare Terra Invicta drives by performance, power demand, and installed propulsion-system efficiency.",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "TI Drive Companion engine comparison chart" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TI Drive Companion",
    description: "Compare Terra Invicta drives by performance, power demand, and installed propulsion-system efficiency.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
