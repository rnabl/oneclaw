// Sendblue API types

export interface SendblueConfig {
  apiKey: string;
  apiSecret: string;
  fromNumber: string;
}

export interface SendMessageRequest {
  number: string; // E.164 format recipient
  from_number: string; // E.164 format sender (your Sendblue number)
  content?: string;
  media_url?: string;
  send_style?: 'celebration' | 'fireworks' | 'confetti' | 'heart' | 'lasers' | 'love' | 'spotlight' | 'echo';
  status_callback?: string;
}

export interface SendMessageResponse {
  accountEmail: string;
  content: string;
  is_outbound: boolean;
  status: string;
  error_code: number | null;
  error_message: string | null;
  message_handle: string;
  date_sent: string;
  date_updated: string;
  from_number: string;
  number: string;
  to_number: string;
  was_downgraded: boolean | null;
  media_url: string;
  message_type: string;
  service: string;
}

export interface WebhookPayload {
  accountEmail: string;
  content: string;
  is_outbound: boolean;
  status: string;
  error_code: number | null;
  error_message: string | null;
  error_reason: string | null;
  error_detail: string | null;
  message_handle: string;
  date_sent: string;
  date_updated: string;
  from_number: string;
  number: string;
  to_number: string;
  was_downgraded: boolean | null;
  plan: string;
  media_url: string;
  message_type: string;
  group_id: string;
  participants: string[];
  send_style: string;
  opted_out: boolean;
  sendblue_number: string;
  service: string;
  group_display_name: string | null;
}

export interface ParsedMessage {
  sender: string;
  recipient: string;
  text: string;
  mediaUrl?: string;
  isOutbound: boolean;
  messageId: string;
  timestamp: string;
  service: string;
}
