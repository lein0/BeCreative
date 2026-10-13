import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Body, Button, Display, Eyebrow } from "@mobile/components/ui";
import { useAppTheme } from "@mobile/theme/theme";

const slides = [
  { eyebrow: "BeCreative", title: "Classes with the person who teaches them.", body: "Acting, comedy, music, dance, art, DJing, photo. Small rooms, independent teachers, your seat." },
  { eyebrow: "Book it", title: "A date, a series, or a time that fits.", body: "Pay the teacher with Apple Pay, Google Pay, or a card. Packs and memberships live in your wallet." },
  { eyebrow: "BeWell", title: "A quieter side of the same app.", body: "Yoga, sound baths, massage, meditation, sauna, cold plunge, stretching. Same account, calmer colors." },
];

export default function Welcome() {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const { colors, fonts } = useAppTheme();
  const slide = slides[step];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} testID="welcome">
      <View style={{ flex: 1, padding: 24, justifyContent: "space-between" }}>
        <View style={{ gap: 16, paddingTop: 24 }}>
          <Eyebrow>{slide.eyebrow}</Eyebrow>
          <Display>{slide.title}</Display>
          <Body muted>{slide.body}</Body>
        </View>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }} accessibilityLabel={`Slide ${step + 1} of ${slides.length}`}>
            {slides.map((item, index) => (
              <View key={item.eyebrow} style={{ height: 6, flex: 1, borderRadius: 99, backgroundColor: index === step ? colors.accent : colors.sand }} />
            ))}
          </View>
          {step < slides.length - 1 ? (
            <Button label="Next" onPress={() => setStep(step + 1)} testID="welcome-next" />
          ) : (
            <Button label="Create an account" onPress={() => router.push("/signup")} testID="welcome-signup" />
          )}
          <Button label="I already have an account" tone="ghost" onPress={() => router.push("/login")} testID="welcome-login" />
          <Body muted>Teachers stay on the website. This app is for students.</Body>
          <View />
          <Body muted>{fonts.body ? "" : ""}</Body>
        </View>
      </View>
    </SafeAreaView>
  );
}
