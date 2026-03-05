const DELIVERY_METHODS = {
  PDF: "PDF",
  EMAIL_LINK: "EMAIL_LINK",
};

const TICKET_TYPES = ["General", "VIP", "VVIP"];

export default function TicketSettingsForm({
  settings,
  onSettingsChange,
  onTryDemo,
  onSendTickets,
  loading,
  sending,
  canSendTickets,
}) {
  const onTicketGroupChange = (index, field, value) => {
    onSettingsChange((prev) => ({
      ...prev,
      ticketGroups: prev.ticketGroups.map((group, groupIndex) =>
        groupIndex === index ? { ...group, [field]: value } : group,
      ),
    }));
  };

  const getAvailableTypes = (index) => {
    const selectedByOthers = new Set(
      settings.ticketGroups.filter((_, i) => i !== index).map((group) => group.ticketType),
    );
    return TICKET_TYPES.filter(
      (type) => type === settings.ticketGroups[index].ticketType || !selectedByOthers.has(type),
    );
  };

  const addMoreTicketTypes = () => {
    const selected = new Set(settings.ticketGroups.map((group) => group.ticketType));
    const nextType = TICKET_TYPES.find((type) => !selected.has(type));
    if (!nextType) return;
    onSettingsChange((prev) => ({
      ...prev,
      ticketGroups: [...prev.ticketGroups, { ticketType: nextType, ticketPrice: "0", quantity: "1" }],
    }));
  };

  const totalQuantity = Math.max(
    1,
    settings.ticketGroups.reduce((sum, group) => sum + (Number.parseInt(group.quantity, 10) || 0), 0),
  );

  return (
    <section className="mt-6 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-semibold">Ticket settings</h2>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-sm text-slate-600">Total tickets to generate</p>
          <p className="text-2xl font-bold">{totalQuantity}</p>
        </div>

        {settings.ticketGroups.map((group, index) => (
          <div key={group.ticketType} className="grid grid-cols-1 gap-3 rounded border p-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Ticket type</label>
              <select
                className="w-full rounded border p-2"
                value={group.ticketType}
                onChange={(event) => onTicketGroupChange(index, "ticketType", event.target.value)}
              >
                {getAvailableTypes(index).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Ticket price</label>
              <input
                className="w-full rounded border p-2"
                type="number"
                min="0"
                value={group.ticketPrice}
                onChange={(event) => onTicketGroupChange(index, "ticketPrice", event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Quantity</label>
              <input
                className="w-full rounded border p-2"
                type="number"
                min="1"
                value={group.quantity}
                onChange={(event) => onTicketGroupChange(index, "quantity", event.target.value)}
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          className="rounded border px-3 py-2"
          onClick={addMoreTicketTypes}
          disabled={settings.ticketGroups.length >= TICKET_TYPES.length}
        >
          Add more ticket types
        </button>

        <div className="rounded border p-3">
          <p className="mb-2 text-sm font-medium">Delivery method</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="deliveryMethod"
              value={DELIVERY_METHODS.PDF}
              checked={settings.deliveryMethod === DELIVERY_METHODS.PDF}
              onChange={(event) => onSettingsChange((prev) => ({ ...prev, deliveryMethod: event.target.value }))}
            />
            <span>Download PDF</span>
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="deliveryMethod"
              value={DELIVERY_METHODS.EMAIL_LINK}
              checked={settings.deliveryMethod === DELIVERY_METHODS.EMAIL_LINK}
              onChange={(event) => onSettingsChange((prev) => ({ ...prev, deliveryMethod: event.target.value }))}
            />
            <span>Send by email (links)</span>
          </label>

          {settings.deliveryMethod === DELIVERY_METHODS.EMAIL_LINK ? (
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium">Recipient emails</label>
              <textarea
                className="w-full rounded border p-2"
                rows={4}
                value={settings.recipientEmails}
                onChange={(event) => onSettingsChange((prev) => ({ ...prev, recipientEmails: event.target.value }))}
                placeholder="alice@email.com, bob@email.com"
              />
              <p className="mt-1 text-xs text-slate-600">We&apos;ll send one ticket link per email.</p>
              {canSendTickets ? (
                <button
                  type="button"
                  className="mt-3 rounded bg-indigo-600 px-3 py-2 text-white"
                  onClick={onSendTickets}
                  disabled={sending}
                >
                  {sending ? "Sending..." : "Send tickets"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="rounded bg-black px-4 py-2 text-white"
          onClick={onTryDemo}
          disabled={loading || sending}
        >
          {loading ? "Creating..." : "Try Demo"}
        </button>
      </div>
    </section>
  );
}

