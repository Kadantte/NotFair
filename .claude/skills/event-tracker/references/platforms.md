# Platform SDK Reference

## Statsig

**Install:** `npm install statsig-js` (web) | `npm install statsig-node` (server) | `pip install statsig` (Python)

**Initialize:**
```typescript
import Statsig from 'statsig-js';

await Statsig.initialize('client-sdk-key', {
  userID: 'user_123',
  custom: { acquisition_source: 'organic' }
});
```

**Log event:**
```typescript
Statsig.logEvent(
  'booking_completed',           // event_name
  'boarding',                    // optional: string value (shows in dashboard)
  {                              // metadata (properties)
    service_type: 'boarding',
    location_id: 42,
    duration_nights: 3,
    amount_cents: 15000,
    is_first_booking: true,
  }
);
```

**Server-side (Node):**
```typescript
import { StatsigServer } from 'statsig-node';

await StatsigServer.initialize('server-sdk-key');
StatsigServer.logEvent(
  { userID: 'user_123' },
  'booking_completed',
  'boarding',
  { service_type: 'boarding', amount_cents: 15000 }
);
await StatsigServer.flush();
```

**Notes:**
- `value` (2nd arg) is a string scalar shown in Statsig Metrics — use the primary dimension (e.g., service type, plan name)
- All metadata goes in the `metadata` object (3rd arg)
- Call `flush()` on server before process exit
- User properties set at `initialize()` are automatically attached to all events

---

## Mixpanel

**Install:** `npm install mixpanel-browser` (web) | `npm install mixpanel` (Node) | `pip install mixpanel`

**Initialize:**
```typescript
import mixpanel from 'mixpanel-browser';

mixpanel.init('YOUR_TOKEN', { debug: false, track_pageview: true });
mixpanel.identify('user_123');
mixpanel.people.set({
  acquisition_source: 'organic',
  $created: new Date().toISOString(),
});
```

**Log event:**
```typescript
mixpanel.track('booking_completed', {
  service_type: 'boarding',
  location_id: 42,
  duration_nights: 3,
  amount_cents: 15000,
  is_first_booking: true,
});
```

**Server-side (Node):**
```typescript
const Mixpanel = require('mixpanel');
const mixpanel = Mixpanel.init('YOUR_TOKEN');

mixpanel.track('booking_completed', {
  distinct_id: 'user_123',
  service_type: 'boarding',
  amount_cents: 15000,
});
```

**Notes:**
- Always call `identify()` before `track()` after login — anonymous events are linked retroactively
- Super properties (set via `mixpanel.register()`) are attached to every event automatically
- Use `$` prefix only for Mixpanel reserved properties (`$name`, `$email`, `$created`)
- Revenue tracking: use `mixpanel.people.track_charge(amount)` for revenue reports

---

## PostHog

**Install:** `npm install posthog-js` (web) | `npm install posthog-node` (server) | `pip install posthog`

**Initialize:**
```typescript
import posthog from 'posthog-js';

posthog.init('phc_YOUR_KEY', {
  api_host: 'https://app.posthog.com',  // or your self-hosted URL
});
posthog.identify('user_123', {
  acquisition_source: 'organic',
});
```

**Log event:**
```typescript
posthog.capture('booking_completed', {
  service_type: 'boarding',
  location_id: 42,
  duration_nights: 3,
  amount_cents: 15000,
  is_first_booking: true,
});
```

**Server-side (Node):**
```typescript
import { PostHog } from 'posthog-node';

const client = new PostHog('phc_YOUR_KEY', { host: 'https://app.posthog.com' });

client.capture({
  distinctId: 'user_123',
  event: 'booking_completed',
  properties: {
    service_type: 'boarding',
    amount_cents: 15000,
  },
});
await client.shutdown();
```

**Notes:**
- Self-hosted: swap `api_host` for your instance URL
- PostHog auto-captures clicks/pageviews — disable with `autocapture: false` if you want manual-only
- Group analytics: `posthog.group('company', 'acme_corp', { plan: 'enterprise' })`
- Feature flags are native: `posthog.isFeatureEnabled('new-checkout')`

---

## Amplitude

**Install:** `npm install @amplitude/analytics-browser` (web) | `npm install @amplitude/analytics-node` (server)

**Initialize:**
```typescript
import * as amplitude from '@amplitude/analytics-browser';

amplitude.init('YOUR_API_KEY', 'user_123', {
  defaultTracking: { sessions: true, pageViews: false },
});
```

**Log event:**
```typescript
amplitude.track('booking_completed', {
  service_type: 'boarding',
  location_id: 42,
  duration_nights: 3,
  amount_cents: 15000,
  is_first_booking: true,
});
```

**Server-side (Node):**
```typescript
import { createInstance } from '@amplitude/analytics-node';

const client = createInstance();
client.init('YOUR_API_KEY');

client.track({
  event_type: 'booking_completed',
  user_id: 'user_123',
  event_properties: {
    service_type: 'boarding',
    amount_cents: 15000,
  },
});
await client.flush();
```

**Revenue tracking:**
```typescript
import { Revenue } from '@amplitude/analytics-browser';

const revenue = new Revenue()
  .setProductId('boarding-overnight')
  .setPrice(150.00)
  .setQuantity(1);
amplitude.revenue(revenue);
```

**Notes:**
- Amplitude separates `event_properties` (what happened) from `user_properties` (who did it)
- Update user properties: `const identifyObj = new amplitude.Identify(); identifyObj.set('plan', 'pro'); amplitude.identify(identifyObj);`
- Revenue events require the `Revenue` object for proper LTV tracking in dashboards
- Call `flush()` on server before shutdown

---

## Universal Event Naming Conventions

Regardless of platform, follow these rules:

| Rule | Good | Bad |
|---|---|---|
| snake_case | `booking_completed` | `BookingCompleted`, `booking-completed` |
| Past tense verbs | `session_started` | `start_session`, `session_start` |
| Noun + verb | `profile_updated` | `update`, `changed` |
| Specific nouns | `boarding_booking_completed` | `thing_done` |
| No platform names | `page_viewed` | `ga_page_view` |

## Debugging Events

All platforms provide a way to verify events are firing correctly:

| Platform | Debug tool |
|---|---|
| Statsig | Metrics Explorer → Event Log (real-time) |
| Mixpanel | Events tab → Live View |
| PostHog | Activity tab → Live events stream |
| Amplitude | User Lookup → Event Stream |
