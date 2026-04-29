import { SUPPORT_EMAIL } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
    title: "Terms of Service",
    description:
        "Review the NotFair terms covering use of the AI Google Ads agent, Google Ads integrations, service limitations, and account responsibilities.",
    path: "/terms",
    keywords: [
        "NotFair terms of service",
        "Google Ads agent terms",
        "Google Ads MCP terms",
    ],
    category: "legal",
});

export default function TermsPage() {
    return (
        <div className="container mx-auto max-w-3xl px-6 py-12 md:py-24 text-zinc-300">
            <h1 className="text-4xl font-bold tracking-tight text-white mb-8">Terms of Service</h1>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">1. Introduction</h2>
                <p>
                    Welcome to NotFair (&quot;Service&quot;). By accessing or using our Service, you agree to comply with and be bound by these Terms of Service. If you do not agree, you must not use the Service.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">2. License to Use</h2>
                <p>
                    NotFair grants you a revocable, non-exclusive, non-transferable, limited license to access and use the Service strictly in accordance with these Terms. You agree not to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                    <li>Modify, adapt, translate, reverse engineer, or decompile any portion of the Service.</li>
                    <li>Use the Service to transmit spam or other unsolicited communications.</li>
                    <li>Attempt to gain unauthorized access to our servers or networks.</li>
                    <li>Violate any applicable laws or regulations.</li>
                </ul >
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">3. Your Responsibility</h2>
                <p>
                    You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">4. Intellectual Property</h2>
                <p>
                    All content, features, and functionality of the Service, including but not limited to design, text, graphics, and logos, are the exclusive property of NotFair and its licensors.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">5. Third-Party Services</h2>
                <p>
                    Our Service may integrate with third-party services, such as Google Ads. By using these integrations, you agree to comply with the terms and policies of those third-party services. We are not responsible for the availability or content of such services.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">6. Termination</h2>
                <p>
                    We may terminate or suspend your access to the Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">7. Disclaimer of Warranties</h2>
                <p>
                    THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS. ADSAGENT MAKES NO REPRESENTATIONS OR WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, AS TO THE OPERATION OF THE SERVICE OR THE INFORMATION, CONTENT, MATERIALS, OR PRODUCTS INCLUDED ON THE SERVICE.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">8. Limitation of Liability</h2>
                <p>
                    IN NO EVENT SHALL ADSAGENT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">9. Changes to Terms</h2>
                <p>
                    We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material we will try to provide at least 30 days&apos; notice prior to any new terms taking effect.
                </p>
            </section>

            <section className="space-y-4 mb-8">
                <h2 className="text-2xl font-semibold text-white">10. Contact Us</h2>
                <p>
                    If you have any questions about these Terms, please contact us at: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-400 hover:underline">{SUPPORT_EMAIL}</a>
                </p>
            </section>
        </div>
    );
}
