import { NextResponse } from 'next/server';
import { getAppOrigin } from '@/lib/app-url';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
        return new NextResponse(`<html><body><h1>Auth Error</h1><p>${error}</p></body></html>`, { headers: { 'Content-Type': 'text/html' } });
    }

    if (!code) {
        return new NextResponse(`<html><body><h1>Missing Code</h1></body></html>`, { headers: { 'Content-Type': 'text/html' } });
    }

    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const redirectUri = `${getAppOrigin()}/api/auth/google/callback`;

    // Exchange code for tokens
    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: clientId!,
                client_secret: clientSecret!,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        });

        const data = await response.json();

        if (data.error) {
            return new NextResponse(`<html><body><h1>Token Error</h1><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`, { headers: { 'Content-Type': 'text/html' } });
        }

        // We have refresh_token (maybe, if prompt=consent) and access_token.
        // We want to pass this back to the opener or the main window.
        // Since this is likely a popup or a redirect, we'll store it in localStorage via script and redirect.

        const script = `
        if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_ADS_AUTH_SUCCESS', refreshToken: '${data.refresh_token || ''}' }, '*');
            window.close();
        } else {
            localStorage.setItem('google_ads_refresh_token', '${data.refresh_token || ''}');
            window.location.href = '/google-ads/setup';
        }
      `;

        return new NextResponse(`<html><body><h1>Authenticating...</h1><script>${script}</script></body></html>`, { headers: { 'Content-Type': 'text/html' } });

    } catch (e) {
        console.error(e);
        return new NextResponse(`<html><body><h1>Server Error</h1><pre>${JSON.stringify(e)}</pre></body></html>`, { headers: { 'Content-Type': 'text/html' } });
    }
}
