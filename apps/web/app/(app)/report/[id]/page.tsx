import { PlaceholderPage } from "@/components/placeholder-page";

export default async function ReportPage(props: PageProps<"/report/[id]">) {
  const { id } = await props.params;
  return (
    <PlaceholderPage
      title="Laporan sesi"
      description={`Skor dan umpan balik dengan stempel waktu untuk sesi ${id}.`}
    />
  );
}
