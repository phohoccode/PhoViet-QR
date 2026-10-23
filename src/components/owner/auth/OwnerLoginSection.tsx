'use client';

import React, { useActionState } from 'react';
import { signInOwnerAction, type OwnerLoginActionState } from '@/features/owner/auth-actions';
import { OwnerLoginForm } from './OwnerLoginForm';

interface OwnerLoginSectionProps {
  systemMessage?: string | null;
  className?: string;
}

const initialState: OwnerLoginActionState = { status: 'idle' };

/**
 * OwnerLoginSection — Client Component kết nối useActionState với signInOwnerAction từ Codex
 * theo đúng hợp đồng tại P1_C02_AUTH_HANDOFF.md.
 */
export const OwnerLoginSection: React.FC<OwnerLoginSectionProps> = ({
  systemMessage,
  className = '',
}) => {
  const [state, formAction, isPending] = useActionState(signInOwnerAction, initialState);

  return (
    <OwnerLoginForm
      action={formAction}
      actionState={state}
      isPending={isPending}
      systemMessage={systemMessage}
      className={className}
    />
  );
};
