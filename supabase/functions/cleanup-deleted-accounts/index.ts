// Supabase Edge Function: cleanup-deleted-accounts
// Invoked on a schedule (e.g. daily via pg_cron or Supabase scheduled functions).
// Finds user_profiles rows where pending_deletion = true AND deletion_date <= now(),
// then permanently deletes each account via the Supabase Admin API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (_req: Request): Promise<Response> => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find all accounts past their deletion deadline
    const { data: profiles, error: fetchError } = await admin
      .from("user_profiles")
      .select("user_id, deletion_date")
      .eq("pending_deletion", true)
      .lte("deletion_date", new Date().toISOString());

    if (fetchError) {
      console.error("Failed to fetch pending deletions:", fetchError.message);
      return Response.json({ error: fetchError.message }, { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      return Response.json({ deleted: 0, message: "No accounts due for deletion." });
    }

    const results: { userId: string; success: boolean; error?: string }[] = [];

    for (const profile of profiles) {
      const userId: string = profile.user_id;
      try {
        // Delete user data in dependency order before removing the auth user
        await admin.from("user_card_progress").delete().eq("user_id", userId);
        await admin.from("study_sessions").delete().eq("user_id", userId);
        await admin.from("cards").delete().eq("user_id", userId);
        await admin.from("sets").delete().eq("user_id", userId);
        await admin.from("folders").delete().eq("user_id", userId);
        await admin.from("user_stats").delete().eq("user_id", userId);
        await admin.from("user_profiles").delete().eq("user_id", userId);

        // Remove the auth user (hard delete from auth.users)
        const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
        if (deleteError) throw deleteError;

        results.push({ userId, success: true });
        console.log(`Deleted user ${userId}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ userId, success: false, error: message });
        console.error(`Failed to delete user ${userId}:`, message);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return Response.json({
      deleted: successCount,
      failed: results.length - successCount,
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Unhandled error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
});
