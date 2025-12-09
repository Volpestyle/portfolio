import { AdminPageSkeleton } from '../components/AdminPageSkeleton';

export default function Loading() {
  return <AdminPageSkeleton rows={2} withFilters={false} showAction={false} />;
}
