import { login } from '@/app/demo-login/actions';
import { DemoLoginForm } from '@/components/demo-login-form';

type DemoLoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function DemoLoginPage({ searchParams }: DemoLoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-8">
      <DemoLoginForm action={login} error={error} />
    </main>
  );
}
