import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Agentation } from 'agentation';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AdsAgent - Put your ads on autopilot",
  description: "The intelligent agent that optimizes your ad spend, scales your high-performing campaigns, and saves you hours every week.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {isDevelopment ? <Agentation /> : null}
        {children}
      </body>
    </html>
  );
}
