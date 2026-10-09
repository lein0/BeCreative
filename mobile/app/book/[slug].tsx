import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import type { ClassDetail, WalletPack } from "@mobile/api/types";
import { Body, Button, Card, Display, Field, Notice, ToggleRow } from "@mobile/components/ui";
import { bookDisplayCents, packsForClass } from "@mobile/booking/flow";
import { bookingSubmitLock, checkoutFollowsBooking, resumeBookingPath } from "../../../lib/mobile-client";
import { draftFromResult, setCheckoutDraft } from "@mobile/checkout/draft";
import { money, whenLabel } from "@mobile/format";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function BookScreen() {
  const { slug, code, session: sessionParam, series: seriesParam } = useLocalSearchParams<{ slug: string; code?: string; session?: string; series?: string }>();
  const router = useRouter();
  const { api, user, track, attribution, ready } = useSession();
  const { colors } = useAppTheme();
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [series, setSeries] = useState(seriesParam === "1");
  const submitLock = useRef(bookingSubmitLock());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [promo, setPromo] = useState(typeof code === "string" ? code : attribution && "code" in attribution && attribution.code ? attribution.code : "");
  const [usePack, setUsePack] = useState(false);
  const [packs, setPacks] = useState<WalletPack[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [signedName, setSignedName] = useState(user?.name ?? "");
  const [waiverBody, setWaiverBody] = useState<string | null>(null);
  const [waiverSigned, setWaiverSigned] = useState(false);
  const [signatureRequired, setSignatureRequired] = useState(false);
  const [waiverRequired, setWaiverRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.name) setSignedName((current) => current || user.name);
  }, [user]);

  useEffect(() => {
    if (!slug || !ready) return;
    void api.classDetail(slug).then((next) => {
      setDetail(next);
      setSignatureRequired(next.signatureRequired);
      const preferred = typeof sessionParam === "string" ? sessionParam : null;
      setSessionId(next.slots.some((slot) => slot.id === preferred) ? preferred : next.slots[0]?.id ?? null);
      void track("booking_started", { slug: next.class.slug });
      if (user) {
        void api.waiver(next.teacher.slug).then((waiver) => {
          setWaiverBody(waiver.body);
          setWaiverSigned(waiver.signed);
          setWaiverRequired(waiver.required);
          setSignatureRequired(next.signatureRequired && waiver.required);
        }).catch(() => undefined);
      }
    }).catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load this class."));
    if (user) void api.wallet().then((wallet) => setPacks(wallet.packs.filter((item) => item.remaining > 0))).catch(() => undefined);
  }, [api, ready, sessionParam, slug, track, user]);

  const eligiblePacks = detail ? packsForClass(packs, detail.class.id, detail.class.categoryId ?? "", detail.teacher.id) : [];
  const seriesPrice = detail?.class.seriesPriceCents ?? null;
  const shownPrice = detail ? bookDisplayCents({ series, sessionPriceCents: detail.class.priceCents, seriesPriceCents: seriesPrice }) : null;

  async function submit() {
    if (!detail || !user) {
      router.push({ pathname: "/login", params: { next: resumeBookingPath({ slug: slug ?? "", sessionId, series, code: promo }) } });
      return;
    }
    if (!submitLock.current.tryAcquire()) return;
    setBusy(true);
    setError(null);
    let held = false;
    try {
      if (!agreed) {
        setError("Accept the cancellation policy.");
        return;
      }
      if (signatureRequired && !waiverSigned) {
        if (!signedName.trim()) {
          setError("Type your name to sign.");
          return;
        }
        await api.signWaiver(detail.teacher.slug, signedName.trim());
        setWaiverSigned(true);
      }
      const result = await api.book({
        sessionId: series ? undefined : sessionId ?? undefined,
        classId: detail.class.id,
        series,
        code: promo.trim() || undefined,
        payWith: usePack && eligiblePacks[0] ? `pack:${eligiblePacks[0].id}` : "cash",
        policyAccepted: true,
        paymentSheet: Platform.OS !== "web",
      });
      if (checkoutFollowsBooking(result) === "bookings") {
        setError("You already have this series booked.");
        router.push("/bookings");
        return;
      }
      if (result.codeApplied) await track("promo_applied", { code: result.codeApplied });
      await track("checkout_started", { orderId: result.orderId ?? "" });
      setCheckoutDraft(draftFromResult(detail.class.title, result));
      router.push("/checkout");
      held = true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
    } finally {
      if (!held) {
        submitLock.current.release();
        setBusy(false);
      }
    }
  }

  if (!detail) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><Body>Loading…</Body></SafeAreaView>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 48 }} testID="book-screen">
        <Display>{detail.class.title}</Display>
        <Body muted>Pick a date, then accept the cancellation policy.</Body>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Button label="This date" tone={!series ? "accent" : "ghost"} onPress={() => setSeries(false)} /></View>
          {seriesPrice != null ? <View style={{ flex: 1 }}><Button label="Whole series" tone={series ? "accent" : "ghost"} onPress={() => setSeries(true)} /></View> : null}
        </View>
        {!series ? detail.slots.map((slot) => (
          <Button key={slot.id} label={`${whenLabel(slot.startsAt)}${slot.spots != null ? ` · ${slot.spots} spots` : ""}`} tone={sessionId === slot.id ? "accent" : "ghost"} onPress={() => setSessionId(slot.id)} />
        )) : <Body>All upcoming dates, one price.</Body>}
        {eligiblePacks.length && !series ? <ToggleRow label={`Use ${eligiblePacks[0]!.name} (${eligiblePacks[0]!.remaining} left)`} value={usePack} onChange={setUsePack} /> : null}
        <Field label="Promo code" value={promo} onChangeText={setPromo} testID="promo" />
        <Card>
          <Body>Cancellation policy</Body>
          <Body muted>{waiverBody || "Full refund until 24 hours before the start. Studio credit until 2 hours before. After that the seat is not refunded."}</Body>
          {waiverSigned && signatureRequired ? <Body>You already signed this waiver.</Body> : null}
          <ToggleRow label="I agree" value={agreed} onChange={setAgreed} />
          {signatureRequired && waiverRequired && !waiverSigned ? <Field label="Type your name to sign" value={signedName} onChangeText={setSignedName} testID="waiver-name" /> : null}
        </Card>
        {error ? <Notice>{error}</Notice> : null}
        <Body>Price {money(shownPrice ?? 0)}. The discount is applied at checkout.</Body>
        <Button label={busy ? "Starting checkout…" : "Continue to checkout"} disabled={busy} onPress={() => void submit()} testID="continue-checkout" />
      </ScrollView>
    </SafeAreaView>
  );
}
