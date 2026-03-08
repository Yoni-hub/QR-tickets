import AppButton from "../ui/AppButton";

export default function TicketSettingsForm({ settings, onSettingsChange }) {
  const onTicketGroupChange = (index, field, value) => {
    onSettingsChange((prev) => ({
      ...prev,
      ticketGroups: prev.ticketGroups.map((group, groupIndex) =>
        groupIndex === index ? { ...group, [field]: value } : group,
      ),
    }));
  };

  const addMoreTicketTypes = () => {
    const nextType = `Type ${settings.ticketGroups.length + 1}`;
    onSettingsChange((prev) => ({
      ...prev,
      ticketGroups: [...prev.ticketGroups, { ticketType: nextType, ticketPrice: "0", quantity: "1" }],
    }));
  };
  const removeTicketType = () => {
    if (settings.ticketGroups.length <= 1) return;
    onSettingsChange((prev) => ({
      ...prev,
      ticketGroups: prev.ticketGroups.slice(0, -1),
    }));
  };

  const totalQuantity = Math.max(
    1,
    settings.ticketGroups.reduce((sum, group) => sum + (Number.parseInt(group.quantity, 10) || 0), 0),
  );
  const groupSummary = settings.ticketGroups
    .map((group) => `${Math.max(1, Number.parseInt(group.quantity, 10) || 0)} ${String(group.ticketType || "").toLowerCase()}`)
    .join(" & ");

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">Ticket settings</h2>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-sm text-slate-600">
            You are generating {groupSummary} ticket{totalQuantity === 1 ? "" : "s"}, {totalQuantity} in total.
          </p>
        </div>

        {settings.ticketGroups.map((group, index) => (
          <div key={`${index}-${group.ticketType}`} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium sm:text-sm">Ticket type</label>
              <input
                className="w-full rounded border p-2 text-sm"
                type="text"
                value={group.ticketType}
                onChange={(event) => onTicketGroupChange(index, "ticketType", event.target.value)}
                placeholder="e.g. Early Bird / VIP Table / Guest List"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium sm:text-sm">Ticket price</label>
              <input
                className="w-full rounded border p-2 text-sm"
                type="number"
                min="0"
                value={group.ticketPrice}
                onChange={(event) => onTicketGroupChange(index, "ticketPrice", event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium sm:text-sm">Quantity</label>
              <input
                className="w-full rounded border p-2 text-sm"
                type="number"
                min="1"
                value={group.quantity}
                onChange={(event) => onTicketGroupChange(index, "quantity", event.target.value)}
              />
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <AppButton
            type="button"
            variant="secondary"
            onClick={addMoreTicketTypes}
          >
            Add more ticket types
          </AppButton>
          <AppButton
            type="button"
            variant="secondary"
            onClick={removeTicketType}
            disabled={settings.ticketGroups.length <= 1}
          >
            Remove ticket type
          </AppButton>
        </div>
      </div>
    </section>
  );
}
