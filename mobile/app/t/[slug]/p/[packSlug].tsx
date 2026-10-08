import { useLocalSearchParams, useRouter } from "expo-router";
import { Body, Button, Display, Screen } from "@mobile/components/ui";

export default function PackLink() {
  const { slug } = useLocalSearchParams<{ slug: string; packSlug: string }>();
  const router = useRouter();
  return (
    <Screen>
      <Display>Class pack</Display>
      <Body>Packs renew nothing, so the app can pay them with the payment sheet once it has the pack id. The teacher profile from the student API lists classes, not pack ids.</Body>
      <Button label="See the teacher" onPress={() => router.push(`/t/${slug}`)} />
    </Screen>
  );
}
