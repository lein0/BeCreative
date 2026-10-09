import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { FaqItem } from "@mobile/api/types";
import { Body, Button, Card, Display, Screen, Title } from "@mobile/components/ui";
import { useSession } from "@mobile/session";

export default function Help() {
  const { api } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<FaqItem[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void api.faq().then((result) => setItems(result.items));
  }, [api]);
  return (
    <Screen>
      <Display>Help</Display>
      <Body muted>Answers first. A person if you still need one.</Body>
      {items.map((item) => (
        <Card key={item.id}>
          <Title>{item.question}</Title>
          {open === item.id ? <Body>{item.answer}</Body> : null}
          <Button label={open === item.id ? "Hide" : "Show answer"} tone="ghost" onPress={() => setOpen(open === item.id ? null : item.id)} />
        </Card>
      ))}
      <View>
        <Button label="New support ticket" onPress={() => router.push("/tickets/new")} />
      </View>
    </Screen>
  );
}
