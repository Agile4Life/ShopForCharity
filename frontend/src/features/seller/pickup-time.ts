// The shop schedules collections in Vietnam, independently of the device timezone.
export const pickupInstant = (value: string) => new Date(`${value}:00+07:00`);
