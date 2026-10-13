import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Wallet } from "@mobile/api/types";
import { Body, Card, Display, Title } from "@mobile/components/ui";
import { whenLabel } from "@mobile/format";
import { useSession } from "@mobile/session";
import { useAppTheme } from "@mobile/theme/theme";

export default function WalletScreen() {
  const { api, track, ready, user } = useSession();
  const { colors } = useAppTheme();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  useEffect(() => {
    if (!ready || !user) return;
    void api.wallet().then(setWallet).catch(() => setWallet({ packs: [], memberships: [] }));
    void track("screen_view", { screen: "wallet" });
  }, [api, ready, track, user]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={{ padding: 20, gap: 14 }} testID="wallet-screen">
        <Display testID="wallet-title">Wallet</Display>
        <Body muted>Packs and memberships you already have.</Body>
        <Title>Packs</Title>
        {(wallet?.packs ?? []).map((pack) => (
          <Card key={pack.id}>
            <Title>{pack.name}</Title>
            <Body>{pack.remaining} of {pack.total} credits left</Body>
          </Card>
        ))}
        {wallet && !wallet.packs.length ? <Body muted>No packs yet.</Body> : null}
        <Title>Memberships</Title>
        {(wallet?.memberships ?? []).map((plan) => (
          <Card key={plan.id}>
            <Title>{plan.name}</Title>
            <Body>{plan.status}</Body>
            <Body muted>Through {whenLabel(plan.periodEnd)}</Body>
          </Card>
        ))}
        {wallet && !wallet.memberships.length ? <Body muted>No memberships yet.</Body> : null}
      </View>
    </SafeAreaView>
  );
}
