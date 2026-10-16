import { leadAction } from "@/lib/actions";

export default function ImportPage() {
  return (
    <div>
      <h1 className="display text-5xl">Import leads</h1>
      <p className="mt-2 max-w-xl text-sm text-ink/70">CSV uses the 36 official columns, including lead_id and website. Matching lead_id or website domain updates the row. next_step_due stays in the app and is left alone when the sheet omits it.</p>
      <form action={leadAction} className="mt-4 space-y-3">
        <input type="hidden" name="command" value="import" />
        <input type="file" name="file" accept=".csv,text/csv" required />
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Import</button>
      </form>
    </div>
  );
}
