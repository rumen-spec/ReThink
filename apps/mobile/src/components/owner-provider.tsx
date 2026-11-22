import type { ReactNode } from 'react';

import { OwnerActionsContext, OwnerStateContext, useOwnerStateProvider } from '@/lib/owner-state';

export function OwnerProvider({ children }: { children: ReactNode }) {
  const { state, actions } = useOwnerStateProvider();
  return (
    <OwnerStateContext.Provider value={state}>
      <OwnerActionsContext.Provider value={actions}>{children}</OwnerActionsContext.Provider>
    </OwnerStateContext.Provider>
  );
}
