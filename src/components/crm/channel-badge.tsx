import { MessageCircle, Instagram, Globe, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const CHANNELS: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  instagram: {
    label: "Instagram",
    icon: Instagram,
    tone: "border-pink-200 bg-pink-50 text-pink-700",
  },
  web: {
    label: "Site",
    icon: Globe,
    tone: "border-blue-200 bg-blue-50 text-blue-700",
  },
  chatbot: {
    label: "Chatbot",
    icon: MessageSquare,
    tone: "border-slate-200 bg-slate-50 text-slate-600",
  },
};

export function ChannelBadge({ channel }: { channel: string }) {
  const cfg = CHANNELS[channel] ?? CHANNELS.chatbot;
  const Icon = cfg.icon;
  return (
    <Badge className={`gap-1 ${cfg.tone}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </Badge>
  );
}
