import Link from 'next/link'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export default function NotFound() {
  return (
    <main id="main-content">
      <Nav />

      <section className="bg-anthracite min-h-[70vh] flex items-center pt-16">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-24 md:py-32">
          <p className="label mb-6">404</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[60px] max-w-xl mb-6">
            This road doesn't<br />
            <span className="display-italic">lead anywhere.</span>
          </h1>
          <p className="body-text text-[13px] max-w-md mb-12" style={{ lineHeight: '1.9' }}>
            The page you're looking for doesn't exist — but your transfer still can.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book a Transfer</a>
            <a href="/services" className="btn-ghost">View Services</a>
            <Link href="/" className="btn-ghost">Back to Home</Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
