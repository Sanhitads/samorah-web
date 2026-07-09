/** Channel registry. Register a new channel (WhatsApp/SMS/push) by adding it here. */
import type { NotificationChannel, ChannelKey } from "../types";
import { emailChannel } from "./email";

const CHANNELS: Partial<Record<ChannelKey, NotificationChannel>> = {
  email: emailChannel,
  // whatsapp: whatsappChannel,  // ← future
  // sms: smsChannel,
  // push: pushChannel,
};

export function getChannel(key: ChannelKey): NotificationChannel | undefined {
  return CHANNELS[key];
}
