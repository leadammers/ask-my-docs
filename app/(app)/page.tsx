import { CreateNotebookDialog } from '@/components/create-notebook-dialog';
import { NotebookCard } from '@/components/notebook-card';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">Setting up your session…</p>
      </main>
    );
  }

  const { data: notebooks } = await supabase
    .from('notebooks')
    .select('id, title, is_demo, updated_at, sources(count)')
    .order('is_demo', { ascending: false })
    .order('updated_at', { ascending: false });

  const list = notebooks ?? [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your notebooks</h1>
        <CreateNotebookDialog />
      </div>

      {list.length === 0 ? (
        <div className="border-border flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-12 text-center">
          <p className="text-foreground font-medium">No notebooks yet</p>
          <p className="text-muted-foreground text-sm">
            Create your first notebook to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((notebook) => (
            <NotebookCard
              key={notebook.id}
              id={notebook.id}
              title={notebook.title}
              isDemo={notebook.is_demo}
              updatedAt={notebook.updated_at}
              sourceCount={notebook.sources[0]?.count ?? 0}
            />
          ))}
        </div>
      )}
    </main>
  );
}
