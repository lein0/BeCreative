import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Wallet } from "@mobile/api/types";
import { Body, Card, Display, Title } from "@mobile/components/ui";
import { money, whenLabel } from "@mobile/format";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function WalletScreen() {
  const { api, track, ready, user } = useSession();
  const { colors } = useAppTheme();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  useEffect(() => {
    if (!ready || !user) return;
    void api.wallet().then(setWallet);
    void track("screen_view", { screen: "wallet" });
  }, [api, ready, track, user]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={{ padding: 20, gap: 14 }} testID="wallet-screen">
        <Display testID="wallet-title">Wallet</Display>
        <Body muted>Packs, memberships, and credits. There is no credit subscription.</Body>
        <Title>Packs</Title>
        {(wallet?.packs ?? []).map((pack) => (
          <Card key={pack.id}>
            <Title>{pack.name}</Title>
            <Body>{pack.creditsRemaining} of {pack.creditsTotal} credits left</Body>
            <Body muted>{pack.teacherName}{pack.expiresAt ? ` · expires ${whenLabel(pack.expiresAt)}` : ""}</Body>
          </Card>
        ))}
        {!wallet?.packs.length ? <Body muted>No packs yet.</Body> : null}
        <Title>Memberships</Title>
        {(wallet?.memberships ?? []).map((plan) => (
          <Card key={plan.id}>
            <Title>{plan.name}</Title>
            <Body>{plan.status}{plan.unlimited ? " · unlimited" : ` · ${plan.classesUsedThisPeriod} of ${plan.classesPerPeriod ?? 0} used`}</Body>
            <Body muted>{plan.teacherName} · renews {whenLabel(plan.currentPeriodEnd)}</Body>
          </Card>
        ))}
        <Title>Credits</Title>
        {(wallet?.ledger ?? []).map((entry) => (
          <Body key={entry.id}>{entry.direction === "credit" ? "Added" : "Spent"} · {entry.label}</Body>
        ))}
        {wallet?.packs[0] ? <Body muted>A drop-in spends one pack credit. A series is still {money(24000)} if the teacher sells it that way.</Body> : null}
      </View>
    </SafeAreaView>
  );
}
