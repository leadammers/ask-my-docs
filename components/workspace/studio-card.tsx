'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type StudioCardProps = { title: string; description: string; children: React.ReactNode };

/**
 * The seam T09/T11/T12 build into: one card, whose body each of those tasks
 * replaces — the drawer around it does not change.
 */
export function StudioCard({ title, description, children }: StudioCardProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
