"use client";

import { useRouter } from "next/navigation";
import {
  saveDraftAndSyncGmailAction,
  sendDraftViaGmailAction,
} from "../../../outreach/actions";
import { DraftEditor } from "./draft-editor";

/**
 * Thin client wrapper binding a lead contactId to DraftEditor's callback API.
 * Refreshes the server component parent after save/send so draft + status
 * persist across navigation.
 */
export function ContactDraftEditor({
  contactId,
  initialSubject,
  initialBody,
  hasGmailDraftId,
  canSend,
}: {
  contactId: number;
  initialSubject: string;
  initialBody: string;
  hasGmailDraftId: boolean;
  canSend: boolean;
}) {
  const router = useRouter();
  return (
    <DraftEditor
      initialSubject={initialSubject}
      initialBody={initialBody}
      hasGmailDraftId={hasGmailDraftId}
      canSend={canSend}
      onSave={async (subject, body) => {
        const result = await saveDraftAndSyncGmailAction(contactId, subject, body);
        return { gmailSynced: result.gmailSynced, syncError: result.syncError };
      }}
      onSend={async () => {
        await sendDraftViaGmailAction(contactId);
      }}
      onChanged={() => router.refresh()}
    />
  );
}
