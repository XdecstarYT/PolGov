-- Close the RPC route to the trigger functions.
--
-- handle_new_user() is SECURITY DEFINER so it can write public.profiles on
-- behalf of a brand-new auth user. That is correct for a trigger, but it also
-- meant the function was reachable as POST /rest/v1/rpc/handle_new_user by any
-- caller, including anon. Triggers execute independently of these grants, so
-- revoking EXECUTE closes the RPC route without affecting signup.
--
-- Found by the Supabase security advisor after 0003 was applied.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- owns_game() keeps EXECUTE: it is SECURITY INVOKER and the RLS policies on the
-- child tables call it as the querying role, so authenticated must be able to
-- run it. It leaks nothing — it only answers "do I own this game?" about the
-- caller's own uid.
grant execute on function public.owns_game(uuid) to authenticated;
