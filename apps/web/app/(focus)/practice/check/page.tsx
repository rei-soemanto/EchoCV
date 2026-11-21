import { TopBar } from "@/components/top-bar";

import { DeviceCheck } from "./device-check";

export const metadata = { title: "Periksa perangkat · EchoCV" };

export default function DeviceCheckPage() {
  return (
    <>
      <TopBar note="Kalibrasi: sebelum sesi dimulai" />
      <main className="flex flex-1 flex-col">
        <DeviceCheck />
      </main>
    </>
  );
}
