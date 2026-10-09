import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { feeAction, policySettingsAction } from "@/lib/actions";
import { SHIP_DEFAULTS } from "@/lib/ship-defaults";
import { control } from "@/components/bits";
import { db } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";

export default function SettingsPage() {
  return <Suspense fallback={null}><Body /></Suspense>;
}

async function Body() {
  const [fee] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  return (
    <div>
      <h1 className="display text-5xl">Fees</h1>
      <form action={feeAction} className="mt-4 grid max-w-sm gap-2">
        <label className="text-sm">Percent<input name="percent" defaultValue={fee?.feePercent ?? 10} className={control} /></label>
        <label className="text-sm">Fixed dollars<input name="fixed" defaultValue={((fee?.feeFixedCents ?? 0) / 100).toString()} className={control} /></label>
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Save fee</button>
      </form>
      <h2 className="display mt-10 text-3xl">Policies</h2>
      <form action={policySettingsAction} className="mt-4 grid max-w-lg gap-2 text-sm">
        <label>Full refund until hours before<input name="fullRefundHours" defaultValue={fee?.studentFullRefundHours ?? SHIP_DEFAULTS.studentFullRefundHours} className={control} /></label>
        <label>Credit only until hours before<input name="creditOnlyHours" defaultValue={fee?.studentCreditOnlyHours ?? SHIP_DEFAULTS.studentCreditOnlyHours} className={control} /></label>
        <label>Late cancel fee (dollars)<input name="lateCancelFee" defaultValue={((fee?.lateCancelFeeCents ?? 0) / 100).toString()} className={control} /></label>
        <label>No-show fee (dollars)<input name="noShowFee" defaultValue={((fee?.noShowFeeCents ?? 0) / 100).toString()} className={control} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="creditRequiresOptIn" value="1" defaultChecked={fee?.creditRequiresOptIn ?? true} /> Class credit only if the student opts in</label>
        <label>Waitlist claim window (hours)<input name="waitlistClaimHours" defaultValue={fee?.waitlistClaimHours ?? SHIP_DEFAULTS.waitlistClaimHours} className={control} /></label>
        <p className="text-ink/70">Texts, including reminders, send only from 8:00 a.m. to 8:00 p.m. in the recipient&apos;s time zone, or the class time zone when we do not have one.</p>
        <label>SMS quiet hours start<input name="quietHoursStart" defaultValue={fee?.quietHoursStart ?? SHIP_DEFAULTS.quietHoursStart} className={control} /></label>
        <label>SMS quiet hours end<input name="quietHoursEnd" defaultValue={fee?.quietHoursEnd ?? SHIP_DEFAULTS.quietHoursEnd} className={control} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="disputeAutoSubmit" value="1" defaultChecked={fee?.disputeAutoSubmit ?? true} /> Auto-submit dispute evidence</label>
        <label>Submit evidence this many hours before the deadline<input name="disputeSubmitLeadHours" defaultValue={fee?.disputeSubmitLeadHours ?? SHIP_DEFAULTS.disputeSubmitLeadHours} className={control} /></label>
        <label>Who pays the dispute fee<input name="disputeFeeBearer" defaultValue={fee?.disputeFeeBearer ?? SHIP_DEFAULTS.disputeFeeBearer} className={control} /></label>
        <label>Who bears the disputed amount<input name="disputedAmountBearer" defaultValue={fee?.disputedAmountBearer ?? SHIP_DEFAULTS.disputedAmountBearer} className={control} /></label>
        <label>Early fraud auto-refund up to (dollars)<input name="earlyFraudRefundMax" defaultValue={((fee?.earlyFraudRefundMaxCents ?? SHIP_DEFAULTS.earlyFraudRefundMaxCents) / 100).toString()} className={control} /></label>
        <label>Statement descriptor prefix<input name="statementDescriptorPrefix" defaultValue={fee?.statementDescriptorPrefix ?? SHIP_DEFAULTS.statementDescriptorPrefix} className={control} /></label>
        <label>Teacher ticket reply window (hours)<input name="ticketTeacherSlaHours" defaultValue={fee?.ticketTeacherSlaHours ?? SHIP_DEFAULTS.ticketTeacherSlaHours} className={control} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="webPushEnabled" value="1" defaultChecked={fee?.webPushEnabled ?? false} /> Web push</label>
        <label>Mailing address<input name="mailingAddress" defaultValue={fee?.mailingAddress ?? SHIP_DEFAULTS.mailingAddress} className={control} /></label>
        <label>Policy version<input name="policyVersion" defaultValue={fee?.policyVersion ?? SHIP_DEFAULTS.policyVersion} className={control} /></label>
        <label>SMS monthly cap (dollars)<input name="smsMonthlyCap" defaultValue={((fee?.smsMonthlyCapCents ?? SHIP_DEFAULTS.smsMonthlyCapCents) / 100).toString()} className={control} /></label>
        <label>SMS cost per segment (cents)<input name="smsSegmentCostCents" defaultValue={fee?.smsSegmentCostCents ?? SHIP_DEFAULTS.smsSegmentCostCents} className={control} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="imessageEnabled" value="1" defaultChecked={fee?.imessageEnabled ?? false} /> iMessage when the number can take it</label>
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper">Save policies</button>
      </form>
    </div>
  );
}
