'use client';

import { MoreVerticalIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteNotebook, renameNotebook } from '@/app/(app)/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { userMessage } from '@/lib/errors';

type NotebookCardProps = {
  id: string;
  title: string;
  isDemo: boolean;
  updatedAt: string;
  sourceCount: number;
};

export function NotebookCard({ id, title, isDemo, updatedAt, sourceCount }: NotebookCardProps) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(title);
  const [isPending, startTransition] = useTransition();

  function handleCardClick(): void {
    router.push(`/n/${id}`);
  }

  function stopPropagation(event: React.MouseEvent<HTMLElement>): void {
    event.stopPropagation();
  }

  function handleRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await renameNotebook(id, newTitle);
      if (!result.ok) {
        toast.error(userMessage(result.error));
        return;
      }
      setRenameOpen(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteNotebook(id);
      if (!result.ok) {
        toast.error(userMessage(result.error));
        return;
      }
      setDeleteOpen(false);
    });
  }

  return (
    <>
      <Card onClick={handleCardClick} className="cursor-pointer">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="line-clamp-2">
            <Link href={`/n/${id}`} className="hover:underline" onClick={stopPropagation}>
              {title}
            </Link>
          </CardTitle>
          {isDemo ? (
            <Badge variant="secondary">Demo</Badge>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Notebook actions"
                    onClick={stopPropagation}
                  />
                }
              >
                <MoreVerticalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setRenameOpen(true)}>Rename</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {sourceCount} source{sourceCount === 1 ? '' : 's'}
          </p>
        </CardContent>
        <CardFooter>
          <p className="text-muted-foreground text-xs">
            Updated{' '}
            {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
              new Date(updatedAt),
            )}
          </p>
        </CardFooter>
      </Card>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <form onSubmit={handleRename} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Rename notebook</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              maxLength={200}
              disabled={isPending}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending || newTitle.trim().length === 0}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{title}&rdquo;?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            This permanently deletes the notebook and everything in it.
          </p>
          <DialogFooter>
            <Button variant="destructive" disabled={isPending} onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
