import { notFound } from 'next/navigation';
import { notebookIdSchema } from '@/lib/notebooks';
import { createClient } from '@/lib/supabase/server';

export default async function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = notebookIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: notebook } = await supabase
    .from('notebooks')
    .select('id, title, user_id, is_demo')
    .eq('id', parsedId.data)
    .maybeSingle();
  if (!notebook || (notebook.user_id !== user.id && !notebook.is_demo)) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-2 p-8">
      <h1 className="text-2xl font-semibold">{notebook.title}</h1>
      <p className="text-muted-foreground text-sm">Sources and chat land here in a later task.</p>
    </main>
  );
}
