// Fixture: one instance of every en_leak_static.mjs rule variant.
// Never import this file from production code — test fixture only.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { redirect } from 'next/navigation'

function CustomField(props: { label: string }) {
  return <span>{props.label}</span>
}

export default function Leaky({ slug }: { slug: string }) {
  redirect('/dashboard')
  const router = useRouter()
  return (
    <div>
      <p>Book your ride now</p>
      <input placeholder="Enter your destination" />
      <button aria-label="Close the navigation menu">X</button>
      <img alt="Mercedes photo of a black executive car" />
      <span title="Learn more about our pricing">i</span>
      <CustomField label="Custom label text goes here" />
      <a href="/about">Learn more</a>
      <a href={`/routes/${slug}`}>Explore routes</a>
      <Link href="/home">Home</Link>
      {router ? null : null}
    </div>
  )
}
