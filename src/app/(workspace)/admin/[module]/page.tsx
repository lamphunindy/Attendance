import { ModulePage } from '@/components/admin/module-page';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  return <ModulePage module={(await params).module} filters={await searchParams} />;
}
