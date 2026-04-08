const { z } = require("zod");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const stringId = (name, max = 128) =>
  z
    .string({ required_error: `${name} is required.` })
    .trim()
    .min(1, `${name} is required.`)
    .max(max, `${name} is too long.`);

const optionalTrimmedString = (max) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters.`)
    .optional();

const emailString = z
  .string({ required_error: "email is required." })
  .trim()
  .max(254, "email is too long.")
  .regex(EMAIL_PATTERN, "A valid email address is required.");

const accessCodeParamSchema = z.object({
  accessCode: stringId("accessCode", 64),
});

const eventIdParamSchema = z.object({
  eventId: stringId("eventId", 64),
});

const ticketPublicIdParamSchema = z.object({
  ticketPublicId: stringId("ticketPublicId", 128),
});

const eventSlugParamSchema = z.object({
  eventSlug: stringId("eventSlug", 160),
});

const clientTokenParamSchema = z.object({
  clientAccessToken: stringId("clientAccessToken", 256),
});

const conversationIdParamSchema = z.object({
  clientAccessToken: stringId("clientAccessToken", 256),
  conversationId: stringId("conversationId", 128),
});

const attachmentIdParamSchema = z.object({
  clientAccessToken: stringId("clientAccessToken", 256),
  attachmentId: stringId("attachmentId", 128),
});

const supportTokenParamSchema = z.object({
  conversationToken: stringId("conversationToken", 256),
});

const ticketRequestIdParamSchema = z.object({
  id: stringId("id", 128),
});

const promoterIdParamSchema = z.object({
  id: stringId("id", 128),
});

const ticketSelectionSchema = z.object({
  ticketType: stringId("ticketSelections.ticketType", 100),
  quantity: z
    .number({ invalid_type_error: "ticketSelections.quantity must be a number." })
    .int("ticketSelections.quantity must be an integer.")
    .min(1, "ticketSelections.quantity must be at least 1.")
    .max(100, "ticketSelections.quantity is too large."),
});

const sendOtpBodySchema = z
  .object({
    email: emailString,
    eventSlug: stringId("eventSlug", 160),
  })
  .passthrough();

const verifyOtpBodySchema = z
  .object({
    email: emailString,
    eventSlug: stringId("eventSlug", 160),
    code: z
      .string({ required_error: "code is required." })
      .trim()
      .min(1, "code is required.")
      .max(12, "code is too long."),
  })
  .passthrough();

const ticketRequestBodySchema = z
  .object({
    eventSlug: stringId("eventSlug", 160),
    name: stringId("name", 150),
    email: emailString,
    otpToken: stringId("otpToken", 256),
    ticketSelections: z
      .array(ticketSelectionSchema, { required_error: "ticketSelections is required." })
      .min(1, "Select at least one ticket type with quantity."),
    promoterCode: optionalTrimmedString(80),
    evidenceImageDataUrl: optionalTrimmedString(17 * 1024 * 1024),
  })
  .passthrough();

const clientMessageBodySchema = z
  .object({
    message: z
      .string({ required_error: "Message is required." })
      .trim()
      .min(1, "Message is required.")
      .max(1200, "Message is too long."),
  })
  .passthrough();

const clientStartConversationBodySchema = z
  .object({
    conversationType: z.enum(["ORGANIZER_CLIENT", "ADMIN_CLIENT"], {
      errorMap: () => ({ message: "Invalid conversationType." }),
    }),
    ticketRequestId: optionalTrimmedString(128),
    eventId: optionalTrimmedString(128),
    subject: optionalTrimmedString(200),
  })
  .passthrough();

const readConversationBodySchema = z
  .object({
    readThroughMessageId: optionalTrimmedString(128),
  })
  .passthrough();

const recoverSendOtpBodySchema = z
  .object({
    email: emailString,
  })
  .passthrough();

const recoverConfirmBodySchema = z
  .object({
    email: emailString,
    code: z
      .string({ required_error: "code is required." })
      .trim()
      .min(1, "code is required.")
      .max(12, "code is too long."),
  })
  .passthrough();

const supportCreateBodySchema = z
  .object({
    name: optionalTrimmedString(150),
    email: optionalTrimmedString(254).refine((value) => !value || EMAIL_PATTERN.test(value), {
      message: "A valid email address is required.",
    }),
    accessCode: optionalTrimmedString(64),
    subject: optionalTrimmedString(200),
    message: z
      .string({ required_error: "Message is required." })
      .trim()
      .min(1, "Message is required.")
      .max(1200, "Message is too long."),
    evidenceImageDataUrl: optionalTrimmedString(17 * 1024 * 1024),
  })
  .passthrough();

const supportMessageBodySchema = z
  .object({
    message: z
      .string({ required_error: "Message is required." })
      .trim()
      .min(1, "Message is required.")
      .max(1200, "Message is too long."),
    evidenceImageDataUrl: optionalTrimmedString(17 * 1024 * 1024),
  })
  .passthrough();

const contactSendOtpBodySchema = z
  .object({
    email: emailString,
  })
  .passthrough();

const contactBodySchema = z
  .object({
    email: emailString,
    message: z
      .string({ required_error: "message is required." })
      .trim()
      .min(1, "message is required.")
      .max(5000, "Message is too long."),
    otp: z
      .string({ required_error: "otp is required." })
      .trim()
      .min(1, "otp is required.")
      .max(12, "otp is too long."),
  })
  .passthrough();

const scanBodySchema = z
  .object({
    organizerAccessCode: optionalTrimmedString(64),
    accessCode: optionalTrimmedString(64),
    ticketPublicId: stringId("ticketPublicId", 128),
    eventId: optionalTrimmedString(64),
    rawScannedValue: optionalTrimmedString(300),
    scannerSource: optionalTrimmedString(100),
    enforceEventDate: z.boolean().optional(),
  })
  .refine((payload) => payload.organizerAccessCode || payload.accessCode, {
    message: "organizerAccessCode or accessCode is required.",
    path: ["organizerAccessCode"],
  })
  .passthrough();

const createEventBodySchema = z
  .object({
    cfTurnstileToken: optionalTrimmedString(1024),
    organizerName: optionalTrimmedString(150),
    eventName: optionalTrimmedString(200),
    eventAddress: optionalTrimmedString(300),
    eventDateTime: optionalTrimmedString(100),
    dateTimeText: optionalTrimmedString(100),
    eventEndDate: optionalTrimmedString(100),
    ticketType: optionalTrimmedString(100),
    ticketPrice: z.union([z.number(), z.string()]).optional(),
    quantity: z.union([z.number(), z.string()]).optional(),
    generateAccessOnly: z.boolean().optional(),
    paymentInstructions: optionalTrimmedString(2000),
    currency: optionalTrimmedString(8),
    eventSlug: optionalTrimmedString(160),
    ticketSelections: z
      .array(
        z.object({
          ticketType: optionalTrimmedString(100),
          quantity: z.union([z.number(), z.string()]).optional(),
          ticketPrice: z.union([z.number(), z.string()]).optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

const createEventByCodeParamsSchema = accessCodeParamSchema;
const createEventByCodeBodySchema = z
  .object({
    cfTurnstileToken: optionalTrimmedString(1024),
    eventName: stringId("eventName", 200),
    organizerName: optionalTrimmedString(150),
    eventAddress: stringId("eventAddress", 300),
    eventDate: stringId("eventDate", 100),
    eventEndDate: optionalTrimmedString(100),
    paymentInstructions: optionalTrimmedString(2000),
  })
  .passthrough();

const generateTicketsParamsSchema = accessCodeParamSchema;
const generateTicketsBodySchema = z
  .object({
    eventId: optionalTrimmedString(128),
    eventName: optionalTrimmedString(200),
    organizerName: optionalTrimmedString(150),
    eventAddress: optionalTrimmedString(300),
    eventDateTime: optionalTrimmedString(100),
    dateTimeText: optionalTrimmedString(100),
    currency: optionalTrimmedString(8),
    quantity: z.union([z.number(), z.string()]).optional(),
    ticketType: optionalTrimmedString(100),
    ticketPrice: z.union([z.number(), z.string()]).optional(),
    ticketSelections: z
      .array(
        z.object({
          ticketType: optionalTrimmedString(100),
          quantity: z.union([z.number(), z.string()]).optional(),
          ticketPrice: z.union([z.number(), z.string()]).optional(),
          headerImageDataUrl: optionalTrimmedString(17 * 1024 * 1024),
          headerOverlay: z.union([z.number(), z.string()]).optional(),
          headerTextColorMode: optionalTrimmedString(32),
        }),
      )
      .optional(),
    designJson: z.record(z.string(), z.any()).optional(),
  })
  .passthrough();

const updateEventParamsSchema = eventIdParamSchema;
const updateEventBodySchema = z
  .object({
    accessCode: stringId("accessCode", 64),
    eventName: optionalTrimmedString(200),
    organizerName: optionalTrimmedString(150),
    eventAddress: optionalTrimmedString(300),
    paymentInstructions: optionalTrimmedString(2000),
    eventDate: optionalTrimmedString(100),
    eventEndDate: optionalTrimmedString(100),
    ticketType: optionalTrimmedString(100),
    ticketPrice: z.union([z.number(), z.string(), z.null()]).optional(),
    salesCutoffAt: optionalTrimmedString(100),
    salesWindowStart: optionalTrimmedString(8),
    salesWindowEnd: optionalTrimmedString(8),
    maxTicketsPerEmail: z.union([z.number(), z.string(), z.null()]).optional(),
    designJson: z.record(z.string(), z.any()).optional(),
  })
  .passthrough();

const organizerEventQuerySchema = z
  .object({
    eventId: optionalTrimmedString(128),
    accessCode: optionalTrimmedString(64),
    status: optionalTrimmedString(16),
    conversationType: optionalTrimmedString(32),
    q: optionalTrimmedString(200),
  })
  .passthrough();

const accessCodeWithEventParamsSchema = accessCodeParamSchema;

const setAutoApproveBodySchema = z
  .object({
    accessCode: optionalTrimmedString(64),
    eventId: optionalTrimmedString(128),
    autoApprove: z.union([z.boolean(), z.string()]),
  })
  .passthrough();

const updateNotificationsBodySchema = z
  .object({
    notifyOnRequest: z.union([z.boolean(), z.string(), z.number()]).optional(),
    notifyOnMessage: z.union([z.boolean(), z.string(), z.number()]).optional(),
  })
  .passthrough();

const notificationSendOtpBodySchema = z
  .object({
    email: emailString,
  })
  .passthrough();

const notificationVerifyOtpBodySchema = z
  .object({
    email: emailString,
    code: z.string().trim().min(1, "code is required.").max(12, "code is too long."),
  })
  .passthrough();

const mergeEventBodySchema = z
  .object({
    orphanAccessCode: stringId("orphanAccessCode", 64),
  })
  .passthrough();

const ticketRequestActionBodySchema = z
  .object({
    accessCode: optionalTrimmedString(64),
    eventId: optionalTrimmedString(128),
  })
  .passthrough();

const ticketRequestMessageBodySchema = z
  .object({
    accessCode: optionalTrimmedString(64),
    eventId: optionalTrimmedString(128),
    message: z.string({ required_error: "Message is required." }).trim().min(1, "Message is required.").max(1200, "Message is too long."),
  })
  .passthrough();

const organizerTicketCancelBodySchema = z
  .object({
    accessCode: optionalTrimmedString(64),
    eventId: optionalTrimmedString(128),
    reason: z.enum(["EVENT_CANCELLED", "PAYMENT_REFUNDED_TO_CUSTOMER", "OTHER"], {
      errorMap: () => ({ message: "Valid cancellation reason is required." }),
    }),
    otherReason: optionalTrimmedString(500),
    evidenceImageDataUrl: optionalTrimmedString(17 * 1024 * 1024),
  })
  .passthrough();

const organizerStartConversationBodySchema = z
  .object({
    conversationType: z.enum(["ORGANIZER_ADMIN", "ORGANIZER_CLIENT"], {
      errorMap: () => ({ message: "Invalid conversationType." }),
    }),
    ticketRequestId: optionalTrimmedString(128),
    eventId: optionalTrimmedString(128),
    subject: optionalTrimmedString(200),
  })
  .passthrough();

const organizerConversationParamsSchema = z.object({
  accessCode: stringId("accessCode", 64),
  conversationId: stringId("conversationId", 128),
});

const organizerAttachmentParamsSchema = z.object({
  accessCode: stringId("accessCode", 64),
  attachmentId: stringId("attachmentId", 128),
});

const organizerInvoiceEvidenceParamsSchema = z.object({
  accessCode: stringId("accessCode", 64),
  invoiceId: stringId("invoiceId", 128),
});

const organizerInvoiceEvidenceBodySchema = z
  .object({
    eventId: stringId("eventId", 128),
    note: optionalTrimmedString(1000),
    evidenceImageDataUrl: z
      .string({ required_error: "evidenceImageDataUrl is required." })
      .trim()
      .min(1, "evidenceImageDataUrl is required.")
      .max(17 * 1024 * 1024, "Evidence image payload is too large."),
  })
  .passthrough();

const organizerConversationMessageBodySchema = z
  .object({
    message: z.string().trim().max(1200, "Message is too long.").optional(),
  })
  .passthrough();

const promotersCreateBodySchema = z
  .object({
    accessCode: stringId("accessCode", 64),
    eventId: optionalTrimmedString(128),
    name: stringId("name", 150),
    code: optionalTrimmedString(64),
  })
  .passthrough();

const promotersUpdateBodySchema = z
  .object({
    accessCode: optionalTrimmedString(64),
    eventId: optionalTrimmedString(128),
    name: optionalTrimmedString(150),
    code: optionalTrimmedString(64),
  })
  .passthrough();

const promotersDeleteQuerySchema = z
  .object({
    accessCode: optionalTrimmedString(64),
    eventId: optionalTrimmedString(128),
  })
  .passthrough();

const promotersDeleteBodySchema = z
  .object({
    accessCode: optionalTrimmedString(64),
    eventId: optionalTrimmedString(128),
  })
  .passthrough();

module.exports = {
  accessCodeParamSchema,
  eventIdParamSchema,
  ticketPublicIdParamSchema,
  eventSlugParamSchema,
  clientTokenParamSchema,
  conversationIdParamSchema,
  attachmentIdParamSchema,
  supportTokenParamSchema,
  ticketRequestIdParamSchema,
  promoterIdParamSchema,
  sendOtpBodySchema,
  verifyOtpBodySchema,
  ticketRequestBodySchema,
  clientMessageBodySchema,
  clientStartConversationBodySchema,
  readConversationBodySchema,
  recoverSendOtpBodySchema,
  recoverConfirmBodySchema,
  supportCreateBodySchema,
  supportMessageBodySchema,
  contactSendOtpBodySchema,
  contactBodySchema,
  scanBodySchema,
  createEventBodySchema,
  createEventByCodeParamsSchema,
  createEventByCodeBodySchema,
  generateTicketsParamsSchema,
  generateTicketsBodySchema,
  updateEventParamsSchema,
  updateEventBodySchema,
  organizerEventQuerySchema,
  accessCodeWithEventParamsSchema,
  setAutoApproveBodySchema,
  updateNotificationsBodySchema,
  notificationSendOtpBodySchema,
  notificationVerifyOtpBodySchema,
  mergeEventBodySchema,
  ticketRequestActionBodySchema,
  ticketRequestMessageBodySchema,
  organizerTicketCancelBodySchema,
  organizerStartConversationBodySchema,
  organizerConversationParamsSchema,
  organizerAttachmentParamsSchema,
  organizerInvoiceEvidenceParamsSchema,
  organizerInvoiceEvidenceBodySchema,
  organizerConversationMessageBodySchema,
  promotersCreateBodySchema,
  promotersUpdateBodySchema,
  promotersDeleteQuerySchema,
  promotersDeleteBodySchema,
};
