import { ForgotForm } from "@/components/auth-forms";
import { Panel } from "@/components/bits";

export default function ForgotPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="display text-5xl">Reset password</h1>
      <Panel className="mt-6"><ForgotForm /></Panel>
    </div>
  );
}
