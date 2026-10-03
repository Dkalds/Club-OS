import { ComingSoon } from "../coming-soon";

export default async function WayPage({ params }: PageProps<"/c/[club]/way">) {
  const { club } = await params;

  return <ComingSoon clubSlug={club} tab="way" />;
}
