import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@mobile/api";
import type { ClassDetail, WalletPack } from "@mobile/api/types";
import { Body, Button, Card, Display, Field, Notice, ToggleRow } from "@mobile/components/ui";
import { draftFromResult, setCheckoutDraft } from "@mobile/checkout/draft";
import { money, whenLabel } from "@mobile/format";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function BookScreen() {
  const { slug, code } = useLocalSearchParams<{ slug: string; code?: string }>();
  const router = useRouter();
  const { api, user, track, attribution, ready } = useSession();
  const { colors } = useAppTheme();
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [series, setSeries] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [promo, setPromo] = useState(typeof code === "string" ? code : attribution && "code" in attribution && attribution.code ? attribution.code : "");
  const [usePack, setUsePack] = useState(false);
  const [packs, setPacks] = useState<WalletPack[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [signedName, setSignedName] = useState(user?.name ?? "");
  const [waiverBody, setWaiverBody] = useState<string | null>(null);
  const [waiverSigned, setWaiverSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.name) setSignedName((current) => current || user.name);
  }, [user]);

  useEffect(() => {
    if (!slug || !ready) return;
    void api.classDetail(slug).then((next) => {
      setDetail(next);
      setSessionId(next.slots[0]?.id ?? null);
      void track("booking_started", { slug: next.class.slug });
      if (user) {
        void api.waiver(next.teacher.slug).then((waiver) => {
          setWaiverBody(waiver.body);
          setWaiverSigned(waiver.signed);
          if (waiver.signed) setAgreed(true);
        }).catch(() => undefined);
      }
    }).catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load this class."));
    if (user) void api.wallet().then((wallet) => setPacks(wallet.packs.filter((item) => item.remaining > 0))).catch(() => undefined);
  }, [api, ready, slug, track, user]);

  async function submit() {
    if (!detail || !user) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!agreed && !waiverSigned) {
        setError("Accept the cancellation policy.");
        return;
      }
      if (waiverBody && !waiverSigned) {
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
        payWith: usePack && packs[0] ? `pack:${packs[0].id}` : "cash",
        policyAccepted: true,
        paymentSheet: true,
      });
      if (result.codeApplied) await track("promo_applied", { code: result.codeApplied });
      await track("checkout_started", { orderId: result.orderId ?? "" });
      setCheckoutDraft(draftFromResult(detail.class.title, result));
      router.push("/checkout");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
    } finally {
      setBusy(false);
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
          <View style={{ flex: 1 }}><Button label="Whole series" tone={series ? "accent" : "ghost"} onPress={() => setSeries(true)} /></View>
        </View>
        {!series ? detail.slots.map((slot) => (
          <Button key={slot.id} label={`${whenLabel(slot.startsAt)}${slot.spots != null ? ` · ${slot.spots} spots` : ""}`} tone={sessionId === slot.id ? "accent" : "ghost"} onPress={() => setSessionId(slot.id)} />
        )) : <Body>All upcoming dates, one price.</Body>}
        {packs.length && !series ? <ToggleRow label={`Use ${packs[0]!.name} (${packs[0]!.remaining} left)`} value={usePack} onChange={setUsePack} /> : null}
        <Field label="Promo code" value={promo} onChangeText={setPromo} testID="promo" />
        <Card>
          <Body>Cancellation policy</Body>
          <Body muted>{waiverBody || "Full refund until 24 hours before the start. Studio credit until 2 hours before. After that the seat is not refunded."}</Body>
          {waiverSigned ? <Body>You already signed this waiver.</Body> : (
            <>
              <ToggleRow label="I agree" value={agreed} onChange={setAgreed} />
              {waiverBody ? <Field label="Type your name to sign" value={signedName} onChangeText={setSignedName} testID="waiver-name" /> : null}
            </>
          )}
        </Card>
        {error ? <Notice>{error}</Notice> : null}
        <Body>Price {money(detail.class.priceCents ?? 0)}. The discount is applied at checkout.</Body>
        <Button label={busy ? "Starting checkout…" : "Continue to checkout"} disabled={busy} onPress={() => void submit()} testID="continue-checkout" />
      </ScrollView>
    </SafeAreaView>
  );
}
