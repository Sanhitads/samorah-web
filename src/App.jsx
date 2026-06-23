import { Routes, Route, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { CartProvider } from './context/CartContext'
import Header from './components/Header'
import Footer from './components/Footer'
import AnnouncementBar from './components/AnnouncementBar'
import CartDrawer from './components/CartDrawer'
import Home from './pages/Home'
import Collections from './pages/Collections'
import ChapterListing from './pages/ChapterListing'
import ProductDetail from './pages/ProductDetail'
import OurStory from './pages/OurStory'
import MeetMakers from './pages/MeetMakers'
import CraftIngredients from './pages/CraftIngredients'
import Contact from './pages/Contact'
import Bundle from './pages/Bundle'
import Archive from './pages/Archive'
import ProductCare from './pages/ProductCare'
import AirFreshner from './pages/AirFreshner'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsConditions from './pages/TermsConditions'
import ReturnRefund from './pages/ReturnRefund'
import ShippingPolicy from './pages/ShippingPolicy'
import FAQ from './pages/FAQ'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  return (
    <CartProvider>
      <ScrollToTop />
      <AnnouncementBar />
      <Header />
      <CartDrawer />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:slug" element={<ChapterListing />} />
          <Route path="/product/:slug" element={<ProductDetail />} />
          <Route path="/about/our-story" element={<OurStory />} />
          <Route path="/about/meet-the-makers" element={<MeetMakers />} />
          <Route path="/about/craft-ingredients" element={<CraftIngredients />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/bundles" element={<Bundle />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/care-safety" element={<ProductCare />} />
          <Route path="/shop/room-sprays" element={<AirFreshner />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsConditions />} />
          <Route path="/returns" element={<ReturnRefund />} />
          <Route path="/shipping" element={<ShippingPolicy />} />
          <Route path="/faq" element={<FAQ />} />
        </Routes>
      </main>
      <Footer />
    </CartProvider>
  )
}
