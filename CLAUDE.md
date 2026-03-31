## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Deploy Configuration (configured by /setup-deploy)
- Platform: Vercel
- Production URL: https://adsagent.ai
- Deploy workflow: auto-deploy on push (Vercel Git integration)
- Deploy status command: HTTP health check
- Merge method: squash
- Project type: web app (Next.js)
- Post-deploy health check: https://adsagent.ai/api/health

### Custom deploy hooks
- Pre-merge: none
- Deploy trigger: automatic on push to main (Vercel)
- Deploy status: poll https://adsagent.ai/api/health for 200
- Health check: https://adsagent.ai/api/health
