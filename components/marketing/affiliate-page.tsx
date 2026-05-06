import { DiscordLink } from "@/components/discord-link";

const steps = [
  {
    number: "01",
    title: "Join the Discord",
    body: "Tell us who you are and how you plan to refer. We approve partners by hand to keep the program focused on people who actually understand Google Ads.",
  },
  {
    number: "02",
    title: "Get your unique link",
    body: "We generate a referral link tied to your account. Anyone who signs up through it is permanently attributed to you.",
  },
  {
    number: "03",
    title: "Share it",
    body: "Send it to founders, agencies, your audience, your clients — wherever NotFair would be useful. No quotas, no minimum activity.",
  },
  {
    number: "04",
    title: "Get paid every month",
    body: "We pay 50% of every dollar a referred customer pays NotFair during their first 12 months. Payouts run monthly via Stripe or Wise.",
  },
];

const examples = [
  {
    plan: "Growth — monthly",
    price: "$99 / mo",
    yourCut: "$49.50 / mo",
    annual: "$594",
  },
  {
    plan: "Growth — yearly",
    price: "$950 / yr",
    yourCut: "$475 upfront",
    annual: "$475",
  },
];

const rules = [
  {
    q: "What counts as a referral?",
    a: "Anyone who signs up through your link and becomes a paying NotFair customer. Free users don't pay out — only real revenue counts.",
  },
  {
    q: "How long do I earn on each customer?",
    a: "12 months from their first paid invoice. After that, the customer is still yours on record, but the revenue share ends.",
  },
  {
    q: "What if a customer cancels or refunds?",
    a: "We only pay on net revenue. If a customer refunds or churns, the unpaid months simply stop. No clawbacks on already-paid commissions.",
  },
  {
    q: "What if someone clicks my link but signs up later?",
    a: "Attribution lasts 60 days from the click. As long as they create an account within that window, they're yours.",
  },
  {
    q: "Can I refer myself or my own company?",
    a: "No self-referrals. We'll spot it and the account will be removed from the program.",
  },
  {
    q: "How do I get paid?",
    a: "Stripe Connect or Wise, depending on country. Payouts happen on the 1st of the month for the previous month's earned commissions, with a $50 minimum.",
  },
  {
    q: "Is there a cap?",
    a: "No cap on earnings, no cap on referrals. Refer 100 customers, earn 50% on all of them.",
  },
  {
    q: "Can I run paid ads to my link?",
    a: "Yes — except branded terms. Don't bid on \"NotFair\" or close variants in Google or Meta. Everything else is fair game.",
  },
];

export function AffiliatePage() {
  return (
    <>
      <section className="px-4 pb-12 pt-24">
        <div className="container mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Affiliate Program
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#E8E4DD] md:text-6xl">
              Earn 50% of every dollar, for the first year.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              Refer a customer to NotFair. We pay you half of everything they
              pay us, every month, for the first 12 months they are a paying
              customer. No tiers, no caps, no clever fine print.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#C4C0B6]">
                Revenue share
              </p>
              <p className="mt-3 font-mono text-3xl font-semibold text-[#4CAF6E]">
                50%
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                Of every paid invoice from your referrals.
              </p>
            </div>
            <div className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#C4C0B6]">
                Duration
              </p>
              <p className="mt-3 font-mono text-3xl font-semibold text-[#E8E4DD]">
                12 months
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                Recurring, starting from their first paid invoice.
              </p>
            </div>
            <div className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#C4C0B6]">
                Payouts
              </p>
              <p className="mt-3 font-mono text-3xl font-semibold text-[#E8E4DD]">
                Monthly
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                Paid on the 1st via Stripe or Wise.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-xl font-semibold uppercase tracking-[0.18em] text-[#E8E4DD]">
            How it works
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#C4C0B6]">
            Four steps. The whole program is designed so you spend time
            referring, not reading rules.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {steps.map((step) => (
              <div
                key={step.number}
                className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6"
              >
                <p className="font-mono text-xs font-medium tracking-[0.18em] text-[#4CAF6E]">
                  {step.number}
                </p>
                <h3 className="mt-3 text-lg font-semibold text-[#E8E4DD]">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#C4C0B6]">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-xl font-semibold uppercase tracking-[0.18em] text-[#E8E4DD]">
            What you actually earn
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#C4C0B6]">
            Concrete numbers, not percentages dressed up as marketing.
          </p>

          <div className="mt-8 overflow-hidden rounded-3xl border border-[#3D3C36] bg-[#24231F]">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#3D3C36]">
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-[0.18em] text-[#C4C0B6]">
                    Plan
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-[0.18em] text-[#C4C0B6]">
                    Customer pays
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-[0.18em] text-[#C4C0B6]">
                    You earn
                  </th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-[0.18em] text-[#C4C0B6]">
                    12-month total
                  </th>
                </tr>
              </thead>
              <tbody>
                {examples.map((row, i) => (
                  <tr
                    key={row.plan}
                    className={
                      i < examples.length - 1
                        ? "border-b border-[#3D3C36]/60"
                        : ""
                    }
                  >
                    <td className="px-6 py-4 text-sm font-medium text-[#E8E4DD]">
                      {row.plan}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-[#C4C0B6]">
                      {row.price}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-[#4CAF6E]">
                      {row.yourCut}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-[#E8E4DD]">
                      {row.annual}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono text-xs text-[#C4C0B6]">
            Per referred customer, for 12 months from their first paid invoice.
          </p>
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-xl font-semibold uppercase tracking-[0.18em] text-[#E8E4DD]">
            The rules, plainly
          </h2>

          <div className="mt-8 grid gap-px overflow-hidden rounded-3xl border border-[#3D3C36] bg-[#3D3C36]">
            {rules.map((rule) => (
              <div key={rule.q} className="bg-[#24231F] p-6">
                <h3 className="text-base font-semibold text-[#E8E4DD]">
                  {rule.q}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                  {rule.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
          <div className="rounded-3xl border border-[#4CAF6E]/40 bg-[#4CAF6E]/[0.06] p-8 md:p-12">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Ready to start
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Join the Discord and tell us about you.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
              All affiliate onboarding happens in our Discord. Join, send a DM
              to Tong with a quick intro and how you plan to refer, and
              we&rsquo;ll set up your unique link within a day.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <DiscordLink
                location="affiliate_page_cta"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#4CAF6E] bg-[#4CAF6E] px-6 text-sm font-semibold text-[#1A1917] transition-all hover:scale-[1.02] hover:bg-[#3D9A5C]"
                iconClassName="h-4 w-4 fill-current"
              >
                Join the Discord
              </DiscordLink>
              <a
                href="mailto:tong@notfair.co?subject=Affiliate%20Program"
                className="inline-flex h-11 items-center justify-center rounded-full border border-[#3D3C36] bg-transparent px-6 text-sm font-medium text-[#E8E4DD] transition-colors hover:border-[#4D4C46] hover:bg-[#24231F]"
              >
                Or email tong@notfair.co
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
