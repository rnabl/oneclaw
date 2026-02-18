import { Layout } from '../components/Layout'

export function Privacy() {
  return (
    <Layout>
      <div className="legal">
        <div className="container-narrow">
          <h1>Privacy Policy</h1>
          <p className="last-updated">Last updated: February 12, 2026</p>

          <p>
            OneClaw ("we", "our", or "us") is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, and safeguard your 
            information when you use our iMessage-based AI assistant service.
          </p>

          <h2>Information We Collect</h2>
          <p>When you use OneClaw, we collect:</p>
          <ul>
            <li><strong>Phone number or iMessage address</strong> — Used to identify your account and send responses.</li>
            <li><strong>Messages you send</strong> — Processed to generate AI responses. We do not store conversation history long-term.</li>
            <li><strong>OAuth tokens</strong> — When you connect services like Gmail or Google Calendar, we securely store access tokens to perform actions on your behalf.</li>
            <li><strong>Usage data</strong> — Basic analytics about how you use the service (features used, message counts).</li>
          </ul>

          <h2>How We Use Your Information</h2>
          <ul>
            <li>To provide and improve our AI assistant service</li>
            <li>To authenticate with third-party services you connect (Gmail, Calendar)</li>
            <li>To process your requests (reading emails, booking appointments, etc.)</li>
            <li>To communicate service updates or respond to support inquiries</li>
          </ul>

          <h2>Third-Party Services</h2>
          <p>
            When you connect external accounts (Google, etc.), we access only the data 
            necessary to fulfill your requests. We do not sell or share your data with 
            third parties for advertising purposes.
          </p>
          <p>We use the following third-party services:</p>
          <ul>
            <li><strong>Google APIs</strong> — For Gmail and Calendar access (governed by Google's privacy policy)</li>
            <li><strong>Supabase</strong> — For secure data storage</li>
            <li><strong>Anthropic</strong> — For AI processing (messages are processed but not stored by Anthropic)</li>
            <li><strong>Stripe</strong> — For payment processing (if applicable)</li>
          </ul>

          <h2>Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your data, 
            including encryption in transit and at rest. OAuth tokens are stored 
            securely and never exposed in logs or to unauthorized parties.
          </p>

          <h2>Data Retention</h2>
          <p>
            We retain your account information while your account is active. 
            Conversation data is processed in real-time and not stored long-term. 
            You can request deletion of your data at any time by contacting us.
          </p>

          <h2>Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Disconnect third-party services at any time</li>
          </ul>

          <h2>Children's Privacy</h2>
          <p>
            OneClaw is not intended for use by individuals under the age of 13. 
            We do not knowingly collect personal information from children.
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify 
            you of any changes by posting the new policy on this page and updating 
            the "Last updated" date.
          </p>

          <h2>Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at:{' '}
            <a href="mailto:privacy@iclaw.app">privacy@iclaw.app</a>
          </p>
        </div>
      </div>
    </Layout>
  )
}
