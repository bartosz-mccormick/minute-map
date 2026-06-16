type IntroSectionProps = {
  cityCount: number
}

function IntroSection({ cityCount }: IntroSectionProps) {
  return (
    <section className="intro-section" aria-labelledby="dreams-title">
      <div className="intro-section__content">
        <p className="intro-section__eyebrow">Dreams Accessibility Tool</p>
        <h1 id="dreams-title">
          Accessible local information, available city by city.
        </h1>
        <p className="intro-section__lead">
          The Dreams Accessibility Tool helps people explore accessible local
          information through a clear city-specific entry point. It is
          currently available in selected cities and offers a direct way to
          open each local application.
        </p>
      </div>
      <div className="intro-section__meta">
        <p className="intro-section__count">
          <span>Current cities</span>
          <strong>{cityCount}</strong>
        </p>
        <a className="intro-section__cta" href="#about">
          Read about the project
        </a>
      </div>
    </section>
  )
}

export default IntroSection
