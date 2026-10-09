import { Pressable, Text, View } from "react-native";
import type { PublicClass } from "../api/types";
import { money, whenLabel } from "../format";
import { swatch, useAppTheme } from "../theme/theme";

function hueOf(slug: string) {
  return [...slug].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export function ClassCardView({ item, onPress, compact = false }: { item: PublicClass; onPress: () => void; compact?: boolean }) {
  const { colors, fonts } = useAppTheme();
  const price = item.priceCents == null ? "" : item.priceCents === 0 ? "Free" : money(item.priceCents);
  const meta = [item.teacher, item.nextStartsAt ? whenLabel(item.nextStartsAt) : "Dates soon", item.spots != null ? `${item.spots} spots` : ""].filter(Boolean).join(" · ");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${price}`} onPress={onPress} style={{ borderRadius: 24, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
      <View style={{ height: compact ? 72 : 112, backgroundColor: swatch(hueOf(item.slug), item.vertical === "wellness" ? "wellness" : "creative"), justifyContent: "flex-end", padding: 14 }}>
        <Text style={{ fontFamily: fonts.medium, color: "#fbf8f3", fontSize: 12 }}>{item.category || item.delivery}</Text>
      </View>
      <View style={{ padding: 14, gap: 4 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.ink }}>{item.title}</Text>
        <Text style={{ fontFamily: fonts.body, color: colors.muted, fontSize: 14 }}>{item.teacher}</Text>
        <Text style={{ fontFamily: fonts.body, color: colors.ink, fontSize: 14 }}>{meta}</Text>
        {price ? <Text style={{ fontFamily: fonts.medium, color: colors.accent, fontSize: 16 }}>{price}</Text> : null}
      </View>
    </Pressable>
  );
}
