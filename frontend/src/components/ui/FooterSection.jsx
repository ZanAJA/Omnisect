import { useReducedMotion, motion } from 'motion/react';

const FOOTER_LINKS = [
  { title: 'Overview', page: 'overview' },
  { title: 'History', page: 'history' },
  { title: 'Scope', page: 'scope' },
  { title: 'Configure', page: 'config' },
  { title: 'Target', page: 'target' },
  { title: 'Auth', page: 'auth' },
];

const REFERENCE_LINKS = [
  { title: 'ProjectDiscovery', href: 'https://docs.projectdiscovery.io/' },
  { title: 'Nmap', href: 'https://nmap.org/book/man.html' },
  { title: 'OWASP', href: 'https://owasp.org/www-project-web-security-testing-guide/' },
];

export default function FooterSection({ onNavigate }) {
  const shouldReduceMotion = useReducedMotion();
  const Wrapper = shouldReduceMotion ? 'div' : motion.div;

  return (
    <footer className="site-footer">
      <Wrapper
        {...(!shouldReduceMotion && {
          initial: { opacity: 0 },
          whileInView: { opacity: 1 },
          viewport: { once: true, amount: 0.2 },
          transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
        })}
      >
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <p className="site-footer-wordmark">Omnisect</p>
            <p className="site-footer-description">
              Scoped reconnaissance and evidence in one workspace.
            </p>
            <p className="site-footer-permission">Authorized testing only.</p>
          </div>

          <div className="site-footer-sections">
            <section className="site-footer-section">
              <h3>Workspace</h3>
              <ul>
                {FOOTER_LINKS.map((link) => (
                  <li key={link.title}>
                    <button type="button" onClick={() => onNavigate(link.page)}>
                      {link.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="site-footer-section">
              <h3>References</h3>
              <ul>
                {REFERENCE_LINKS.map((link) => (
                  <li key={link.title}>
                    <a href={link.href} target="_blank" rel="noreferrer">
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div className="site-footer-meta">
          <span>&copy; {new Date().getFullYear()} Omnisect</span>
          <span>Scope first. Evidence ready.</span>
        </div>
      </Wrapper>
    </footer>
  );
}
