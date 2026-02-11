export const metadata = {
    title: "Privacy Policy - AdsAgent",
};

export default function PrivacyPage() {
    return (
        <div className="container mx-auto max-w-3xl px-6 py-12 md:py-24 text-zinc-300">
            <h1 className="text-4xl font-bold tracking-tight text-white mb-8">Privacy Policy</h1>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">1. Introduction</h2>
                <p>
                    Welcome to AdsAgent ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our web application AdsAgent.
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
                        <strong>Google Ads Data:</strong> We access your Google Ads account data (campaigns, ad groups, keywords, performance metrics) solely for the purpose of optimizing and managing your campaigns as authorized by you. We do not store this data permanently unless necessary for reporting features you enable.
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
                    <li>Optimize your Google Ads campaigns automatically based on your settings.</li>
                    <li>Monitor and analyze usage and trends to improve user experience.</li>
                    <li>Communicate with you about updates, security alerts, and support messages.</li>
                </ul>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">4. Data Sharing and Disclosure</h2>
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
                <h2 className="text-2xl font-semibold text-white">5. Google User Data</h2>
                <p>
                    AdsAgent's use and transfer to any other app of information received from Google APIs will adhere to <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">6. Security</h2>
                <p>
                    We implement appropriate technical and organizational measures to protect your data. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">7. Changes to This Policy</h2>
                <p>
                    We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">8. Contact Us</h2>
                <p>
                    If you have any questions about this Privacy Policy, please contact us at: <a href="mailto:support@adsagent.ai" className="text-blue-400 hover:underline">support@adsagent.ai</a>
                </p>
            </section>
        </div>
    );
}
