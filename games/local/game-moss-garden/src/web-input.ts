// Pointer clicks can have detail=0 on touch browsers. They already committed on
// pointerup; keyboard and assistive activation have no physical pointer type.
export function isAccessibleActionClick(event: { detail: number; pointerType?: string }): boolean {
  return event.detail === 0 && !event.pointerType;
}
