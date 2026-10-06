import { PlaceholderPage } from "@/components/placeholder-page";

export default async function ReportPage(props: PageProps<"/report/[id]">) {
  const { id } = await props.params;
  return (
    <PlaceholderPage
      title={`Report ${id}`}
      description="Scores and time-stamped feedback for one session."
    />
  );
}
