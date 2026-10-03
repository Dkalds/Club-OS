import { ComingSoon } from "../coming-soon";

export default async function TrainPage({ params }: PageProps<"/c/[club]/train">) {
  const { club } = await params;

  return <ComingSoon clubSlug={club} tab="train" />;
}
