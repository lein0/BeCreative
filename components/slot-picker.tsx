"use client";

import { useMemo, useState } from "react";
import { bookVisitAction } from "@/lib/actions";

export type PickerSlot = { startsAt: string; localDate: string; time: string; left?: number; slackMinutes?: number };
export type PickerOption = { id: string; label: string; minutes: number; priceCents: number; slots: PickerSlot[] };
export type PickerAddon = { id: string; name: string; priceCents: number; minutes: number };

function clock(time: string) {
  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute} ${suffix}`;
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export function SlotPicker({
  kind,
  serviceId,
  slug,
  options,
  slots,
  addons,
  payWith,
  policy,
}: {
  kind: "appointment" | "access";
  serviceId: string;
  slug: string;
  options: PickerOption[];
  slots: PickerSlot[];
  addons: PickerAddon[];
  payWith: { id: string; label: string }[];
  policy: string;
}) {
  const [optionId, setOptionId] = useState(options[0]?.id ?? "");
  const [pickedAddons, setPickedAddons] = useState<string[]>([]);
  const activeSlots = useMemo(
    () => (kind === "appointment" ? options.find((option) => option.id === optionId)?.slots ?? [] : slots),
    [kind, options, optionId, slots],
  );
  const extraMinutes = addons.filter((addon) => pickedAddons.includes(addon.id)).reduce((sum, addon) => sum + addon.minutes, 0);
  const dates = useMemo(
    () => [...new Set(activeSlots.filter((slot) => extraMinutes <= (slot.slackMinutes ?? 0)).map((slot) => slot.localDate))],
    [activeSlots, extraMinutes],
  );
  const [day, setDay] = useState(dates[0] ?? "");
  const [startsAt, setStartsAt] = useState("");
  const dayKey = dates.includes(day) ? day : dates[0];
  const daySlots = activeSlots.filter((slot) => slot.localDate === dayKey && extraMinutes <= (slot.slackMinutes ?? 0));
  const price = kind === "appointment" ? options.find((option) => option.id === optionId)?.priceCents ?? 0 : 0;
  const selectedStillOpen = activeSlots.some((slot) => slot.startsAt === startsAt && extraMinutes <= (slot.slackMinutes ?? 0));

  function toggleAddon(id: string) {
    setPickedAddons((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <form action={bookVisitAction} className="space-y-4" data-testid="slot-picker">
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="optionId" value={optionId} />
      <input type="hidden" name="startsAt" value={startsAt} />
      {kind === "appointment" && options.length > 1 ? (
        <div className="grid grid-cols-2 gap-2">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`min-h-11 rounded-2xl px-3 text-sm ${optionId === option.id ? "bg-ink text-paper" : "bg-white ring-1 ring-line"}`}
              onClick={() => {
                setOptionId(option.id);
                setStartsAt("");
              }}
            >
              {option.minutes} min · {dollars(option.priceCents)}
            </button>
          ))}
        </div>
      ) : null}
      {kind === "appointment" && options.length === 1 ? <p className="text-sm">{options[0]?.minutes} min · {dollars(price)}</p> : null}
      {addons.length ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Add-ons</legend>
          {addons.map((addon) => (
            <label key={addon.id} className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-white px-3 ring-1 ring-line">
              <span className="text-sm">{addon.name}{addon.minutes ? ` · ${addon.minutes} min` : ""}</span>
              <span className="flex items-center gap-2 text-sm">
                {dollars(addon.priceCents)}
                <input type="checkbox" name="addonId" value={addon.id} checked={pickedAddons.includes(addon.id)} onChange={() => toggleAddon(addon.id)} />
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {dates.slice(0, 7).map((date) => (
          <button
            key={date}
            type="button"
            className={`min-h-11 shrink-0 rounded-full px-3 text-sm ${date === dayKey ? "bg-clay text-white" : "bg-white ring-1 ring-line"}`}
            onClick={() => {
              setDay(date);
              setStartsAt("");
            }}
          >
            {date.slice(5)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {daySlots.map((slot) => (
          <button
            key={slot.startsAt}
            type="button"
            data-testid="slot"
            className={`min-h-11 rounded-2xl px-2 text-sm ${startsAt === slot.startsAt ? "bg-ink text-paper" : "bg-white ring-1 ring-line"}`}
            onClick={() => setStartsAt(slot.startsAt)}
          >
            {clock(slot.time)}
            {slot.left != null ? <span className="mt-0.5 block text-xs opacity-70">{slot.left} left</span> : null}
          </button>
        ))}
      </div>
      {!daySlots.length ? <p className="text-sm text-ink/60">No open times in this window.</p> : null}
      <label className="block text-sm">
        Promo code
        <input name="code" className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2 uppercase" placeholder="Optional" />
      </label>
      <label className="block text-sm">
        Pay with
        <select name="payWith" className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2">
          <option value="cash">Card or pay at the studio</option>
          {payWith.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="policyAccepted" value="1" required className="mt-1" />
        <span>{policy}</span>
      </label>
      <button className="min-h-11 w-full rounded-full bg-clay text-sm font-medium text-white" disabled={!selectedStillOpen}>
        {selectedStillOpen ? "Book this time" : "Choose a time"}
      </button>
    </form>
  );
}
