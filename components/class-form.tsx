"use client";

import { useActionState, useState } from "react";
import { createClassAction } from "@/lib/actions";
import { CLASS_FORMATS, FORMAT_LABELS, LEVEL_LABELS, NEIGHBORHOODS, SKILL_LEVELS, type ClassFormat, type SkillLevel } from "@/lib/constants";
import { ScheduleComposer } from "@/components/schedule-composer";
import { control } from "@/components/bits";

type Category = { id: string; name: string; parentId: string | null };

export function ClassForm({
  teacherId,
  categories,
  defaultStart,
  classId,
  initial,
}: {
  teacherId: string;
  categories: Category[];
  defaultStart: string;
  classId?: string;
  initial?: {
    title?: string;
    description?: string;
    priceSession?: string;
    priceSeries?: string;
    maxSize?: number;
    duration?: number;
    skillLevel?: string;
    format?: string;
    delivery?: string;
    address?: string;
    neighborhood?: string;
    venue?: string;
    virtualLink?: string;
    categoryId?: string;
  };
}) {
  const [state, action, pending] = useActionState(createClassAction, null);
  const [delivery, setDelivery] = useState(initial?.delivery ?? "in_person");
  const parents = categories.filter((category) => !category.parentId);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? parents[0]?.id ?? "");
  const children = categories.filter((category) => category.parentId === categoryId);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <input type="hidden" name="teacherId" value={teacherId} />
      {classId ? <input type="hidden" name="classId" value={classId} /> : null}
      <div className="space-y-4">
        {state?.error ? <p className="rounded-2xl bg-clay/10 px-3 py-2 text-sm text-clay">{state.error}</p> : null}
        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required defaultValue={initial?.title} className={`${control} mt-1 display text-2xl`} placeholder="Scene study" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Description</span>
          <textarea name="description" required defaultValue={initial?.description} className={`${control} mt-1 min-h-28`} placeholder="What happens in the room." />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Category
            <select name="categoryId" className={`${control} mt-1`} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {parents.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Subcategory
            <select name="subcategoryId" className={`${control} mt-1`} defaultValue="">
              <option value="">None</option>
              {children.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Level
            <select name="skillLevel" className={`${control} mt-1`} defaultValue={initial?.skillLevel ?? "all_levels"}>
              {SKILL_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {LEVEL_LABELS[level as SkillLevel]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Format
            <select name="format" className={`${control} mt-1`} defaultValue={initial?.format ?? "drop_in"}>
              {CLASS_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {FORMAT_LABELS[format as ClassFormat]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Drop-in price
            <input name="priceSession" inputMode="decimal" defaultValue={initial?.priceSession ?? "32"} className={`${control} mt-1`} placeholder="32" />
          </label>
          <label className="text-sm">
            Series price
            <input name="priceSeries" inputMode="decimal" defaultValue={initial?.priceSeries ?? ""} className={`${control} mt-1`} placeholder="Optional" />
          </label>
          <label className="text-sm">
            Duration (minutes)
            <input name="duration" type="number" defaultValue={initial?.duration ?? 90} className={`${control} mt-1`} />
          </label>
          <label className="text-sm">
            Class size
            <input name="maxSize" type="number" defaultValue={initial?.maxSize ?? 12} className={`${control} mt-1`} />
          </label>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="seriesBooking" /> Students can book the whole series
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="firstFree" /> First class free
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="waitlist" defaultChecked /> Waitlist when full
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="publish" defaultChecked /> Publish
          </label>
        </div>
        <details className="rounded-2xl bg-sand/60 p-3 text-sm">
          <summary className="cursor-pointer font-medium">Outcomes, prerequisites, what to bring</summary>
          <div className="mt-3 grid gap-3">
            <textarea name="outcomes" className={control} placeholder="What students leave able to do" />
            <textarea name="prerequisites" className={control} placeholder="Prerequisites" />
            <textarea name="whatToBring" className={control} placeholder="What to bring" />
          </div>
        </details>
        <div className="space-y-3">
          <div className="flex gap-2 text-sm">
            {(["in_person", "virtual"] as const).map((option) => (
              <button key={option} type="button" onClick={() => setDelivery(option)} className={`rounded-full px-3 py-1.5 ${delivery === option ? "bg-ink text-paper" : "bg-white ring-1 ring-line"}`}>
                {option === "in_person" ? "In person" : "Virtual"}
              </button>
            ))}
          </div>
          <input type="hidden" name="delivery" value={delivery} />
          {delivery === "virtual" ? (
            <input name="virtualLink" defaultValue={initial?.virtualLink} className={control} placeholder="https://meet.example/room" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="venue" defaultValue={initial?.venue} className={control} placeholder="Studio name" />
              <input name="address" required defaultValue={initial?.address} className={control} placeholder="Street address" />
              <select name="neighborhood" className={control} defaultValue={initial?.neighborhood ?? "Silver Lake"}>
                {NEIGHBORHOODS.map((place) => (
                  <option key={place.name}>{place.name}</option>
                ))}
              </select>
              <input name="zip" className={control} placeholder="90026" defaultValue="90026" />
              <input type="hidden" name="city" value="Los Angeles" />
            </div>
          )}
        </div>
        <button disabled={pending} className="rounded-full bg-clay px-5 py-3 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "Saving…" : classId ? "Save changes" : "Save class"}
        </button>
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        {classId ? <input type="hidden" name="scheduleMode" value="" /> : <ScheduleComposer defaultStart={defaultStart} duration={initial?.duration ?? 90} />}
      </aside>
    </form>
  );
}
