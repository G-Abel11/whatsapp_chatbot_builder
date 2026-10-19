import { BuilderView } from '@/components/builder/builder-view';

export const metadata = { title: 'Flow Builder' };

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>;
}) {
  const { flow } = await searchParams;
  return <BuilderView flowId={flow} />;
}
