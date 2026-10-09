import { Suspense } from "react";
import { redirect } from "next/navigation";
import { control, Field } from "@/components/bits";
import { WindowPicker } from "@/components/window-picker";
import { saveServiceAction } from "@/lib/actions";
import { requireActor } from "@/lib/actor";
import { categoryTree, teacherByUser } from "@/lib/queries";
import { one } from "@/lib/utils";

export default function NewServicePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <Suspense fallback={<p>Loading the form…</p>}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  const teacher = await teacherByUser(actor.id);
  if (!teacher) redirect("/teach/onboarding");
  const categories = (await categoryTree()).filter((category) => category.vertical === "wellness" && !category.parentId);
  const error = one((await searchParams).error);
  return (
    <div>
      <h1 className="display text-5xl">New visit</h1>
      <p className="mt-2 max-w-xl text-sm text-ink/70">A private hour, or a room with a headcount. Hours repeat each week.</p>
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      <form action={saveServiceAction} className="mt-6 max-w-2xl space-y-4">
        <Field label="Title"><input name="title" required className={control} placeholder="Therapeutic massage" /></Field>
        <Field label="Description"><textarea name="description" className={control} rows={3} placeholder="What the hour is for. Leave medical history off this form." /></Field>
        <Field label="Category">
          <select name="categoryId" className={control} required>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
        <Field label="Kind">
          <select name="kind" className={control} defaultValue="appointment">
            <option value="appointment">Private appointment</option>
            <option value="access">Shared slot with a capacity</option>
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First length (minutes)"><input name="minutesA" type="number" defaultValue={60} className={control} /></Field>
          <Field label="First price ($)"><input name="priceA" type="number" step="1" defaultValue={90} className={control} /></Field>
          <Field label="Second length (minutes)"><input name="minutesB" type="number" defaultValue={90} className={control} /></Field>
          <Field label="Second price ($)"><input name="priceB" type="number" step="1" defaultValue={120} className={control} /></Field>
        </div>
        <p className="text-sm text-ink/60">Shared slots use the room price and length below. Leave the second private price blank if you offer one length.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Slot length (minutes)"><input name="slotMinutes" type="number" defaultValue={45} className={control} /></Field>
          <Field label="People per slot"><input name="capacity" type="number" defaultValue={6} className={control} /></Field>
          <Field label="Slot price ($)"><input name="accessPrice" type="number" defaultValue={28} className={control} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Buffer (minutes)"><input name="bufferMinutes" type="number" defaultValue={15} className={control} /></Field>
          <Field label="Lead time (hours)"><input name="leadTimeHours" type="number" defaultValue={2} className={control} /></Field>
          <Field label="Cancel window (hours)"><input name="cancellationHours" type="number" defaultValue={24} className={control} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Add-on"><input name="addonName1" className={control} placeholder="Hot stones" /></Field>
          <Field label="Add-on price ($)"><input name="addonPrice1" type="number" className={control} placeholder="25" /></Field>
          <Field label="Extra minutes"><input name="addonMinutes1" type="number" defaultValue={0} className={control} /></Field>
          <Field label="Add-on"><input name="addonName2" className={control} placeholder="CBD oil" /></Field>
          <Field label="Add-on price ($)"><input name="addonPrice2" type="number" className={control} placeholder="20" /></Field>
          <Field label="Extra minutes"><input name="addonMinutes2" type="number" defaultValue={0} className={control} /></Field>
        </div>
        <Field label="Weekly hours"><WindowPicker /></Field>
        <Field label="Address"><input name="address" className={control} placeholder="1200 Silver Lake Blvd" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Place name"><input name="place" className={control} /></Field>
          <Field label="Neighborhood"><input name="neighborhood" className={control} defaultValue="Silver Lake" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="waiverRequired" value="1" /> Require the studio liability waiver before the first booking</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" value="1" defaultChecked /> Publish</label>
        <button className="rounded-full bg-ink px-5 py-2.5 text-sm text-paper">Save visit</button>
      </form>
    </div>
  );
}
