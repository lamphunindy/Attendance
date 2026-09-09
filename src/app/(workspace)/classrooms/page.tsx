import { Dashboard } from '@/components/dashboard/dashboard';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <Dashboard mode="classrooms" filters={await searchParams} />;
}
