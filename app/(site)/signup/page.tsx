import { SignupForm } from "@/components/auth-forms";
import { Panel } from "@/components/bits";
import { googleAuthConfigured } from "@/lib/env";

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="display text-5xl">Create an account</h1>
      <p className="mt-2 text-ink/70">Students can book right away. Teachers finish a short studio profile and wait for approval.</p>
      <Panel className="mt-6">
        <SignupForm google={googleAuthConfigured()} />
      </Panel>
    </div>
  );
}
