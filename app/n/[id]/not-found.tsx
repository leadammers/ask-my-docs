import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { userMessage } from '@/lib/errors';

/** A notebook that does not exist and one that is not yours are the same screen. */
export default function NotebookNotFound() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">{userMessage('not_found')}</h1>
      <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
        Back to notebooks
      </Button>
    </main>
  );
}
