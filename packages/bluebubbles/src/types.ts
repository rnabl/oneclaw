// BlueBubbles specific types

/**
 * BlueBubbles server configuration
 */
export interface BlueBubblesConfig {
  serverUrl: string;
  password: string;
}

/**
 * BlueBubbles webhook event types
 */
export type WebhookEventType =
  | 'new-message'
  | 'updated-message'
  | 'typing-indicator'
  | 'group-name-changed'
  | 'participant-added'
  | 'participant-removed'
  | 'participant-left';

/**
 * BlueBubbles webhook payload
 */
export interface WebhookPayload {
  type: WebhookEventType;
  data: MessageData | TypingData | ParticipantData;
}

/**
 * Message data from webhook
 */
export interface MessageData {
  guid: string;
  text: string | null;
  subject: string | null;
  country: string | null;
  error: number;
  dateCreated: number;
  dateRead: number | null;
  dateDelivered: number | null;
  isFromMe: boolean;
  isDelayed: boolean;
  isAutoReply: boolean;
  isSystemMessage: boolean;
  isServiceMessage: boolean;
  isForward: boolean;
  isArchived: boolean;
  hasDdResults: boolean;
  cacheRoomnames: string | null;
  isAudioMessage: boolean;
  datePlayed: number | null;
  itemType: number;
  groupTitle: string | null;
  groupActionType: number;
  isExpired: boolean;
  balloonBundleId: string | null;
  associatedMessageGuid: string | null;
  associatedMessageType: string | null;
  expressiveSendStyleId: string | null;
  timeExpressiveSendStyleId: number | null;
  handle: HandleData | null;
  chats: ChatData[];
  attachments: AttachmentData[];
  associatedMessagePart: number | null;
  threadOriginatorGuid: string | null;
  threadOriginatorPart: string | null;
}

/**
 * Handle (contact) data
 */
export interface HandleData {
  id: number;
  address: string;
  country: string | null;
  originalROWID: number;
  service: string;
  uncanonicalizedId: string | null;
}

/**
 * Chat data
 */
export interface ChatData {
  guid: string;
  chatIdentifier: string;
  isArchived: boolean;
  displayName: string | null;
  participants: HandleData[];
  lastMessage: string | null;
}

/**
 * Attachment data
 */
export interface AttachmentData {
  guid: string;
  uti: string;
  mimeType: string;
  transferState: number;
  totalBytes: number;
  isOutgoing: boolean;
  transferName: string;
  isSticker: boolean;
  hideAttachment: boolean;
  height: number;
  width: number;
}

/**
 * Typing indicator data
 */
export interface TypingData {
  display: boolean;
  guid: string;
}

/**
 * Participant change data
 */
export interface ParticipantData {
  chat: ChatData;
  handle: HandleData;
}

/**
 * Send message request
 */
export interface SendMessageRequest {
  chatGuid: string;
  message: string;
  tempGuid?: string;
  method?: 'private-api' | 'apple-script';
  effectId?: string;
  subject?: string;
  selectedMessageGuid?: string;
  partIndex?: number;
}

/**
 * Send message response
 */
export interface SendMessageResponse {
  status: number;
  message: string;
  data: MessageData;
}

/**
 * API error response
 */
export interface ApiError {
  status: number;
  message: string;
  error: {
    type: string;
    message: string;
  };
}
