import { Layout } from '../components/Layout'

export function Terms() {
  return (
    <Layout>
      <div className="legal">
        <div className="container-narrow">
          <h1>Terms of Service</h1>
          <p className="last-updated">Last updated: February 12, 2026</p>

          <p>
            These Terms of Service ("Terms") govern your use of OneClaw, an iMessage-based 
            AI assistant service. By using OneClaw, you agree to these Terms.
          </p>

          <h2>1. Service Description</h2>
          <p>
            OneClaw is an AI-powered assistant accessible via iMessage. The service allows 
            you to interact with AI to perform tasks such as reading emails, managing 
            calendars, ordering food, and booking appointments.
          </p>

          <h2>2. Eligibility</h2>
          <p>
            You must be at least 13 years old to use OneClaw. By using the service, you 
            represent that you meet this requirement and have the legal capacity to 
            enter into these Terms.
          </p>

          <h2>3. Account and Access</h2>
          <ul>
            <li>Your iMessage address or phone number serves as your account identifier.</li>
            <li>You are responsible for maintaining the security of your devices and accounts.</li>
            <li>You must not share access to your OneClaw account with others.</li>
          </ul>

          <h2>4. Acceptable Use</h2>
          <p>You agree not to use OneClaw to:</p>
          <ul>
            <li>Violate any laws or regulations</li>
            <li>Send spam, harassment, or abusive content</li>
            <li>Attempt to gain unauthorized access to systems or data</li>
            <li>Interfere with the service's operation</li>
            <li>Use the service for any illegal or harmful purpose</li>
          </ul>

          <h2>5. Third-Party Services</h2>
          <p>
            OneClaw integrates with third-party services (Google, etc.) to provide 
            functionality. Your use of these integrations is also subject to the 
            respective third-party terms and privacy policies. We are not responsible 
            for the availability or accuracy of third-party services.
          </p>

          <h2>6. AI Limitations</h2>
          <p>
            OneClaw uses artificial intelligence to generate responses and perform tasks. 
            While we strive for accuracy, AI responses may sometimes be incorrect or 
            incomplete. You should verify important information independently. OneClaw 
            is not a substitute for professional advice (legal, medical, financial, etc.).
          </p>

          <h2>7. Payments and Subscriptions</h2>
          <p>
            Certain features may require a paid subscription. By subscribing, you 
            authorize us to charge your payment method on a recurring basis. You may 
            cancel your subscription at any time, effective at the end of the current 
            billing period.
          </p>

          <h2>8. Intellectual Property</h2>
          <p>
            OneClaw and its original content, features, and functionality are owned by 
            us and are protected by intellectual property laws. You retain ownership 
            of any content you provide through the service.
          </p>

          <h2>9. Disclaimer of Warranties</h2>
          <p>
            OneClaw is provided "as is" and "as available" without warranties of any kind, 
            either express or implied. We do not guarantee that the service will be 
            uninterrupted, secure, or error-free.
          </p>

          <h2>10. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, OneClaw and its operators shall not 
            be liable for any indirect, incidental, special, consequential, or punitive 
            damages arising from your use of the service, including but not limited to 
            loss of data, revenue, or profits.
          </p>

          <h2>11. Termination</h2>
          <p>
            We may suspend or terminate your access to OneClaw at any time, with or without 
            cause, and with or without notice. You may stop using the service at any time.
          </p>

          <h2>12. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. We will provide 
            notice of significant changes. Your continued use of the service after 
            changes constitutes acceptance of the new Terms.
          </p>

          <h2>13. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws 
            of the State of California, without regard to its conflict of law provisions.
          </p>

          <h2>14. Contact</h2>
          <p>
            If you have questions about these Terms, please contact us at:{' '}
            <a href="mailto:legal@iclaw.app">legal@iclaw.app</a>
          </p>
        </div>
      </div>
    </Layout>
  )
}
