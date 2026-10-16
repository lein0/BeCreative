import { Suspense } from "react";
import { roleAction } from "@/lib/actions";
import { Panel } from "@/components/bits";
import { ROLES } from "@/lib/constants";
import { listUsers } from "@/lib/queries";

export default function UsersPage() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const people = await listUsers();
  return (
    <div>
      <h1 className="display text-5xl">Users</h1>
      <div className="mt-4 space-y-3">
        {people.map((person) => (
          <Panel key={person.id}>
            <form action={roleAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="userId" value={person.id} />
              <span className="min-w-48">{person.name}<span className="block text-xs text-ink/50">{person.email}</span></span>
              {ROLES.map((role) => (
                <label key={role} className="text-sm"><input type="checkbox" name="role" value={role} defaultChecked={person.roles.includes(role)} /> {role}</label>
              ))}
              <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper">Save roles</button>
            </form>
          </Panel>
        ))}
      </div>
    </div>
  );
}
