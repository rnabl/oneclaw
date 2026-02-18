import { Link } from 'react-router-dom'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <>
      <nav>
        <Link to="/" className="nav-logo">OneClaw</Link>
      </nav>
      
      <main>{children}</main>
      
      <footer>
        <div>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
          <a href="mailto:hello@iclaw.app">Contact</a>
        </div>
        <p className="footer-copyright">
          © {new Date().getFullYear()} OneClaw. All rights reserved.
        </p>
      </footer>
    </>
  )
}
