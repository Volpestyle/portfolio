'use client';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader } from 'lucide-react';

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'success' | 'error' | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, message }),
      });

      if (response.ok) {
        setSubmitStatus('success');
        setName('');
        setEmail('');
        setMessage('');
      } else {
        setSubmitStatus('error');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">Contact Me</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-2 block text-white">
            Name
          </label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="bg-white text-black"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-2 block text-white">
            Email Address
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-white text-black"
          />
        </div>
        <div>
          <label htmlFor="message" className="mb-2 block text-white">
            Message
          </label>
          <Textarea
            id="message"
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            className="bg-white text-black"
          />
        </div>
        <Button type="submit" className="bg-white text-black hover:bg-gray-200" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            'Send'
          )}
        </Button>
      </form>
      {submitStatus === 'success' && <p className="mt-4 text-green-500">Message sent successfully!</p>}
      {submitStatus === 'error' && <p className="mt-4 text-red-500">Failed to send message. Please try again later.</p>}
    </>
  );
}
