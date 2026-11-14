import { ButtonLink } from '../components/ui/Button.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';

export default function NotFoundPage() {
  return (
    <div>
      <PageHeader eyebrow="Lost" title="This path leads nowhere" subtitle="The page you were looking for does not exist." />
      <ButtonLink to="/">Return to the dashboard</ButtonLink>
    </div>
  );
}
