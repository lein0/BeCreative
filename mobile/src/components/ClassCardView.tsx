import { Pressable, Text, View } from "react-native";
import type { ClassCard } from "../api/types";
import { money, priceLabel, whenLabel } from "../format";
import { swatch, useAppTheme } from "../theme/theme";

export function ClassCardView({ item, onPress, compact = false }: { item: ClassCard; onPress: () => void; compact?: boolean }) {
  const { colors, fonts } = useAppTheme();
  const price = item.pricePerSessionCents === 0 ? "Free" : priceLabel(item.pricePerSessionCents, item.pricePerSeriesCents);
  const meta = [item.neighborhood, item.nextStartsAt ? whenLabel(item.nextStartsAt) : "Dates soon", item.firstClassFree ? "First class free" : ""].filter(Boolean).join(" · ");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${price}`} onPress={onPress} style={{ borderRadius: 24, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
      <View style={{ height: compact ? 72 : 112, backgroundColor: swatch(item.coverHue, item.vertical), justifyContent: "flex-end", padding: 14 }}>
        <Text style={{ fontFamily: fonts.medium, color: "#fbf8f3", fontSize: 12 }}>{item.categoryName}</Text>
      </View>
      <View style={{ padding: 14, gap: 4 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.ink }}>{item.title}</Text>
        <Text style={{ fontFamily: fonts.body, color: colors.muted, fontSize: 14 }}>{item.teacherName}</Text>
        <Text style={{ fontFamily: fonts.body, color: colors.ink, fontSize: 14 }}>{meta}</Text>
        <Text style={{ fontFamily: fonts.medium, color: colors.accent, fontSize: 16 }}>{item.pricePerSessionCents === 0 ? "Free" : money(item.pricePerSessionCents ?? item.pricePerSeriesCents ?? 0)}</Text>
      </View>
    </Pressable>
  );
}
