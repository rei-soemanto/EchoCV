import { TopBar } from "@/components/top-bar";

import { DeviceCheck } from "./device-check";

export const metadata = { title: "Periksa perangkat · EchoCV" };

export default async function DeviceCheckPage(props: PageProps<"/practice/check">) {
  const { session } = await props.searchParams;
  return (
    <>
      <TopBar note="Kalibrasi: sebelum sesi dimulai" />
      <main className="flex flex-1 flex-col">
        <DeviceCheck sessionId={typeof session === "string" ? session : undefined} />
      </main>
    </>
  );
}
