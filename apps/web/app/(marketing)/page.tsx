import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">EchoCV</h1>
      <p className="text-lg text-muted-foreground">
        AI interview coach for Indonesian IT students and fresh graduates.
        Practise answering in Indonesian or English and get feedback on eye
        contact, posture, filler words, pace, voice and answer content.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/practice" className={buttonVariants({ size: "lg" })}>
          Start practice
        </Link>
        <Link
          href="/upload"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Upload a video
        </Link>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "ghost", size: "lg" })}
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
