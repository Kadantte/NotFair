## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Frontend Performance Patterns

These are mandatory patterns for all frontend components. Follow them by default.

### Navigation: Use `<Link>` not `router.push`
- Always use Next.js `<Link>` with `prefetch` for navigation. This preloads the JS bundle in the background so clicks feel instant.
- Never use `router.push` for user-initiated navigation. It skips prefetching and makes every click a cold load.
- If buttons inside a `<Link>` need to do something else (e.g., pause, delete), use `event.preventDefault()` + `event.stopPropagation()` on those buttons.

### Data fetching: Stale-while-revalidate
- Use a module-level cache variable (outside the component) so data survives client-side navigations.
- On mount: if cached data exists, render it immediately and fetch fresh data in the background. No loading spinner for return visits.
- Only show a loading spinner on the very first load when there's nothing to display.
- Pattern:
  ```tsx
  let cachedData: T[] | null = null;

  export default function Page() {
    const [data, setData] = useState<T[]>(cachedData ?? []);
    const [loading, setLoading] = useState(!cachedData);

    const fetchData = useCallback(async (background = false) => {
      if (!background) setLoading(true);
      const fresh = await fetchAction();
      setData(fresh);
      cachedData = fresh;
      setLoading(false);
    }, []);

    useEffect(() => {
      fetchData(!!cachedData);
    }, [fetchData]);
  }
  ```

### Server-side caching for external APIs
- Cache external API responses (Google Ads, etc.) with a short TTL (30-60s) using an in-memory `Map` keyed by customer/user ID.
- Invalidate the cache immediately on mutations (pause, delete, create, update).
- The Refresh button should clear both client and server cache before fetching.

### No double loading states
- Never combine `loading.tsx` skeletons with a component's own loading spinner. Pick one:
  - For prefetched client components: skip `loading.tsx`, let the component handle its own loading state.
  - For server components with heavy data fetching: use `loading.tsx` skeleton, no client-side loading state.
- If the `<Link prefetch>` has already downloaded the page bundle, a `loading.tsx` skeleton will only flash for ~100ms before the component mounts — causing a jarring double-flash, not a smooth experience.

### Mutations: Optimistic where possible
- After a mutation, invalidate caches (both client module-level and server-side) and re-fetch.
- Disable action buttons during mutations and show a spinner on the specific button being acted on.

## Deploy Configuration (configured by /setup-deploy)
- Platform: Vercel
- Production URL: https://www.adsagent.org
- Deploy workflow: auto-deploy on push (Vercel Git integration)
- Deploy status command: HTTP health check
- Merge method: squash
- Project type: web app (Next.js)
- Post-deploy health check: https://www.adsagent.org/api/health

### Custom deploy hooks
- Pre-merge: none
- Deploy trigger: automatic on push to main (Vercel)
- Deploy status: poll https://www.adsagent.org/api/health for 200
- Health check: https://www.adsagent.org/api/health
