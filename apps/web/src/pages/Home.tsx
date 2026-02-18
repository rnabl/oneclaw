import { Layout } from '../components/Layout'

export function Home() {
  return (
    <Layout>
      {/* Hero */}
      <section className="hero">
        <div className="container">
          <h1>AI Assistant.<br />Right in iMessage.</h1>
          <p className="text-large">
            Text. Setup. Done. No app to download. No passwords to remember. Just iMessage.
          </p>
          <a href="imessage://iclaw@icloud.com" className="hero-cta">
            Start Texting
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <div className="container">
          <h2 style={{ textAlign: 'center' }}>Everything you need.</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📧</div>
              <h3>Email</h3>
              <p>Read, summarize, and send emails without opening an app.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📅</div>
              <h3>Calendar</h3>
              <p>Check your schedule and book meetings via text.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🍕</div>
              <h3>Food</h3>
              <p>Order delivery and make reservations conversationally.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🏌️</div>
              <h3>Golf</h3>
              <p>Book tee times at your favorite courses instantly.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-it-works">
        <div className="container">
          <h2 style={{ textAlign: 'center' }}>How it works.</h2>
          <div className="conversation">
            <div className="message user">
              <div className="message-bubble">Hey</div>
            </div>
            <div className="message assistant">
              <div className="message-bubble">
                Hey! I'm OneClaw 🦞<br /><br />
                What would you like help with?<br /><br />
                1️⃣ Email<br />
                2️⃣ Calendar<br />
                3️⃣ Food<br />
                4️⃣ Golf
              </div>
            </div>
            <div className="message user">
              <div className="message-bubble">1 2</div>
            </div>
            <div className="message assistant">
              <div className="message-bubble">
                Great! Tap to connect your Google account:<br /><br />
                🔗 Sign in with Google
              </div>
            </div>
            <div className="message assistant">
              <div className="message-bubble">
                ✅ Connected!<br /><br />
                Try: "Read my latest emails"
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  )
}
