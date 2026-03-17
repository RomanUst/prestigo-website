import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import BookingSection from '@/components/BookingSection'
import HowItWorks from '@/components/HowItWorks'
import Services from '@/components/Services'
import Fleet from '@/components/Fleet'
import Routes from '@/components/Routes'
import Testimonials from '@/components/Testimonials'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <BookingSection />
      <HowItWorks />
      <Services />
      <Fleet />
      <Routes />
      <Testimonials />
      <Footer />
    </main>
  )
}
