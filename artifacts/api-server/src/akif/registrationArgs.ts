/** The role selects the form; it is not a form field. Every other argument, including unknown ones, is passed on so it is still reported as unknown. */
export function withoutRole(args: Record<string, unknown>): Record<string, unknown> {
  const { role: _role, ...details } = args;
  return details;
}
