// Two fictional staff members, so the demo can show two-step sign-off with two different people.
export interface Staff {
  id: string;
  name: string;
  title: string;
}

export const STAFF: Staff[] = [
  { id: "aisyah", name: "Aisyah Rahman", title: "Bookkeeper" },
  { id: "daniel", name: "Daniel Lim", title: "Senior accountant" },
];

export const SELF: Staff = { id: "you", name: "You", title: "Owner" };

export function staffById(id: string): Staff {
  return STAFF.find((s) => s.id === id) ?? STAFF[0];
}
