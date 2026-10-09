import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import type { BookingKind, ClassDetail, QuoteResponse } from "@mobile/api/types";
import { Body, Button, Card, Display, Field, Notice, ToggleRow } from "@mobile/components/ui";
import { money, whenLabel } from "@mobile/format";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function BookScreen() {
  const { slug, code } = useLocalSearchParams<{ slug: string; code?: string }>();
  const router = useRouter();
  const { api, user, track, attribution } = useSession();
  const { colors } = useAppTheme();
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [kind, setKind] = useState<BookingKind>("session");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [partySize, setPartySize] = useState(1);
  const [promo, setPromo] = useState(typeof code === "string" ? code : attribution && "code" in attribution && attribution.code ? attribution.code : "");
  const [usePack, setUsePack] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [signedName, setSignedName] = useState(user?.name ?? "");
  useEffect(() => {
    if (user?.name) setSignedName((current) => current || user.name);
  }, [user]);
  const [error, setError] = useState<string | null>(null);
  const [packs, setPacks] = useState<{ id: string; name: string; creditsRemaining: number }[]>([]);

  useEffect(() => {
    if (!slug) return;
    void api.classDetail(slug).then((next) => {
      setDetail(next);
      const initial: BookingKind = next.offeringKind === "appointment" ? "appointment" : next.offeringKind === "capacity" ? "capacity" : "session";
      setKind(initial);
      setSessionId(next.sessions[0]?.id ?? null);
      setSlotId(next.slots[0]?.id ?? null);
      void track("booking_started", { slug: next.slug });
    });
    void api.wallet().then((wallet) => setPacks(wallet.packs.filter((item) => item.creditsRemaining > 0))).catch(() => undefined);
  }, [api, slug, track]);

  const request = useMemo(() => {
    if (!detail) return null;
    return {
      classSlug: detail.slug,
      kind,
      sessionId,
      slotId,
      addonIds: addons,
      partySize,
      promoCode: promo.trim() || null,
      usePackId: usePack ? packs[0]?.id ?? null : null,
    };
  }, [addons, detail, kind, packs, partySize, promo, sessionId, slotId, usePack]);

  useEffect(() => {
    if (!request) return;
    void api.quote(request).then((next) => {
      setQuote(next);
      setError(next.quote.codeError);
    }).catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not price this."));
  }, [api, request]);

  async function submit() {
    if (!request) return;
    setError(null);
    try {
      const result = await api.createBooking({ ...request, waiver: { agreed, signedName } }, `book-${request.classSlug}-${Date.now()}`);
      await track("checkout_started", { orderId: result.order.id, pays: result.order.studentPaysCents });
      router.push({ pathname: "/checkout", params: { orderId: result.order.id } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
    }
  }

  if (!detail) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><Body>Loading…</Body></SafeAreaView>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 48 }} testID="book-screen">
        <Display>{detail.title}</Display>
        <Body muted>Pick how you want to book, then sign the waiver.</Body>
        {detail.seriesBookingEnabled ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Button label="This date" tone={kind === "session" ? "accent" : "ghost"} onPress={() => setKind("session")} /></View>
            <View style={{ flex: 1 }}><Button label="Whole series" tone={kind === "series" ? "accent" : "ghost"} onPress={() => setKind("series")} /></View>
          </View>
        ) : null}
        {kind === "session" ? detail.sessions.map((session) => (
          <Button key={session.id} label={`${whenLabel(session.startsAt)} · ${session.capacity - session.confirmedCount} spots`} tone={sessionId === session.id ? "accent" : "ghost"} onPress={() => setSessionId(session.id)} />
        )) : null}
        {kind === "series" ? <Body>All upcoming dates, one price. Cancelling later does not prorate.</Body> : null}
        {(kind === "appointment" || kind === "capacity") ? detail.slots.map((slot) => (
          <Button key={slot.id} label={`${whenLabel(slot.startsAt)} · ${slot.remaining} left`} tone={slotId === slot.id ? "accent" : "ghost"} onPress={() => setSlotId(slot.id)} />
        )) : null}
        {detail.addons.length ? (
          <Card>
            <Body>Add-ons</Body>
            {detail.addons.map((addon) => {
              const on = addons.includes(addon.id);
              return <Button key={addon.id} label={`${on ? "Remove" : "Add"} ${addon.name} · ${money(addon.priceCents)}`} tone={on ? "accent" : "ghost"} onPress={() => setAddons(on ? addons.filter((id) => id !== addon.id) : [...addons, addon.id])} />;
            })}
          </Card>
        ) : null}
        {kind === "capacity" ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Fewer" tone="ghost" onPress={() => setPartySize(Math.max(1, partySize - 1))} />
            <Body>{partySize} spots</Body>
            <Button label="More" tone="ghost" onPress={() => setPartySize(partySize + 1)} />
          </View>
        ) : null}
        {packs.length && kind !== "series" ? <ToggleRow label={`Use ${packs[0].name} (${packs[0].creditsRemaining} left)`} value={usePack} onChange={setUsePack} /> : null}
        <Field label="Promo code" value={promo} onChangeText={setPromo} testID="promo" />
        <Card>
          <Body>{detail.waiver.title}</Body>
          <Body muted>{detail.waiver.body}</Body>
          <ToggleRow label="I agree" value={agreed} onChange={setAgreed} />
          <Field label="Type your name to sign" value={signedName} onChangeText={setSignedName} testID="waiver-name" />
        </Card>
        {error ? <Notice>{error}</Notice> : null}
        <Body>{quote ? `${quote.label} · ${money(quote.quote.studentPaysCents)}` : "Pricing…"}</Body>
        {quote?.quote.codeApplied ? <Body>Code {quote.quote.codeApplied} applied.</Body> : null}
        <Button label="Continue to checkout" onPress={() => void submit()} testID="continue-checkout" />
      </ScrollView>
    </SafeAreaView>
  );
}
