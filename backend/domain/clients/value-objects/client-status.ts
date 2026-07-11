export const clientStatuses = ['active', 'archived'] as const;
export type ClientStatus = (typeof clientStatuses)[number];
