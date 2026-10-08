import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { HelpArticle } from "@mobile/api/types";
import { Body, Button, Card, Display, Screen, Title } from "@mobile/components/ui";
import { useSession } from "@mobile/session";

export default function Help() {
  const { api, track } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<HelpArticle[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void api.help().then(async (result) => {
      const articles = await Promise.all(result.articles.map((item) => api.helpArticle(item.slug)));
      setItems(articles);
    });
  }, [api]);
  return (
    <Screen>
      <Display>Help</Display>
      <Body muted>Answers first. A person if you still need one.</Body>
      {items.map((item) => (
        <Card key={item.slug}>
          <Title>{item.title}</Title>
          {open === item.slug ? <Body>{item.body}</Body> : null}
          <Button label={open === item.slug ? "Hide" : "Show answer"} tone="ghost" onPress={() => {
            setOpen(open === item.slug ? null : item.slug);
            void track("help_article_viewed", { slug: item.slug });
          }} />
        </Card>
      ))}
      <View>
        <Button label="New support ticket" onPress={() => router.push("/tickets/new")} />
      </View>
    </Screen>
  );
}
