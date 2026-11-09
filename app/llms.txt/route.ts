import { buildLlmsTxt } from '@/lib/llms-content'
import { loadLlmsData } from '@/lib/llms-data'
import { getCancellationPolicy } from '@/lib/cancellation-settings'

// Regenerated hourly so prices always match the pricing DB (route pages
// revalidate on the same source). Cancellation numbers come from the admin settings.
export const revalidate = 3600

export async function GET() {
  const [data, policy] = await Promise.all([loadLlmsData(), getCancellationPolicy()])
  return new Response(buildLlmsTxt(data, policy), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
