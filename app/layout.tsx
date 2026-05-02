import type { Metadata } from "next";
import Script from "next/script";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { AppToaster } from "@/components/app-toaster";
import "./sonner.css";
import "./globals.css";

import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_URL } from "@/lib/seo";
import { UTM_KEYS, UTM_STORAGE_PREFIX } from "@/lib/utm";
import { PostHogProvider } from "@/components/posthog-provider";
import { GadsConversionTracker } from "@/components/gads-conversion-tracker";
import { getSession } from "@/lib/session";

const GADS_CONVERSION_ID = "AW-18054900065";
const REDDIT_PIXEL_ID = process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID;

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.svg",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} | AI Google Ads Agent & MCP Server`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/notfiar_logo/notfair-mark-dark.svg",
        alt: `${SITE_NAME} logo`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | AI Google Ads Agent & MCP Server`,
    description: SITE_DESCRIPTION,
    images: ["/notfiar_logo/notfair-mark-dark.svg"],
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
    <html lang="en" suppressHydrationWarning className="h-full" style={{ colorScheme: "dark" }}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap"
        />
      </head>
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} antialiased h-full bg-[#1A1917]`}
      >
        <Script id="utm-persist" strategy="beforeInteractive">
          {`(function(){try{var u=new URLSearchParams(location.search),k=${JSON.stringify(UTM_KEYS)},s=sessionStorage,p="${UTM_STORAGE_PREFIX}";if(k.some(function(x){return u.has(x)})){k.forEach(function(x){var v=u.get(x);if(v)s.setItem(p+x,v);else s.removeItem(p+x)})}if(document.referrer&&!s.getItem(p+"referrer")){try{var r=new URL(document.referrer);if(r.hostname!==location.hostname)s.setItem(p+"referrer",document.referrer)}catch(e){}}}catch(e){}})()`}
        </Script>
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
        {REDDIT_PIXEL_ID && (
          <Script id="reddit-pixel" strategy="afterInteractive">
            {`try{var u=new URL(location.href),c=u.searchParams.get("rdt_cid");if(c&&/^\\{\\{.*\\}\\}$/.test(c)){u.searchParams.delete("rdt_cid");history.replaceState(history.state,"",u.toString())}}catch(e){}!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js?pixel_id=${REDDIT_PIXEL_ID}",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);rdt('init',${JSON.stringify(REDDIT_PIXEL_ID)},${JSON.stringify(
              session.connected
                ? {
                    ...(session.googleEmail ? { email: session.googleEmail } : {}),
                    ...(session.userId ? { externalId: session.userId } : {}),
                  }
                : {},
            )});rdt('track','PageVisit');`}
          </Script>
        )}
        <Script id="x-pixel" strategy="afterInteractive">
          {`!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
          },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
          a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
          twq('config','q27qa');`}
        </Script>
        <PostHogProvider bootstrapUser={bootstrapUser}>
          <GadsConversionTracker />
          {children}
          <AppToaster />
        </PostHogProvider>
      </body>
    </html>
  );
}
