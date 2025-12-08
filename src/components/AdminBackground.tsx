'use client';

import Image from 'next/image';

/**
 * Admin background component - uses the same background image as main site
 * but without the scrolling animation
 */
export function AdminBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
      style={{ backfaceVisibility: 'hidden' }}
    >
      <Image
        src="/images/me-bg.png"
        alt=""
        fill
        priority
        quality={85}
        sizes="100vw"
        className="object-cover object-center"
      />
    </div>
  );
}
