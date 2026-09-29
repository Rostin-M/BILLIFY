import { Faq } from "./Faq";
import { Features } from "./Features";
import { FinalCta } from "./FinalCta";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";
import { Pricing } from "./Pricing";
import { ProblemSolution } from "./ProblemSolution";

/** Landing pública de BILLIFY (visitantes sin sesión en "/"). */
export function Landing() {
  return (
    <div className="landing bg-ala-mist dark:bg-ala-night min-h-screen overflow-x-clip text-slate-900 dark:text-white">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900"
      >
        Saltar al contenido
      </a>
      <LandingHeader />
      <main id="contenido">
        <Hero />
        <ProblemSolution />
        <Features />
        <HowItWorks />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
