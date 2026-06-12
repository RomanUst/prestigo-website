'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Note: synchronous helpers MUST live in a separate non-'use server' file.
// A 'use server' module may only export async functions.

// ---------------------------------------------------------------------------
// ACCT-02, ACCT-03: updateProfile
// ---------------------------------------------------------------------------

/**
 * Update the current user's customer_profiles row.
 *
 * Ownership is NEVER trusted from the caller: any user_id in FormData is
 * stripped; ownership is derived from supabase.auth.getUser() only (T-58-13,
 * T-58-14). Fields are named explicitly — no raw FormData spread.
 */
export async function updateProfile(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated.' }

  // Explicit field extraction — never spread formData (T-58-14 mass-assignment guard)
  const full_name = formData.get('full_name') as string
  const phone = formData.get('phone') as string
  const account_type = formData.get('account_type') as string
  const company_name = (formData.get('company_name') as string) || null
  const ico = (formData.get('ico') as string) || null
  const vat_id = (formData.get('vat_id') as string) || null

  const { error } = await supabase
    .from('customer_profiles')
    .update({ full_name, phone, account_type, company_name, ico, vat_id })
    .eq('user_id', user.id) // RLS enforces this; explicit eq is the additional application-layer guard

  if (error) return { error: 'Something went wrong. Please try again.' }

  try {
    revalidatePath('/account/profile')
  } catch {
    // revalidatePath throws outside Next.js request scope (e.g. in tests)
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// ACCT-02: addPassenger
// ---------------------------------------------------------------------------

/**
 * Insert a saved_passengers row owned by the current session user.
 *
 * user_id is ALWAYS derived from the session (T-58-13). A caller-supplied
 * user_id in FormData is silently discarded.
 */
export async function addPassenger(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated.' }

  const full_name = formData.get('full_name') as string
  const phone = formData.get('phone') as string
  const email = (formData.get('email') as string) || null
  const notes = (formData.get('notes') as string) || null
  const is_default = formData.get('is_default') === 'true'

  // If this passenger should be the default, clear existing defaults first
  // (T-58-17: partial unique index is the DB backstop; we pre-clear to avoid
  //  hitting the unique-violation in the normal case)
  if (is_default) {
    await supabase
      .from('saved_passengers')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true)
  }

  const { error } = await supabase
    .from('saved_passengers')
    .insert({ user_id: user.id, full_name, phone, email, notes, is_default })

  if (error) {
    // Unique-violation on partial index (race condition after the clear) →
    // user-facing message
    if (error.code === '23505') {
      return { error: 'Another default passenger already exists. Please try again.' }
    }
    return { error: 'Something went wrong. Please try again.' }
  }

  try {
    revalidatePath('/account/profile')
  } catch {
    // revalidatePath throws outside Next.js request scope (e.g. in tests)
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// ACCT-02: updatePassenger
// ---------------------------------------------------------------------------

/**
 * Update a saved_passengers row owned by the current session user.
 *
 * The write is scoped to both id AND session user_id — the eq on user_id is
 * the application-layer backstop on top of RLS (T-58-13). Fields are named
 * explicitly (T-58-14).
 */
export async function updatePassenger(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated.' }

  const id = formData.get('id') as string
  const full_name = formData.get('full_name') as string
  const phone = formData.get('phone') as string
  const email = (formData.get('email') as string) || null
  const notes = (formData.get('notes') as string) || null
  const is_default = formData.get('is_default') === 'true'

  // If setting as default, clear other defaults first
  if (is_default) {
    await supabase
      .from('saved_passengers')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true)
  }

  const { error } = await supabase
    .from('saved_passengers')
    .update({ full_name, phone, email, notes, is_default })
    .eq('id', id)
    .eq('user_id', user.id) // own-row backstop on top of RLS

  if (error) {
    if (error.code === '23505') {
      return { error: 'Another default passenger already exists. Please try again.' }
    }
    return { error: 'Something went wrong. Please try again.' }
  }

  try {
    revalidatePath('/account/profile')
  } catch {
    // revalidatePath throws outside Next.js request scope (e.g. in tests)
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// ACCT-02: deletePassenger
// ---------------------------------------------------------------------------

/**
 * Delete a saved_passengers row owned by the current session user.
 *
 * Scoped to BOTH id AND session user_id so a forged id cannot delete another
 * user's passenger (T-58-13). The user_id in FormData is never read.
 */
export async function deletePassenger(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated.' }

  const id = formData.get('id') as string

  const { error } = await supabase
    .from('saved_passengers')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id) // own-row backstop: forged user_id cannot widen scope

  if (error) return { error: 'Something went wrong. Please try again.' }

  try {
    revalidatePath('/account/profile')
  } catch {
    // revalidatePath throws outside Next.js request scope (e.g. in tests)
  }

  return { success: true }
}
