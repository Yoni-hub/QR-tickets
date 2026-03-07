import AppButton from "../ui/AppButton";
const TICKET_TYPES = ["General", "VIP", "VVIP"];

export default function TicketSettingsForm({ settings, onSettingsChange }) {
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
    <section className="mt-6 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-semibold">Ticket settings</h2>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-sm text-slate-600">
            You are generating {groupSummary} ticket{totalQuantity === 1 ? "" : "s"}, {totalQuantity} in total.
          </p>
        </div>

        {settings.ticketGroups.map((group, index) => (
          <div key={group.ticketType} className="grid grid-cols-3 gap-2 rounded border p-3">
            <div>
              <label className="mb-1 block text-xs font-medium sm:text-sm">Ticket type</label>
              <select
                className="w-full rounded border p-2 text-sm"
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
            disabled={settings.ticketGroups.length >= TICKET_TYPES.length}
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
