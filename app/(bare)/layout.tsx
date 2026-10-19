import { FeedbackSlot } from "@/components/feedback-slot";

export default function BareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      {children}
      <FeedbackSlot mobileFloat />
    </div>
  );
}
