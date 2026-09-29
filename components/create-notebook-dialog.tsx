'use client';

import { PlusIcon } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createNotebook } from '@/app/(app)/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { userMessage } from '@/lib/errors';

export function CreateNotebookDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('Untitled notebook');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createNotebook(title);
      if (!result.ok) {
        toast.error(userMessage(result.error));
        return;
      }
      setOpen(false);
      setTitle('Untitled notebook');
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        New notebook
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New notebook</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Notebook title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            disabled={isPending}
          />
          <DialogFooter>
            <Button type="submit" disabled={isPending || title.trim().length === 0}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
