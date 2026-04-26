#!/usr/bin/env python3
"""
fetch_statsig.py — Pull and aggregate Statsig event data.

Usage:
  python scripts/fetch_statsig.py --event tool_opened --days 30
  python scripts/fetch_statsig.py --event tool_opened --days 7 --breakdown tool_name
  python scripts/fetch_statsig.py --list-metrics

Reads STATSIG_CONSOLE_API_KEY from .env.local automatically.
Run from the project root directory.
"""

import argparse, json, os, sys, time
from datetime import datetime, timezone, timedelta
from collections import Counter, defaultdict
import urllib.request


def load_api_key():
    for env_file in ['.env.local', '.env', '.env.production']:
        if os.path.exists(env_file):
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('STATSIG_CONSOLE_API_KEY='):
                        return line.split('=', 1)[1].strip().strip("'\"")
    return os.environ.get('STATSIG_CONSOLE_API_KEY')


def api_get(api_key, path):
    url = f"https://statsigapi.net/console/v1{path}"
    req = urllib.request.Request(url, headers={'STATSIG-API-KEY': api_key})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        return {'error': f"HTTP {e.code}: {body[:300]}"}


def main():
    parser = argparse.ArgumentParser(description='Fetch Statsig event data')
    parser.add_argument('--event', help='Event name to filter (e.g. tool_opened)')
    parser.add_argument('--days', type=int, default=30, help='Days to look back (default: 30)')
    parser.add_argument('--breakdown', help='Metadata property to break down by (e.g. tool_name)')
    parser.add_argument('--list-metrics', action='store_true', help='List all available metrics')
    parser.add_argument('--list-events', action='store_true', help='List all unique event names seen')
    args = parser.parse_args()

    api_key = load_api_key()
    if not api_key:
        print(json.dumps({'error': 'STATSIG_CONSOLE_API_KEY not found. Add it to .env.local.'}))
        sys.exit(1)

    # --- List metrics mode ---
    if args.list_metrics:
        data = api_get(api_key, '/metrics/list?limit=100')
        metrics = [m for m in data.get('data', [])]
        print(json.dumps({'available_metrics': metrics}, indent=2))
        return

    # --- Fetch raw events (all pages) ---
    cutoff_ms = int((datetime.now(timezone.utc) - timedelta(days=args.days)).timestamp() * 1000)
    all_events = []
    page = 1
    pages_fetched = 0
    stopped_reason = 'exhausted'

    while True:
        data = api_get(api_key, f'/events?page={page}&limit=100')
        if 'error' in data:
            print(json.dumps({'error': data['error']}))
            sys.exit(1)

        events = data.get('data', [])
        if not events:
            break

        pages_fetched += 1

        # Events are newest-first. Filter to our time window.
        relevant = [e for e in events if int(e.get('timestamp', 0)) >= cutoff_ms]

        if args.event:
            relevant = [e for e in relevant if e.get('name') == args.event]

        all_events.extend(relevant)

        # The oldest event on this page tells us if we've gone past our window
        oldest_ts = min(int(e.get('timestamp', 0)) for e in events)
        if oldest_ts < cutoff_ms:
            stopped_reason = 'past_window'
            break

        pagination = data.get('pagination', {})
        if not pagination.get('nextPage'):
            break

        page += 1
        time.sleep(0.05)  # polite pacing

    # --- List event names mode ---
    if args.list_events:
        # Re-fetch without event filter to see all names
        # (already done above if no --event was passed)
        name_counts = Counter(e.get('name', '?') for e in all_events)
        print(json.dumps({'event_names': dict(name_counts.most_common(50))}, indent=2))
        return

    if not args.event:
        print(json.dumps({'error': 'Provide --event <name> or --list-events or --list-metrics'}))
        sys.exit(1)

    total = len(all_events)
    unique_users = len(set(e.get('userID', '') for e in all_events))

    # Daily counts
    daily = defaultdict(int)
    for e in all_events:
        day = datetime.fromtimestamp(int(e['timestamp']) / 1000, tz=timezone.utc).strftime('%Y-%m-%d')
        daily[day] += 1

    # Breakdown by property
    breakdown = {}
    if args.breakdown and all_events:
        prop_counter = Counter()
        for e in all_events:
            meta = e.get('metadata') or {}
            val = meta.get(args.breakdown) or e.get('value') or 'unknown'
            prop_counter[str(val)] += 1
        breakdown = dict(prop_counter.most_common(20))

    # Trend: compare first half vs second half of window
    half_ms = cutoff_ms + (int(time.time() * 1000) - cutoff_ms) // 2
    first_half = sum(1 for e in all_events if int(e['timestamp']) < half_ms)
    second_half = sum(1 for e in all_events if int(e['timestamp']) >= half_ms)
    trend = 'up' if second_half > first_half else ('down' if second_half < first_half else 'flat')

    result = {
        'event': args.event,
        'window_days': args.days,
        'total_events': total,
        'unique_users': unique_users,
        'trend': trend,
        'first_half_count': first_half,
        'second_half_count': second_half,
        'daily_counts': dict(sorted(daily.items())),
        'breakdown': breakdown,
        'pages_fetched': pages_fetched,
        'stopped_reason': stopped_reason,
        'note': (
            'Zero events found. Either: (1) event name is wrong, (2) events are in a different '
            'Statsig environment (check NEXT_PUBLIC_STATSIG_ENVIRONMENT in your deployment), '
            'or (3) this event has never fired in production.'
            if total == 0 else None
        ),
    }
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
