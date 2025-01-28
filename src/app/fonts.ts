import { Libre_Bodoni } from 'next/font/google';
import { Hanken_Grotesk } from 'next/font/google';

export const libreBodoni = Libre_Bodoni({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-libre-bodoni',
});

export const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-hanken-grotesk',
});
