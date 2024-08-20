"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function Contact() {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Handle form submission logic here
  };

  return (
    <>
      <h1 className="text-3xl font-bold mb-6">Contact Me</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block mb-2 text-white">
            Name
          </label>
          <Input
            id="name"
            name="name"
            required
            className="text-black bg-white"
          />
        </div>
        <div>
          <label htmlFor="email" className="block mb-2 text-white">
            Email Address
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            className="text-black bg-white"
          />
        </div>
        <div>
          <label htmlFor="message" className="block mb-2 text-white">
            Message
          </label>
          <Textarea
            id="message"
            name="message"
            required
            className="text-black bg-white"
          />
        </div>
        <Button type="submit" className="bg-white text-black hover:bg-gray-200">
          Send
        </Button>
      </form>
    </>
  );
}
