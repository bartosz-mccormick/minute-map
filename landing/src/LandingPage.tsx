import IntroSection from './components/IntroSection'
import MapSection from './components/MapSection'
import { cities } from './data/cities'
import './landing.css'

function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-shell" aria-labelledby="dreams-title">
        <IntroSection cityCount={cities.length} />
        <MapSection cities={cities} />
      </section>

      <section className="about-section" id="about" aria-labelledby="about-title">
        <div className="about-section__inner">
          <p className="about-section__eyebrow">About</p>
          <h2 id="about-title">A simple city entry point for accessible local information.</h2>
          <p>
            Dreams Accessibility Tool helps people open location-specific
            accessibility information through a clear and predictable interface.
            Each city deployment can be linked from the same landing page
            without adding routing, backend logic, or a heavier application
            shell.
          </p>
          <p>
            This draft keeps the structure intentionally small so it can be
            copied into a larger project later with minimal refactoring.
          </p>
        </div>
      </section>

      <footer className="site-footer" aria-labelledby="footer-contacts">
        <div className="site-footer__brand">
          <div className="site-footer__logo-slot" aria-hidden="true"></div>
          <div className="site-footer__brand-copy">
            <p className="site-footer__title">Dreams Accessibility Tool</p>
            <p className="site-footer__text">
              Space reserved for a future logo, short project note, or partner
              attribution.
            </p>
          </div>
        </div>

        <div className="site-footer__contacts">
          <h2 id="footer-contacts">Contacts</h2>
          <ul className="site-footer__contact-list">
            <li>
              <span>M.Sc. Bartosz Pawel McCormick</span>
              <a href="mailto:bartosz.mccormick@tum.de">
                bartosz.mccormick@tum.de
              </a>
            </li>
            <li>
              <span>B.Arch. Margarita Zykova</span>
              <a href="mailto:margarita.zykova@tum.de">
                margarita.zykova@tum.de
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </main>
  )
}

export default LandingPage
