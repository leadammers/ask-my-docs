import { login } from "@/app/demo-login/actions";

type DemoLoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function DemoLoginPage({ searchParams }: DemoLoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-8">
      <form action={login} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-xl font-semibold">Enter the demo password</h1>
        {error === "rate_limited" ? (
          <p className="text-destructive text-sm">
            Too many attempts. Please wait a few minutes and try again.
          </p>
        ) : error ? (
          <p className="text-destructive text-sm">That password isn&apos;t correct.</p>
        ) : null}
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          autoFocus
          required
          maxLength={200}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
