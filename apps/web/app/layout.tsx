import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, Newsreader } from "next/font/google";

import { PaperSwirls } from "@/components/paper-swirls";
import "./globals.css";

const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"] });
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
});
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "EchoCV",
  description: "Latihan wawancara kerja dengan umpan balik yang tenang.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${hanken.variable} ${newsreader.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="isolate flex min-h-full flex-col">
        <PaperSwirls />
        {children}
      </body>
    </html>
  );
}
