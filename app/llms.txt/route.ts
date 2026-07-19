import { buildLlmsTxt } from '@/lib/llms-content'
import { loadLlmsData } from '@/lib/llms-data'

// Regenerated hourly so prices always match the pricing DB (route pages
// revalidate on the same source).
export const revalidate = 3600

export async function GET() {
  const data = await loadLlmsData()
  return new Response(buildLlmsTxt(data), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
