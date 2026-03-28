export const metadata = {
    title: "Privacy Policy - AdsAgent",
};

export default function PrivacyPage() {
    return (
        <div className="container mx-auto max-w-3xl px-6 py-12 md:py-24 text-zinc-300">
            <h1 className="text-4xl font-bold tracking-tight text-white mb-8">Privacy Policy</h1>
            <p className="mb-8 text-sm text-zinc-400">Effective date: March 28, 2026</p>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">1. Introduction</h2>
                <p>
                    Welcome to AdsAgent (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our web application AdsAgent.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">2. Information We Collect</h2>
                <p>We may collect the following types of information when you use our Service:</p>
                <ul className="list-disc pl-6 space-y-2">
                    <li>
                        <strong>Personal Information:</strong> Includes your name, email address, and Google account information when you authenticate with Google Ads.
                    </li>
                    <li>
                        <strong>Google OAuth Data:</strong> When you authorize AdsAgent with Google, we request the scopes <code>openid</code>, <code>email</code>, <code>profile</code>, and <code>https://www.googleapis.com/auth/adwords</code>. We use these scopes to identify your Google account, list accessible Google Ads accounts, and perform the Google Ads actions you request.
                    </li>
                    <li>
                        <strong>Stored Connection Data:</strong> We currently store your Google Ads refresh token, selected Google Ads account IDs, Google email address, and session metadata so the product can reconnect to Google Ads on your behalf while your session remains active.
                    </li>
                    <li>
                        <strong>Google Ads Data:</strong> We access Google Ads account data such as campaigns, ad groups, keywords, search terms, recommendations, budgets, and performance metrics solely to provide campaign analysis, reporting, and changes that you request or approve through AdsAgent.
                    </li>
                    <li>
                        <strong>Usage Data:</strong> Information about how you access and use the Service, such as your IP address, browser type, and operating system.
                    </li>
                </ul>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">3. How We Use Your Information</h2>
                <p>We use the information we collect to:</p>
                <ul className="list-disc pl-6 space-y-2">
                    <li>Provide, operate, and maintain the AdsAgent service.</li>
                    <li>Authenticate you with Google and connect the Google Ads accounts you choose.</li>
                    <li>Read Google Ads account data and perform the Google Ads actions you explicitly request.</li>
                    <li>Generate reports, recommendations, and historical tracking for your connected Google Ads accounts.</li>
                    <li>Monitor and analyze usage and trends to improve user experience.</li>
                    <li>Communicate with you about updates, security alerts, and support messages.</li>
                </ul>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">4. Data Retention and Deletion</h2>
                <p>
                    We retain connection data for active AdsAgent sessions so the service can continue to access your connected Google Ads accounts without requiring you to re-authorize on every visit. Our current session retention period is up to one year unless the session expires earlier or we delete it in response to support or compliance needs.
                </p>
                <p>
                    If you want us to delete your stored Google connection data, contact us at <a href="mailto:support@adsagent.ai" className="text-blue-400 hover:underline">support@adsagent.ai</a>. You can also revoke AdsAgent&apos;s access at any time from your Google account permissions settings.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">5. Data Sharing and Disclosure</h2>
                <p>
                    We do not sell your personal information. We may share your information only in the following circumstances:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                    <li>With service providers who assist us in operating our Service (e.g., hosting, analytics).</li>
                    <li>To comply with legal obligations or protect our rights.</li>
                    <li>With your consent or at your direction.</li>
                </ul>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">6. Google User Data</h2>
                <p>
                    AdsAgent&apos;s use and transfer to any other app of information received from Google APIs will adhere to <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.
                </p>
                <p>
                    We do not use Google user data for advertising, we do not sell Google user data, and we only use Google user data to provide or improve user-facing features related to Google Ads account connection, analysis, and management.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">7. Security</h2>
                <p>
                    We implement appropriate technical and organizational measures to protect your data. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">8. Changes to This Policy</h2>
                <p>
                    We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">9. Contact Us</h2>
                <p>
                    If you have any questions about this Privacy Policy, please contact us at: <a href="mailto:support@adsagent.ai" className="text-blue-400 hover:underline">support@adsagent.ai</a>
                </p>
            </section>
        </div>
    );
}
