import Link from 'next/link';
import { ArrowRight, BarChart2, MessageSquare, Zap, Search, TrendingUp, AlertCircle } from 'lucide-react';

const PROMPTING_PATTERNS = [
  {
    label: 'Audit first',
    prompt: 'Audit my account for the last 30 days',
    description: 'Start every session here. Gets a full picture of spend, waste, and wins before touching anything.',
  },
  {
    label: 'Diagnose a regression',
    prompt: 'Why did my CPA go up last week?',
    description: 'The agent pulls the timeseries, change events, and wasted search terms in one pass to find the root cause.',
  },
  {
    label: 'Find wasted spend',
    prompt: 'Find keywords burning budget with zero conversions in the last 30 days',
    description: 'Returns a ranked list with spend and sample size — so you only act on statistically meaningful findings.',
  },
  {
    label: 'Investigate before acting',
    prompt: 'Show me the data before I pause this campaign',
    description: 'Always ask for the data first. The agent will pull spend, conversions, and trend before recommending any change.',
  },
  {
    label: 'Quantify impact',
    prompt: 'How much would I save per month if I paused these keywords?',
    description: 'Forces a dollar figure alongside every recommendation. Rough math beats vague advice.',
  },
  {
    label: 'Run an experiment',
    prompt: 'A/B test this ad copy against the current RSA on campaign X',
    description: 'Walks through the full experiment lifecycle — create, schedule, monitor, and decide when to promote.',
  },
];

const FEATURES = [
  {
    icon: BarChart2,
    title: 'Impact Monitor',
    description: 'Live dashboard that tracks the effect of every change the agent makes. Check here to see if a bid adjustment or new keyword is moving the metrics.',
    href: '/impact-monitor',
  },
  {
    icon: TrendingUp,
    title: 'Campaigns',
    description: 'A read-only view of your campaign performance. Useful as a sanity check alongside what the agent reports.',
    href: '/campaigns',
  },
  {
    icon: Zap,
    title: 'Operations',
    description: 'Full log of every write operation the agent has made — pauses, bid changes, new keywords. Includes undo.',
    href: '/operations',
  },
  {
    icon: MessageSquare,
    title: 'Chat',
    description: 'Your conversation history with the agent. Pick up any thread where you left off.',
    href: '/chat',
  },
];

function PatternCard({ label, prompt, description }: { label: string; prompt: string; description: string }) {
  return (
    <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[#4CAF6E]">{label}</span>
      </div>
      <p className="font-mono text-[13px] text-[#E8E4DD] bg-[#1A1917] rounded px-3 py-2 border border-[#3D3C36]">
        "{prompt}"
      </p>
      <p className="text-[13px] text-[#C4C0B6]">{description}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, href }: { icon: React.ElementType; title: string; description: string; href: string }) {
  return (
    <Link href={href} className="group rounded-lg border border-[#3D3C36] bg-[#24231F] p-4 space-y-2 hover:border-[#4CAF6E]/40 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-[#4CAF6E]" />
          <span className="text-[14px] font-semibold text-[#E8E4DD]">{title}</span>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-[#3D3C36] group-hover:text-[#4CAF6E] transition-colors" />
      </div>
      <p className="text-[13px] text-[#C4C0B6]">{description}</p>
    </Link>
  );
}

export default function GuidePage() {
  return (
    <div className="min-h-full bg-[#1A1917]">
      <div className="mx-auto max-w-2xl px-6 py-10 space-y-12">

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-[28px] font-semibold tracking-tight text-[#E8E4DD]">
            Getting the most out of NotFair
          </h1>
          <p className="text-[15px] text-[#C4C0B6]">
            Prompting patterns, features, and the one rule that makes every recommendation trustworthy.
          </p>
        </div>

        {/* The Rule */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[#4CAF6E]" />
            <h2 className="text-[16px] font-semibold text-[#E8E4DD]">The one rule</h2>
          </div>
          <div className="rounded-lg border border-[#4CAF6E]/30 bg-[#4CAF6E]/5 p-5 space-y-3">
            <p className="text-[14px] font-semibold text-[#E8E4DD]">
              Every recommendation must be backed by data. No exceptions.
            </p>
            <ul className="space-y-2 text-[13px] text-[#C4C0B6]">
              <li className="flex gap-2"><span className="text-[#4CAF6E] shrink-0">→</span>Before the agent tells you to pause a keyword, it must show you the spend and conversion data.</li>
              <li className="flex gap-2"><span className="text-[#4CAF6E] shrink-0">→</span>Before it says CPA is too high, it must prove it from two angles (keyword-level and campaign-level).</li>
              <li className="flex gap-2"><span className="text-[#4CAF6E] shrink-0">→</span>Sample size always gets stated. A keyword with 4 clicks is inconclusive — the agent should say so.</li>
              <li className="flex gap-2"><span className="text-[#4CAF6E] shrink-0">→</span>If data doesn't exist, "I can't find data to support this" is the right answer.</li>
            </ul>
            <p className="text-[12px] text-[#C4C0B6] border-t border-[#3D3C36] pt-3">
              You can reinforce this in any conversation: <span className="font-mono bg-[#1A1917] px-1.5 py-0.5 rounded text-[11px]">"prove it with data before making any recommendations"</span>
            </p>
          </div>
        </section>

        {/* Prompting patterns */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[#4CAF6E]" />
            <h2 className="text-[16px] font-semibold text-[#E8E4DD]">Prompting patterns that work</h2>
          </div>
          <p className="text-[13px] text-[#C4C0B6]">
            These prompts are designed to trigger data-first analysis. Copy them directly or adapt them to your account.
          </p>
          <div className="space-y-3">
            {PROMPTING_PATTERNS.map((p) => (
              <PatternCard key={p.label} {...p} />
            ))}
          </div>
        </section>

        {/* Workflow */}
        <section className="space-y-4">
          <h2 className="text-[16px] font-semibold text-[#E8E4DD]">Recommended workflow</h2>
          <div className="space-y-2">
            {[
              { step: '1', title: 'Audit', desc: 'Start with a 30-day audit to understand the full account state.' },
              { step: '2', title: 'Diagnose', desc: 'If something looks off, ask why before acting. Get the root cause with data.' },
              { step: '3', title: 'Act', desc: 'Make one change at a time using the write tools. The agent tracks each operation.' },
              { step: '4', title: 'Monitor', desc: 'Check the Impact Monitor 24–48 hours after any change to see if it moved the metrics.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-4 items-start">
                <div className="w-6 h-6 rounded-full bg-[#2E2D28] border border-[#3D3C36] flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[11px] font-semibold text-[#4CAF6E]">{step}</span>
                </div>
                <div>
                  <span className="text-[14px] font-semibold text-[#E8E4DD]">{title} </span>
                  <span className="text-[13px] text-[#C4C0B6]">— {desc}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="space-y-4">
          <h2 className="text-[16px] font-semibold text-[#E8E4DD]">Features in the app</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
