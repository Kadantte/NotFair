import { parseCustomerIds } from "@/lib/google-ads";

export type BackfillSessionRow = {
  userId: string | null;
  customerId: string;
  customerIds: string | null;
};

export type BackfillOperationRow = {
  id: number;
  accountId: string;
  userId: string | null;
};

export type BackfillAssignment = {
  operationId: number;
  accountId: string;
  userId: string;
};

export type OperationUserBackfillPlan = {
  assignments: BackfillAssignment[];
  ambiguousAccountIds: string[];
  unresolvedAccountIds: string[];
};

function collectAccountIds(session: BackfillSessionRow): string[] {
  const accountIds = new Set<string>();

  if (session.customerId) {
    accountIds.add(session.customerId);
  }

  for (const account of parseCustomerIds(session.customerIds)) {
    if (account.id) {
      accountIds.add(account.id);
    }
  }

  return [...accountIds];
}

export function buildAccountUserMap(
  sessions: BackfillSessionRow[],
): Map<string, Set<string>> {
  const accountUsers = new Map<string, Set<string>>();

  for (const session of sessions) {
    if (!session.userId) continue;

    for (const accountId of collectAccountIds(session)) {
      const users = accountUsers.get(accountId) ?? new Set<string>();
      users.add(session.userId);
      accountUsers.set(accountId, users);
    }
  }

  return accountUsers;
}

export function planOperationUserBackfill(
  operations: BackfillOperationRow[],
  sessions: BackfillSessionRow[],
): OperationUserBackfillPlan {
  const accountUsers = buildAccountUserMap(sessions);
  const assignments: BackfillAssignment[] = [];
  const ambiguous = new Set<string>();
  const unresolved = new Set<string>();

  for (const operation of operations) {
    if (operation.userId) continue;

    const users = accountUsers.get(operation.accountId);
    if (!users || users.size === 0) {
      unresolved.add(operation.accountId);
      continue;
    }

    if (users.size > 1) {
      ambiguous.add(operation.accountId);
      continue;
    }

    assignments.push({
      operationId: operation.id,
      accountId: operation.accountId,
      userId: [...users][0],
    });
  }

  return {
    assignments,
    ambiguousAccountIds: [...ambiguous].sort(),
    unresolvedAccountIds: [...unresolved].sort(),
  };
}
