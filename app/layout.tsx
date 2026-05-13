import type { Metadata } from "next";
import Script from "next/script";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AppToaster } from "@/components/app-toaster";
import "./sonner.css";
import "./globals.css";

import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_URL } from "@/lib/seo";
import {
  ATTRIBUTION_COOKIE_NAME,
  ATTRIBUTION_PARAM_KEYS,
  ATTRIBUTION_VERSION,
  PAID_TOUCH_COOKIE_NAME,
  UTM_KEYS,
  UTM_STORAGE_PREFIX,
} from "@/lib/utm";
import { PostHogProvider } from "@/components/posthog-provider";
import { GadsConversionTracker } from "@/components/gads-conversion-tracker";
import { getSession } from "@/lib/session";
import { getLocalePreferenceBootstrapScript } from "@/i18n/locale-preference";

const GADS_CONVERSION_ID = "AW-18054900065";
const REDDIT_PIXEL_ID = process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID;
const X_PIXEL_ID = process.env.NEXT_PUBLIC_X_PIXEL_ID ?? "q27qa";

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
  const [locale, messages, session] = await Promise.all([
    getLocale(),
    getMessages(),
    getSession(),
  ]);
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
    <html lang={locale} suppressHydrationWarning className="h-full" style={{ colorScheme: "dark" }}>
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
        <Script id="locale-preference" strategy="beforeInteractive">
          {getLocalePreferenceBootstrapScript()}
        </Script>
        <Script id="utm-persist" strategy="beforeInteractive">
          {`(function(){try{var u=new URLSearchParams(location.search),utm=${JSON.stringify(UTM_KEYS)},all=${JSON.stringify(ATTRIBUTION_PARAM_KEYS)},s=sessionStorage,p="${UTM_STORAGE_PREFIX}",cookie="${ATTRIBUTION_COOKIE_NAME}",paidCookie="${PAID_TOUCH_COOKIE_NAME}",internal=${JSON.stringify(["accounts.google.com","checkout.stripe.com","billing.stripe.com"])};
function clean(v){return typeof v==="string"&&v.trim()?v.trim().slice(0,512):null}
function domain(v){try{return new URL(v).hostname.replace(/^www\\./,"")}catch(e){return String(v||"").replace(/^https?:\\/\\//,"").replace(/^www\\./,"").split("/")[0]||null}}
function isInternalRef(v){var d=domain(v),h=location.hostname.replace(/^www\\./,"");return !!d&&(d===h||internal.indexOf(d)>=0)}
function getCookie(name){return document.cookie.split(";").map(function(x){return x.trim()}).find(function(x){return x.indexOf(name+"=")===0})}
function hasPaidSignal(a){var clicks=["gclid","fbclid","rdt_cid","twclid"];if(clicks.some(function(x){return !!a[x]}))return true;if(/^(paid|paid_social|paid_search|cpc|ppc|display|retargeting)$/i.test(a.utm_medium||""))return true;return /^(x|twitter|twitter_ads)$/i.test(a.utm_source||"")}
if(utm.some(function(x){return u.has(x)})){utm.forEach(function(x){var v=clean(u.get(x));if(v)s.setItem(p+x,v);else s.removeItem(p+x)})}
if(document.referrer&&!s.getItem(p+"referrer")&&!isInternalRef(document.referrer)){s.setItem(p+"referrer",document.referrer)}
if(!getCookie(cookie)){var a={version:${ATTRIBUTION_VERSION},first_landing_url:location.href.slice(0,512),first_landing_path:(location.pathname+location.search).slice(0,512),attribution_captured_at:new Date().toISOString()};all.forEach(function(x){var v=clean(u.get(x))||clean(s.getItem(p+x));if(v)a[x]=v});var r=s.getItem(p+"referrer");if(r&&!isInternalRef(r)){a.signup_referrer=r;a.signup_referrer_domain=domain(r)}document.cookie=cookie+"="+encodeURIComponent(JSON.stringify(a))+"; path=/; max-age=15552000; SameSite=Lax"}
var paid={version:${ATTRIBUTION_VERSION},first_landing_url:location.href.slice(0,512),first_landing_path:(location.pathname+location.search).slice(0,512),attribution_captured_at:new Date().toISOString()};all.forEach(function(x){var v=clean(u.get(x));if(v)paid[x]=v});if(hasPaidSignal(paid)){document.cookie=paidCookie+"="+encodeURIComponent(JSON.stringify(paid))+"; path=/; max-age=7776000; SameSite=Lax"}
}catch(e){}})()`}
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
          twq('config',${JSON.stringify(X_PIXEL_ID)});`}
        </Script>
        <NextIntlClientProvider messages={messages}>
          <PostHogProvider bootstrapUser={bootstrapUser}>
            <GadsConversionTracker />
            {children}
            <AppToaster />
          </PostHogProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
