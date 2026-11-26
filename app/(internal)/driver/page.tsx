import { redirect } from 'next/navigation'

// Phase 94 plan 94-06 (D-02): the cabinet root is the Rides tab. Signed-out visitors are sent on to the sign-in page
// by that page's own gate.
export default function DriverIndexPage() {
  redirect('/driver/rides')
}
