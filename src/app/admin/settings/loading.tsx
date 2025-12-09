import { AdminPageSkeleton } from '../components/AdminPageSkeleton';

export default function Loading() {
  return <AdminPageSkeleton rows={3} withFilters={false} showAction />;
}
