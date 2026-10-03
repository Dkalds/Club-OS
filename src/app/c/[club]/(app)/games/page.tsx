import { ComingSoon } from "../coming-soon";

export default async function GamesPage({ params }: PageProps<"/c/[club]/games">) {
  const { club } = await params;

  return <ComingSoon clubSlug={club} tab="games" />;
}
