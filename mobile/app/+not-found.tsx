import { useRouter } from "expo-router";
import { Body, Button, Display, Screen } from "@mobile/components/ui";

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <Display>That page isn't in the app</Display>
      <Body muted>Teacher tools stay on the website. Students can explore classes from here.</Body>
      <Button label="Explore" onPress={() => router.replace("/explore")} />
    </Screen>
  );
}
