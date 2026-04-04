import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_URL } from "@/lib/seo";
import { PostHogProvider } from "@/components/posthog-provider";
import { GadsConversionTracker } from "@/components/gads-conversion-tracker";
import { getSession } from "@/lib/session";

const GADS_CONVERSION_ID = "AW-18054900065";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | AI Google Ads Agent & MCP Server`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} | AI Google Ads Agent & MCP Server`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/logo.svg",
        alt: `${SITE_NAME} logo`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | AI Google Ads Agent & MCP Server`,
    description: SITE_DESCRIPTION,
    images: ["/logo.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "marketing",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const bootstrapUser = session.connected && session.userId
    ? {
        distinctId: session.userId,
        properties: {
          email: session.googleEmail,
          google_ads_customer_id: session.customerId,
          google_ads_customer_name: session.customerName,
        },
      }
    : null;

  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}
      >
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GADS_CONVERSION_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GADS_CONVERSION_ID}');
          `}
        </Script>
        <PostHogProvider bootstrapUser={bootstrapUser}>
          <GadsConversionTracker />
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
