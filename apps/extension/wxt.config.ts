import { defineConfig } from 'wxt';

import { MERCHANT_HOSTS } from '../../packages/shared/src/merchants.ts';

// Host allowlist comes from the merchant registry (CLAUDE.md: never hardcode a store host).
const merchantMatches = MERCHANT_HOSTS.map((h) => `https://${h}/*`);

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ReThink',
    description: 'Budget-aware shopping. See what a purchase means before you make it.',
    permissions: ['storage'],
    host_permissions: [...merchantMatches, 'https://*.supabase.co/*'],
  },
});
