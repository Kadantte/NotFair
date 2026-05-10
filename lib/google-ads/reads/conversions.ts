import { getCachedCustomer } from "../client";
import { readOnlyConversionActionReason } from "../campaign-ops";
import { normalizeCustomerId } from "../helpers";
import type { AuthContext } from "../types";
import { isDemoAuth } from "@/lib/demo/constants";
import { demoGetConversionActions } from "@/lib/demo/reads";

export async function getConversionActions(auth: AuthContext) {
  if (isDemoAuth(auth)) return demoGetConversionActions();
  const customer = getCachedCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // owner_customer is needed to flag manager-inherited conversion actions as
  // read-only — without it, an agent doing a bulk demote sweep wastes calls
  // discovering after-the-fact that some rows are inherited.
  const result = await customer.query(`
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.type,
      conversion_action.status,
      conversion_action.category,
      conversion_action.include_in_conversions_metric,
      conversion_action.counting_type,
      conversion_action.value_settings.default_value,
      conversion_action.value_settings.always_use_default_value,
      conversion_action.primary_for_goal,
      conversion_action.owner_customer
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
    ORDER BY conversion_action.name ASC
  `);

  return (result as any[]).map((row) => {
    const ca = row.conversion_action ?? {};
    const id = String(ca.id ?? "");
    // Tells agents up-front which rows updateConversionAction can change. Set
    // by type (GA4/UA/Floodlight/Firebase/Salesforce/SA360 imports, Smart
    // Campaign auto-actions, store visits, app-store types) and by ownership
    // (manager-inherited actions are read-only from the child account).
    const readOnlyReason = readOnlyConversionActionReason(cid, id, ca.type, ca.owner_customer);
    return {
      id,
      name: ca.name ?? "Untitled",
      type: ca.type ?? "UNKNOWN",
      status: ca.status ?? "UNKNOWN",
      category: ca.category ?? "UNKNOWN",
      includeInConversions: ca.include_in_conversions_metric ?? true,
      primaryForGoal: ca.primary_for_goal ?? true,
      countingType: ca.counting_type ?? "UNKNOWN",
      defaultValue: ca.value_settings?.default_value ?? null,
      alwaysUseDefaultValue: ca.value_settings?.always_use_default_value ?? false,
      mutable: readOnlyReason === null,
      readOnlyReason,
    };
  });
}
