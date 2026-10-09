import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { useAppTheme } from "../theme/theme";

export function Screen({ children, scroll = true, testID }: { children: ReactNode; scroll?: boolean; testID?: string }) {
  const { colors } = useAppTheme();
  if (!scroll) return <View style={[styles.fill, { backgroundColor: colors.bg, padding: 20 }]} testID={testID}>{children}</View>;
  return (
    <ScrollView style={[styles.fill, { backgroundColor: colors.bg }]} contentContainerStyle={styles.scroll} testID={testID}>
      {children}
    </ScrollView>
  );
}

export function Display({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors, fonts } = useAppTheme();
  return (
    <Text accessibilityRole="header" testID={testID} style={{ fontFamily: fonts.display, fontSize: 36, lineHeight: 40, color: colors.ink }}>
      {children}
    </Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const { colors, fonts } = useAppTheme();
  return <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.ink }}>{children}</Text>;
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const { colors, fonts } = useAppTheme();
  return <Text style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: muted ? colors.muted : colors.ink }}>{children}</Text>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const { colors, fonts } = useAppTheme();
  return <Text style={{ fontFamily: fonts.medium, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: colors.muted }}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  tone = "accent",
  testID,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: "accent" | "ink" | "ghost";
  testID?: string;
  disabled?: boolean;
}) {
  const { colors, fonts } = useAppTheme();
  const background = tone === "accent" ? colors.accent : tone === "ink" ? colors.ink : "transparent";
  const color = tone === "ghost" ? colors.ink : tone === "ink" ? colors.bg : colors.onAccent;
  const border = tone === "ghost" ? colors.line : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{ minHeight: 48, borderRadius: 999, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", backgroundColor: background, borderWidth: 1, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }]}
    >
      <Text style={{ fontFamily: fonts.medium, fontSize: 16, color }}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secure = false,
  keyboard = "default",
  testID,
  onBlur,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboard?: "default" | "email-address" | "phone-pad";
  testID?: string;
  onBlur?: () => void;
}) {
  const { colors, fonts } = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: fonts.medium, color: colors.ink, fontSize: 14 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secure}
        autoCapitalize={keyboard === "email-address" ? "none" : "sentences"}
        keyboardType={keyboard}
        onBlur={onBlur}
        style={{ minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.ink, fontFamily: fonts.body, fontSize: 16 }}
      />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useAppTheme();
  return <View style={[{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8 }, style]}>{children}</View>;
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const { colors, fonts } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: selected ? colors.accent : colors.sand, marginRight: 8 }}
    >
      <Text style={{ fontFamily: fonts.medium, color: selected ? colors.onAccent : colors.ink, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (value: boolean) => void; hint?: string }) {
  const { colors, fonts } = useAppTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.medium, color: colors.ink, fontSize: 16 }}>{label}</Text>
        {hint ? <Text style={{ fontFamily: fonts.body, color: colors.muted, fontSize: 13 }}>{hint}</Text> : null}
      </View>
      <View style={{ width: 52, height: 32, borderRadius: 16, backgroundColor: value ? colors.accent : colors.sand, justifyContent: "center", padding: 3 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, alignSelf: value ? "flex-end" : "flex-start" }} />
      </View>
    </Pressable>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  const { colors, fonts } = useAppTheme();
  return <Text accessibilityRole="alert" style={{ fontFamily: fonts.body, color: colors.danger, fontSize: 14 }}>{children}</Text>;
}

export function Segmented({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  const { colors, fonts } = useAppTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.sand, borderRadius: 999, padding: 4 }}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected }} onPress={() => onChange(option.id)} style={{ flex: 1, minHeight: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: selected ? colors.surface : "transparent" }}>
            <Text style={{ fontFamily: fonts.medium, color: colors.ink, fontSize: 15 }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { colors, fonts } = useAppTheme();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: fonts.medium, color: colors.accent, fontSize: 16 }}>Done</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <Body>{body}</Body>
      <Button label={confirmLabel} onPress={onConfirm} />
      <Button label="Keep it" tone="ghost" onPress={onClose} />
    </Sheet>
  );
}

export function useDisclosure() {
  const [open, setOpen] = useState(false);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
}

export function textStyle(family: string, color: string, size = 16): TextStyle {
  return { fontFamily: family, color, fontSize: size };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 48, gap: 16 },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(28,23,20,0.35)" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 14, maxHeight: "88%" },
});
