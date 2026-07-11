import type { createAdminClient } from "@/lib/supabase/admin";

export type AnonymousAccountEventType =
  | "guest_created"
  | "conversion_requested"
  | "conversion_completed";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function recordAnonymousAccountEvent(
  supabase: AdminClient,
  userId: string,
  eventType: AnonymousAccountEventType,
) {
  const { error } = await supabase
    .from("anonymous_account_events")
    .upsert(
      { user_id: userId, event_type: eventType },
      { onConflict: "user_id,event_type", ignoreDuplicates: true },
    );
  if (error) throw error;
}
