import { ComingSoon } from "../coming-soon";

export default async function TeamPage({ params }: PageProps<"/c/[club]/team">) {
  const { club } = await params;

  return <ComingSoon clubSlug={club} tab="team" />;
}
