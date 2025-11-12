import { ContactForm } from './ContactForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Contact - JCV's Portfolio",
  description: 'Get in touch with James Volpe',
  openGraph: {
    title: 'Contact James Volpe',
    description: 'Send a message to James Volpe',
    type: 'website',
  },
};

export default function Contact() {
  return (
    <div className="m-4">
      <h1 className="mb-6 text-3xl font-bold">chat with me (the real one)</h1>
      <ContactForm />
    </div>
  );
}
