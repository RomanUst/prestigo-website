import { createClient } from '@/lib/supabase/server'
import ProfileForm from '@/components/account/ProfileForm'

export const dynamic = 'force-dynamic'

export default async function AccountProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // user guaranteed non-null — /account/* middleware gate enforces auth (T-58-18)

  const [{ data: profile }, { data: passengers }] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('full_name, phone, account_type, company_name, ico, vat_id')
      .eq('user_id', user!.id)
      .single(),
    supabase
      .from('saved_passengers')
      .select('id, full_name, phone, email, notes, is_default')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: true }),
  ])

  return (
    <ProfileForm
      email={user!.email!}
      profile={profile}
      passengers={passengers ?? []}
    />
  )
}
