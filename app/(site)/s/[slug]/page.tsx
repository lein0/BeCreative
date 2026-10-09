import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { signWaiverAction } from "@/lib/actions";
import { Panel } from "@/components/bits";
import { SlotPicker } from "@/components/slot-picker";
import { getActor } from "@/lib/actor";
import { canSpendMembership, canSpendPack, offerCoversClass } from "@/lib/pricing";
import { walletForClass } from "@/lib/queries";
import { needsWaiver } from "@/lib/slots";
import { signedWaiverVersion, openSlotsForService, serviceDetail } from "@/lib/wellness-service";
import { money, one } from "@/lib/utils";

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await serviceDetail(slug);
  if (!detail) return { title: "Visit" };
  return {
    title: detail.service.title,
    description: `${detail.service.title} with ${detail.teacher.studioName}. ${detail.service.description}`,
  };
}

export default function ServicePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }) {
  return (
    <Suspense fallback={<p className="px-5 py-10">Loading times…</p>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const detail = await serviceDetail(slug);
  if (!detail) notFound();
  const actor = await getActor();
  const signed = actor ? await signedWaiverVersion(detail.teacher.id, actor.id) : null;
  const waiverDue = needsWaiver({
    required: detail.service.waiverRequired,
    currentVersion: detail.waiver?.version ?? null,
    signedVersion: signed,
  });
  const open = await openSlotsForService(detail.service.id);
  const wallet = actor ? await walletForClass(actor.id, detail.teacher.id) : null;
  const payWith = wallet
    ? [
        ...wallet.ownedPacks
          .filter((item) => canSpendPack({
            creditsRemaining: item.purchase.creditsRemaining,
            expiresAt: item.purchase.expiresAt,
            now: new Date(),
            covers: offerCoversClass({ classIds: item.pack.classIds, categoryIds: item.pack.categoryIds }, detail.service.id, detail.service.categoryId),
          }).ok)
          .map((item) => ({ id: `pack:${item.purchase.id}`, label: `${item.pack.name} · ${item.purchase.creditsRemaining} left` })),
        ...wallet.subs
          .filter((item) => canSpendMembership({
            status: item.sub.status,
            periodEnd: item.sub.currentPeriodEnd,
            now: new Date(),
            unlimited: item.sub.unlimited,
            classesPerPeriod: item.sub.classesPerPeriod,
            classesUsed: item.sub.classesUsedThisPeriod,
            covers: offerCoversClass({ classIds: item.plan.classIds, categoryIds: item.plan.categoryIds }, detail.service.id, detail.service.categoryId),
          }).ok)
          .map((item) => ({ id: `membership:${item.sub.id}`, label: item.sub.unlimited ? `${item.plan.name} · unlimited` : `${item.plan.name} · ${item.sub.classesUsedThisPeriod} used` })),
      ]
    : [];
  const error = one(sp.error);
  return (
    <article data-brand="bewell" className="bg-paper text-ink">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-clay">{detail.category?.name} · {detail.service.kind === "access" ? "Shared slot" : "Private hour"}</p>
          <h1 className="display text-5xl leading-none sm:text-6xl">{detail.service.title}</h1>
          <Link href={`/t/${detail.teacher.slug}`} className="mt-3 inline-block text-clay">{detail.teacher.studioName}</Link>
          <div className="mt-3 flex flex-wrap gap-2">
            {detail.credentials.map((credential) => (
              <span key={credential.id} className="rounded-full bg-sand px-3 py-1 text-xs">
                {credential.label}{credential.verified ? " · verified" : ""}
              </span>
            ))}
          </div>
          <p className="mt-5 max-w-2xl text-lg text-ink/80">{detail.service.description}</p>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            <Panel><dt className="text-ink/50">Lead time</dt><dd>{detail.service.leadTimeHours} hours</dd></Panel>
            <Panel><dt className="text-ink/50">Cancel by</dt><dd>{detail.service.cancellationHours} hours before</dd></Panel>
            <Panel><dt className="text-ink/50">Where</dt><dd>{detail.location?.neighborhood ?? "Los Angeles"}</dd></Panel>
          </dl>
          {detail.service.kind === "access" ? <p className="mt-4 text-sm text-ink/70">{money(detail.service.priceCents)} · {detail.service.slotMinutes} min · {detail.service.capacity} people in the room</p> : null}
          {detail.service.bufferMinutes ? <p className="mt-2 text-sm text-ink/60">{detail.service.bufferMinutes} min between private sessions.</p> : null}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {error ? <p className="rounded-2xl bg-sand px-4 py-3 text-sm">{error}</p> : null}
          {one(sp.signed) === "1" ? <p className="rounded-2xl bg-sand px-4 py-3 text-sm">Waiver signed. Pick a time.</p> : null}
          {waiverDue && !detail.waiver ? (
            <Panel>
              <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Liability waiver</p>
              <h2 className="display mt-1 text-3xl">Waiver required</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80" data-testid="waiver-missing">This studio requires a signed waiver, and the document is not published yet. Booking stays closed until it is.</p>
            </Panel>
          ) : null}
          {waiverDue && detail.waiver ? (
            <Panel>
              <p className="text-xs uppercase tracking-[0.14em] text-ink/50">Liability waiver · version {detail.waiver.version}</p>
              <h2 className="display mt-1 text-3xl">Sign once for this studio</h2>
              <p className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-ink/80" data-testid="waiver-body">{detail.waiver.body}</p>
              {actor ? (
                <form action={signWaiverAction} className="mt-4 space-y-3">
                  <input type="hidden" name="teacherId" value={detail.teacher.id} />
                  <input type="hidden" name="slug" value={detail.service.slug} />
                  <label className="block text-sm">
                    Type your name to sign
                    <input name="signedName" required minLength={2} className="mt-1 min-h-11 w-full rounded-2xl border border-line bg-white px-3" placeholder={actor.name} data-testid="waiver-name" />
                  </label>
                  <button className="min-h-11 w-full rounded-full bg-ink text-sm text-paper">Sign waiver</button>
                </form>
              ) : (
                <Link href={`/login?next=/s/${detail.service.slug}`} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-sm text-paper">Sign in to sign</Link>
              )}
            </Panel>
          ) : null}
          {waiverDue ? null : (
            <Panel>
              <p className="text-xs uppercase tracking-[0.14em] text-ink/50">{detail.service.kind === "access" ? "Open slots" : "Open hours"}</p>
              <SlotPicker
                kind={open.kind}
                serviceId={detail.service.id}
                slug={detail.service.slug}
                options={open.kind === "appointment" ? open.options.map((option) => ({ id: option.optionId, label: option.label, minutes: option.minutes, priceCents: option.priceCents, slots: option.slots.map(serialize) })) : []}
                slots={open.kind === "access" ? open.slots.map(serialize) : []}
                addons={detail.addons.map((addon) => ({ id: addon.id, name: addon.name, priceCents: addon.priceCents, minutes: addon.minutes }))}
                payWith={payWith}
              />
            </Panel>
          )}
        </aside>
      </div>
    </article>
  );
}

function serialize(slot: { startsAt: Date; localDate: string; time: string; left?: number; slackMinutes: number }) {
  return { startsAt: slot.startsAt.toISOString(), localDate: slot.localDate, time: slot.time, left: slot.left, slackMinutes: slot.slackMinutes };
}
